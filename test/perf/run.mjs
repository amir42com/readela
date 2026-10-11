// Measures what Readela costs a page: scripting, layout, timers, memory.
//
//   node test/perf/run.mjs idle   [options]   a settled page, watched for a while
//   node test/perf/run.mjs work   [options]   streaming, typing, scrolling, navigating, bookmarking
//   node test/perf/run.mjs scale  [options]   0, 10, 100 and 1000 stored bookmarks
//   node test/perf/run.mjs fonts  [options]   which packaged fonts a page takes, and when
//   node test/perf/run.mjs memory [options]   memory of a settled page, state by state, several fresh browsers each
//   node test/perf/run.mjs allocators [options]  the same page's memory by allocator: what is held, and what is only kept
//   node test/perf/run.mjs soak   [options]   a long run, sampled for growth
//   node test/perf/run.mjs reuse  [options]   one case at a time: a block of work, the page left alone, the same block again
//   node test/perf/run.mjs firefox [options]  Firefox: processor time and memory of its processes
//   node test/perf/run.mjs micro              the stored-places functions alone, in Node
//
// Options:
//   --extension <dir>   the unpacked extension to measure (default dist/chrome)
//   --label <name>      a name for this build in the output (default "current")
//   --sites a,b         chatgpt, claude or both (default both)
//   --seconds <n>       how long one window lasts (idle: 60)
//   --repeat <n>        how many windows per case (idle: 3)
//   --minutes <n>       how long the soak lasts (default 15)
//   --settings <n>      soak: change the reading settings on every n-th cycle (default 1; 0 for never)
//   --allocators        soak: sample memory by allocator as well
//   --arms a,b          reuse: the cases, in the order they run (default control,night,night+sans;
//                       control is a browser without the extension, the others are reading states)
//   --cycles <n>        reuse: cycles in a block (default 150)
//   --period <ms>       reuse: how long one cycle lasts, work and pause together (default 6400)
//   --idle <s>          reuse: how long the page is left alone between the blocks (default 300)
//   --rest <s>          reuse: how long it is left alone after the second block (default as --idle)
//   --warm <n>          reuse: cycles before anything is measured (default 10)
//   --settle <s>        reuse: how long the warmed page is left before the first block (default 60)
//   --every <s>         reuse: how often the processes are read (default 5)
//   --diagnostic        reuse: force a collection before every memory dump (not a natural run)
//   --only a,b          only the cases with these names
//   --out <file>        where the results go (default test-results/perf-<suite>-<label>.json)
//
// Firefox offers no trace this script can read, so there the processor time
// and memory of the browser's own processes are compared between a browser
// without the extension and one with it (--extension then names the Firefox
// build, default dist/firefox).
//
// It uses the installed Chrome with a fresh temporary profile, serves a
// synthetic page (test/perf/fixtures/page.html) for the two supported hosts
// and lets nothing else through. Nothing here is part of the packaged
// extension. Numbers are from one machine and one browser version; they are
// compared with a baseline measured the same way, never read as absolute.
//
// Memory is counted in units of 1,048,576 bytes throughout. The earlier
// suites label that MB; `reuse` labels it Mib. In `soak` the browser without
// the extension does not select text or scroll to it as the bookmark steps
// of the other case do, and several browsers run at once: its two cases are
// not a matched pair. `reuse` is the matched comparison.

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getInstalledBrowsers } from "@puppeteer/browsers";
import puppeteer from "puppeteer-core";

import {
  conversationId,
  conversationKey,
  createPlace,
  findMark,
  fingerprint,
  indexMarks,
  messageKey,
  normalizeMarks,
  removeMark,
  saveMark,
} from "../../src/core/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const results = path.join(root, "test-results");
const pageSource = readFileSync(path.join(root, "test", "perf", "fixtures", "page.html"), "utf8");

const args = process.argv.slice(2);
const suite = args[0];
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const extension = path.resolve(option("--extension", path.join(root, "dist", suite === "firefox" ? "firefox" : "chrome")));
const label = option("--label", "current");
const sites = option("--sites", "chatgpt,claude").split(",");
const only = option("--only", "")?.split(",").filter(Boolean) ?? [];
const out = path.resolve(option("--out", path.join(results, `perf-${suite}-${label}.json`)));

const HOSTS = { chatgpt: "chatgpt.com", claude: "claude.ai" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? null : sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};
const round = (value, digits = 1) => (value === null || value === undefined ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const megabytes = (bytes) => round(bytes / 1048576, 1);
const mib = (bytes) => (bytes === null || bytes === undefined ? null : round(bytes / 1048576, 2));

function chromeExecutable() {
  const candidates = [
    process.env.READELA_CHROME,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

// ---------------------------------------------------------------------------
// Browser, page, storage

const DEFAULTS = { version: 2, enabled: true, direction: "auto", theme: "page", font: "page", size: "page", spacing: "page" };

/** The reading states that are measured. `null` is a browser without the extension. */
const STATES = {
  baseline: null,
  off: { enabled: false },
  default: {},
  paper: { theme: "paper" },
  night: { theme: "night" },
  sans: { font: "sans" },
  "paper+sans": { theme: "paper", font: "sans" },
  "night+sans": { theme: "night", font: "sans" },
  stress: { theme: "night", font: "sans", size: "140", spacing: "2.0" },
};

async function launch(withExtension, { standIn = false } = {}) {
  const browser = await puppeteer.launch({
    browser: "chrome",
    executablePath: chromeExecutable(),
    headless: true,
    pipe: true,
    enableExtensions: true,
    args: ["--window-size=1280,900"],
  });
  let id = null;
  let popup = null;
  if (withExtension) {
    id = await browser.installExtension(extension);
    popup = await browser.newPage();
    await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  } else if (standIn) {
    // An empty page where the other case has the popup, so that the page
    // measured is one of as many pages in both.
    await (await browser.newPage()).goto("about:blank");
  }
  const system = await browser.target().createCDPSession();
  return { browser, id, popup, system };
}

async function openSite(context, site, { turns = 12, rows = 28, conversation = 0, extra = "" } = {}) {
  const page = await context.browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const requests = [];
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    requests.push(url);
    if (/^chrome-extension:/.test(url)) return request.continue();
    if (request.resourceType() === "document" && new URL(url).host === HOSTS[site]) {
      return request.respond({ status: 200, contentType: "text/html; charset=utf-8", body: pageSource });
    }
    return request.abort();
  });
  const prefix = site === "claude" ? "chat" : "c";
  await page.goto(`https://${HOSTS[site]}/${prefix}/perf-conversation-${conversation}?turns=${turns}&rows=${rows}${extra}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.perfReady === true);
  const session = await page.createCDPSession();
  await session.send("Performance.enable");
  // The page follows the system: light or dark.
  const scheme = await page.evaluate(() => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  return { page, session, requests, site, scheme };
}

const setStored = (context, values) =>
  context.popup.evaluate((stored) => chrome.storage.local.set(stored), values);

/** Synthetic stored places: valid records for conversations that are not on the page. */
function syntheticMarks(count) {
  const hex = (value) => value.toString(16).padStart(16, "0");
  const items = Array.from({ length: count }, (_, index) => ({
    k: hex(0xa000000 + index),
    m: hex(0xb000000 + index),
    s: null,
    t: "p",
    f: hex(0xc000000 + index),
    i: index % 9,
    b: hex(0xd000000 + index),
    a: hex(0xe000000 + index),
    n: null,
    p: index % 1000,
  }));
  return { version: 2, items };
}

async function applyState(context, state, marks = 0) {
  if (context.popup === null) return;
  await setStored(context, { "readela.preferences": { ...DEFAULTS, ...STATES[state] }, "readela.marks": syntheticMarks(marks) });
}

/** The tab a page of the extension can message for this site page. */
async function tabOf(context) {
  return context.popup.evaluate(async () => {
    for (const tab of await chrome.tabs.query({})) {
      try {
        const answer = await chrome.tabs.sendMessage(tab.id, { readelaMark: "status" });
        if (answer?.site) return tab.id;
      } catch {
        // Not a page this extension runs on.
      }
    }
    return null;
  });
}

const ask = (context, tab, request) => context.popup.evaluate((id, word) => chrome.tabs.sendMessage(id, { readelaMark: word }), tab, request);

/** In the page, for a bookmark: a paragraph of the last reply but one is scrolled to and selected. */
const CHOOSE = () => {
  const paragraphs = document.querySelectorAll("#perf-content .turn:nth-last-child(2) p");
  const paragraph = paragraphs[paragraphs.length - 3];
  paragraph.scrollIntoView({ block: "center" });
  getSelection().selectAllChildren(paragraph);
};

/** Bookmark the conversation on the page, at the first paragraph of its last reply but one. */
async function bookmark(context, target, tab) {
  await target.page.bringToFront();
  await target.page.evaluate(CHOOSE);
  const answer = await ask(context, tab, "set");
  await target.page.evaluate(() => getSelection().removeAllRanges());
  return answer?.status;
}

/**
 * What `bookmark` does in the page, in a browser without the extension:
 * nothing is saved. The extension's save takes a few milliseconds (`reuse`
 * records both), too short a time to wait out here.
 */
async function shamBookmark(target) {
  await target.page.bringToFront();
  await target.page.evaluate(CHOOSE);
  await target.page.evaluate(() => getSelection().removeAllRanges());
}

/**
 * What a return does in the page, in a browser without the extension: the
 * same paragraph is scrolled, smoothly unless the system asks for less
 * motion, to a little below what covers the top of the conversation, and the
 * page is left until it rests. Nothing is marked.
 */
const shamReturn = (target) =>
  target.page.evaluate(
    () =>
      new Promise((resolve) => {
        const scroller = document.querySelector("#perf-scroller");
        const paragraphs = document.querySelectorAll("#perf-content .turn:nth-last-child(2) p");
        const paragraph = paragraphs[paragraphs.length - 3];
        const frame = scroller.getBoundingClientRect();
        const cover = document.querySelector(".bar, .header")?.getBoundingClientRect().height ?? 0;
        const want = frame.top + cover + Math.min((frame.height - cover) * 0.2, 120);
        const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
        scroller.scrollBy({ top: paragraph.getBoundingClientRect().top - want, behavior: calm ? "auto" : "smooth" });
        const began = performance.now();
        let top = null;
        const timer = setInterval(() => {
          const now = paragraph.getBoundingClientRect().top;
          if ((top !== null && Math.abs(now - top) < 1) || performance.now() - began > 2500) {
            clearInterval(timer);
            resolve();
          }
          top = now;
        }, 90);
      }),
  );

/**
 * One cycle of the long runs: another conversation, a reply, the sidebar,
 * scrolling and, with the extension, a bookmark saved, updated, returned to
 * on every other cycle and removed. With `sham`, a browser without the
 * extension does in the page what those steps do there. `timings` takes how
 * long each of those steps took, and `answers` counts what the extension
 * answered.
 */
async function oneCycle(context, target, tab, number, { sham = false, timings = null, answers = null } = {}) {
  const timed = async (name, step) => {
    const began = performance.now();
    const answer = await step();
    timings?.[name]?.push(performance.now() - began);
    if (answers && tab !== null) {
      const word = `${name}: ${typeof answer === "string" ? answer : (answer?.status ?? "no answer")}`;
      answers[word] = (answers[word] ?? 0) + 1;
    }
    return answer;
  };
  await target.page.evaluate((conversation) => window.perfNavigate(conversation), number % 9);
  await target.page.evaluate(() => window.perfStream(2500, 30));
  await target.page.evaluate(() => window.perfChurn(1500, 250));
  await target.page.evaluate(() => window.perfScroll(1500));
  if (tab !== null) {
    await timed("save", () => bookmark(context, target, tab));
    await timed("save", () => bookmark(context, target, tab));
    if (number % 2 === 0) await timed("return", () => ask(context, tab, "go"));
    await timed("remove", () => ask(context, tab, "clear"));
  } else if (sham) {
    await timed("save", () => shamBookmark(target));
    await timed("save", () => shamBookmark(target));
    if (number % 2 === 0) await timed("return", () => shamReturn(target));
  }
}

// ---------------------------------------------------------------------------
// Measuring

const CATEGORIES = ["-*", "devtools.timeline", "disabled-by-default-devtools.timeline", "toplevel", "v8.execute"];

/** The renderer process that shows a page, from a short trace. */
async function rendererOf(target) {
  await target.page.tracing.start({ categories: CATEGORIES });
  await sleep(150);
  const events = JSON.parse(Buffer.from(await target.page.tracing.stop()).toString("utf8")).traceEvents;
  return framePid(events, target.site);
}

function framePid(events, site) {
  for (const event of events) {
    if (event.name !== "TracingStartedInBrowser") continue;
    const frame = event.args?.data?.frames?.find((entry) => (entry.url ?? "").includes(HOSTS[site]));
    if (frame) return frame.processId;
  }
  return null;
}

/**
 * What a trace says about one page: time the main thread was busy, time in
 * scripts by where the script came from, layout and style work, long tasks.
 */
function analyse(events, { pid, extensionId, seconds }) {
  const main = events.find((event) => event.ph === "M" && event.name === "thread_name" && event.pid === pid && event.args?.name === "CrRendererMain")?.tid;
  const mine = events.filter((event) => event.pid === pid && event.tid === main && event.ph === "X");
  const sum = (list) => list.reduce((total, event) => total + (event.dur ?? 0), 0) / 1000;
  const named = (name) => mine.filter((event) => event.name === name);
  const tasks = named("RunTask");
  const prefix = extensionId ? `chrome-extension://${extensionId}/` : "\u0000";
  const calls = mine.filter((event) => event.name === "FunctionCall" || event.name === "EvaluateScript");
  const ours = calls.filter((event) => (event.args?.data?.url ?? "").startsWith(prefix));
  // A call inside another call of the extension's is counted once.
  const outer = ours.filter((event) => !ours.some((other) => other !== event && other.ts <= event.ts && other.ts + other.dur >= event.ts + event.dur));
  const timers = named("TimerFire");
  const ourTimers = timers.filter((timer) => outer.some((call) => call.ts >= timer.ts && call.ts <= timer.ts + Math.max(timer.dur ?? 0, 1) + 500));
  const long = tasks.filter((task) => task.dur > 50000);
  // Other processes: the extension's own (its service worker and pages).
  const elsewhere = events.filter(
    (event) => event.ph === "X" && event.pid !== pid && (event.name === "FunctionCall" || event.name === "EvaluateScript") && (event.args?.data?.url ?? "").includes("/background.js"),
  );
  return {
    seconds,
    busyMs: round(sum(tasks), 1),
    scriptMs: round(sum(calls), 1),
    extensionMs: round(sum(outer), 2),
    extensionCalls: outer.length,
    extensionCallsPerSecond: round(outer.length / seconds, 2),
    extensionTimerCalls: ourTimers.length,
    extensionLongestMs: round(Math.max(0, ...outer.map((event) => event.dur ?? 0)) / 1000, 2),
    layoutMs: round(sum(named("Layout")), 1),
    layouts: named("Layout").length,
    styleMs: round(sum(named("UpdateLayoutTree")), 1),
    styles: named("UpdateLayoutTree").length,
    gcMs: round(sum(mine.filter((event) => event.name === "MinorGC" || event.name === "MajorGC")), 1),
    longTasks: long.length,
    longestTaskMs: round(Math.max(0, ...tasks.map((task) => task.dur ?? 0)) / 1000, 1),
    backgroundCalls: elsewhere.length,
    backgroundMs: round(sum(elsewhere), 2),
  };
}

async function cpuSeconds(context, pid) {
  const { processInfo } = await context.system.send("SystemInfo.getProcessInfo");
  return processInfo.find((entry) => entry.id === pid)?.cpuTime ?? null;
}

/** Private and working-set memory of processes, from the operating system. */
function processMemory(pids) {
  if (process.platform !== "win32" || pids.length === 0) return {};
  try {
    const script = `Get-Process -Id ${pids.join(",")} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id) $($_.PrivateMemorySize64) $($_.WorkingSet64)" }`;
    const text = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
    return Object.fromEntries(
      text.trim().split(/\r?\n/).filter(Boolean).map((line) => {
        const [id, priv, working] = line.trim().split(/\s+/).map(Number);
        return [id, { privateMb: megabytes(priv), workingMb: megabytes(working) }];
      }),
    );
  } catch {
    return {};
  }
}

async function memoryOf(target, pid) {
  await target.session.send("HeapProfiler.collectGarbage").catch(() => {});
  const { metrics } = await target.session.send("Performance.getMetrics");
  const value = (name) => metrics.find((metric) => metric.name === name)?.value ?? null;
  const system = processMemory([pid])[pid] ?? {};
  return {
    heapMb: megabytes(value("JSHeapUsedSize")),
    nodes: value("Nodes"),
    listeners: value("JSEventListeners"),
    privateMb: system.privateMb ?? null,
    workingMb: system.workingMb ?? null,
  };
}

/**
 * The page process's memory by allocator, from the browser's own memory dump,
 * after two forced collections. "Live" is what is still held; "pages" is what
 * an allocator has taken from the system, including what it has freed and
 * keeps for reuse. The collected heap is the browser's (layout, style, DOM),
 * not JavaScript's.
 */
async function allocatorsOf(context, target, pid) {
  const dump = await dumpOf(context, target, pid, { collect: true });
  // A dump that is not valid gives no numbers; before, it gave zeros.
  return {
    collectedLiveMb: dump.collectedHeldMib,
    collectedPagesMb: dump.collectedHeapMib,
    mallocLiveMb: dump.mallocHeldMib,
    mallocPagesMb: dump.mallocPartitionMib,
    fontFilesMb: dump.fontFilesMib,
    mediaQueryObjectsMb: dump.mediaQueryObjectsMib,
  };
}

/**
 * A memory dump of the page's process, as the browser accounts for it.
 * Nothing is collected first unless `collect` is set, so a dump taken in the
 * course of a run shows the heaps as the run left them. For the browser's
 * collected heap (layout, style, DOM; not JavaScript's) the dump tells apart
 * what the heap has taken from the system ("heap", "committed"), what is
 * allocated in it ("held", which before a collection includes what is no
 * longer reachable), what lies free on its lists for reuse and what it
 * keeps pooled. A dump that does not hold the process or lacks that heap is
 * not valid: its numbers are absent, never zero. `raw` is the process's
 * whole dump.
 */
async function dumpOf(context, target, pid, { collect = false } = {}) {
  if (collect) await collectNow(target);
  let raw = {};
  let answer = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const chunks = [];
    const gather = ({ value }) => chunks.push(...value);
    context.system.on("Tracing.dataCollected", gather);
    const done = new Promise((resolve) => context.system.once("Tracing.tracingComplete", resolve));
    await context.system.send("Tracing.start", {
      traceConfig: { includedCategories: ["disabled-by-default-memory-infra"], memoryDumpConfig: { triggers: [] } },
      transferMode: "ReportEvents",
    });
    await sleep(200);
    answer = await context.system.send("Tracing.requestMemoryDump", { levelOfDetail: "detailed" }).catch((error) => ({ success: false, error: String(error) }));
    await sleep(300);
    await context.system.send("Tracing.end");
    await done;
    context.system.off("Tracing.dataCollected", gather);
    // A process's dump comes in several events, each with allocators of its own.
    raw = {};
    for (const event of chunks) {
      if (event.ph !== "v" || event.pid !== pid) continue;
      const { allocators, allocators_graph: graph, ...others } = event.args?.dumps ?? {};
      Object.assign(raw, others);
      raw.allocators = { ...raw.allocators, ...allocators };
      raw.allocators_graph = [...(raw.allocators_graph ?? []), ...(graph ?? [])];
    }
    if (answer.success === true && raw.allocators?.["blink_gc/main/heap"]?.attrs?.size && raw.allocators?.malloc?.attrs?.size) break;
  }
  const allocators = raw.allocators ?? {};
  const bytes = (name, attribute = "size") => {
    const entry = allocators[name]?.attrs?.[attribute];
    return entry ? parseInt(entry.value, 16) : null;
  };
  const valid = answer.success === true && bytes("blink_gc/main/heap") !== null && bytes("malloc") !== null;
  if (!valid) return { valid, collected: collect, reason: answer.error ?? (answer.success === true ? "the process is not in the dump" : "the browser refused the dump"), raw };
  const total = (test, attribute = "size") =>
    Object.keys(allocators).reduce((sum, name) => (test(name) ? sum + (bytes(name, attribute) ?? 0) : sum), 0);
  return {
    valid,
    collected: collect,
    privateFootprintMib: mib(raw.process_totals?.private_footprint_bytes ? parseInt(raw.process_totals.private_footprint_bytes, 16) : null),
    collectedHeapMib: mib(bytes("blink_gc/main/heap")),
    collectedCommittedMib: mib(bytes("blink_gc/main/heap", "committed_size")),
    collectedHeldMib: mib(bytes("blink_gc/main/heap", "allocated_objects_size")),
    collectedFreeListsMib: mib(total((name) => /^blink_gc\/main\/heap\/[^/]+\/freelist\/[^/]+$/.test(name), "free_usable_size")),
    collectedPooledMib: mib(bytes("blink_gc/main/heap", "pooled_size")),
    mallocMib: mib(bytes("malloc")),
    mallocHeldMib: mib(bytes("malloc/allocated_objects")),
    mallocPartitionMib: mib(bytes("malloc/partitions/allocator")),
    mallocPartitionCommittedMib: mib(bytes("malloc/partitions/allocator", "virtual_committed_size")),
    mallocPartitionHeldMib: mib(bytes("malloc/partitions/allocator", "allocated_objects_size")),
    mallocPartitionDecommittableMib: mib(bytes("malloc/partitions/allocator", "decommittable_size")),
    bufferPartitionCommittedMib: mib(bytes("partition_alloc/partitions/buffer", "virtual_committed_size")),
    bufferPartitionHeldMib: mib(bytes("partition_alloc/partitions/buffer", "allocated_objects_size")),
    javascriptHeapMib: mib(bytes("v8/main/heap")),
    fontFilesMib: mib(bytes("web_cache/Font_resources") ?? 0),
    fontCachesMib: mib(total((name) => /^font_caches\/[^/]+$/.test(name))),
    compositorMib: mib(bytes("cc") ?? 0),
    drawingMib: mib(bytes("skia") ?? 0),
    mediaQueryObjectsMib: mib(total((name) => /^blink_objects\/blink_gc\/main\/.*MediaQuery/.test(name))),
    raw,
  };
}

/**
 * Make the page's process collect what is no longer reachable, twice, and
 * let it finish. Returns whether the browser did as asked.
 */
async function collectNow(target) {
  let done = true;
  for (let pass = 0; pass < 2; pass += 1) {
    await target.session.send("HeapProfiler.collectGarbage").catch(() => {
      done = false;
    });
  }
  await sleep(800);
  return done;
}

/** What the page's process counts by itself. Nothing is collected to read it. */
async function countersOf(target) {
  const { metrics } = await target.session.send("Performance.getMetrics");
  const value = (name) => metrics.find((metric) => metric.name === name)?.value ?? null;
  const heap = await target.session.send("Runtime.getHeapUsage").catch(() => ({}));
  return {
    javascriptUsedMib: mib(value("JSHeapUsedSize")),
    javascriptTotalMib: mib(value("JSHeapTotalSize")),
    collectedUsedMib: mib(heap.embedderHeapUsedSize),
    nodes: value("Nodes"),
    listeners: value("JSEventListeners"),
    layoutObjects: value("LayoutObjects"),
    layouts: value("LayoutCount"),
    styles: value("RecalcStyleCount"),
    // Seconds on the page's main thread since the page was opened.
    layoutSeconds: round(value("LayoutDuration"), 3),
    styleSeconds: round(value("RecalcStyleDuration"), 3),
    scriptSeconds: round(value("ScriptDuration"), 3),
    taskSeconds: round(value("TaskDuration"), 3),
  };
}

/**
 * The memory of processes, read from the operating system at a steady
 * interval by one helper that is started once and asks nothing of the
 * browser. Each reading also says how busy the whole machine was since the
 * one before, all processors together. While it runs the helper asks the
 * system to stay awake with its display on, as a player of a film does, so
 * that a machine left alone does not go to sleep in the middle of a case;
 * the request ends with the helper and changes no setting.
 */
function watchProcesses(pids, seconds) {
  const script = [
    "Add-Type -Namespace Measure -Name Awake -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint flags);'",
    "[void][Measure.Awake]::SetThreadExecutionState([uint32]2147483651)", // continuous, system and display required
    `$ids = @(${pids.join(",")})`,
    '$busy = New-Object System.Diagnostics.PerformanceCounter("Processor", "% Processor Time", "_Total")',
    "[void]$busy.NextValue()",
    `while ($true) { Start-Sleep -Milliseconds ${Math.round(seconds * 1000)}`,
    '$found = foreach ($p in Get-Process -Id $ids -ErrorAction SilentlyContinue) { "$($p.Id):$($p.PrivateMemorySize64):$($p.WorkingSet64)" }',
    '[Console]::Out.WriteLine("$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) $([math]::Round($busy.NextValue(), 2)) $($found -join " ")") }',
  ].join("; ");
  const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["ignore", "pipe", "ignore"] });
  const samples = [];
  let rest = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (text) => {
    const lines = (rest + text).split(/\r?\n/);
    rest = lines.pop();
    for (const line of lines) {
      const [at, busy, ...entries] = line.trim().split(/\s+/);
      if (!at) continue;
      const processes = {};
      for (const entry of entries) {
        const [id, priv, working] = entry.split(":").map(Number);
        processes[id] = { privateMib: mib(priv), workingMib: mib(working) };
      }
      samples.push({ at: Number(at), machineBusyPercent: Number(busy), processes });
    }
  });
  return { pids, samples, stop: () => child.kill() };
}

/** Every process on the machine: its name, the processor time it has used and its working set. */
function census() {
  const script = 'Get-Process | ForEach-Object { "$($_.Id)|$($_.ProcessName)|$([long]$_.TotalProcessorTime.TotalMilliseconds)|$($_.WorkingSet64)" }';
  const text = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return {
    at: Date.now(),
    processes: text.trim().split(/\r?\n/).map((line) => {
      const [id, name, cpu, working] = line.trim().split("|");
      return { id: Number(id), name, cpuSeconds: Number(cpu) / 1000, workingMib: mib(Number(working)) };
    }),
  };
}

/**
 * What else ran between two censuses: processor seconds by program, for
 * every process there at the end (the browser measured has closed by then).
 * A process the system does not let be read counts as none.
 */
function elsewhere(before, after) {
  const earlier = new Map(before.processes.map((entry) => [`${entry.id} ${entry.name}`, entry.cpuSeconds]));
  const byName = new Map();
  for (const entry of after.processes) {
    const used = entry.cpuSeconds - (earlier.get(`${entry.id} ${entry.name}`) ?? 0);
    const sum = byName.get(entry.name) ?? { program: entry.name, processes: 0, cpuSeconds: 0, workingMib: 0 };
    sum.processes += 1;
    sum.cpuSeconds += used;
    sum.workingMib += entry.workingMib;
    byName.set(entry.name, sum);
  }
  const seconds = (after.at - before.at) / 1000;
  const programs = [...byName.values()].map((sum) => ({ ...sum, cpuSeconds: round(sum.cpuSeconds, 1), workingMib: round(sum.workingMib, 0) }));
  return {
    seconds: round(seconds, 0),
    processes: after.processes.length,
    cpuSeconds: round(programs.reduce((sum, entry) => sum + entry.cpuSeconds, 0), 1),
    busiest: programs.sort((a, b) => b.cpuSeconds - a.cpuSeconds).slice(0, 12),
    programsRunning: [...byName.keys()].sort(),
  };
}

/** What a result came from: the browser, the build measured, this script and its page. */
function identity(chrome) {
  const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
  const filesIn = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)],
    );
  const files = filesIn(extension).map((file) => path.relative(extension, file).replaceAll("\\", "/")).sort();
  // One digest for the whole build: every file's path and digest, in order.
  const tree = createHash("sha256");
  for (const file of files) tree.update(`${digest(path.join(extension, file))}  ${file}\n`);
  const git = (...words) => {
    try {
      return execFileSync("git", words, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return null;
    }
  };
  return {
    chrome,
    chromeExecutable: chromeExecutable(),
    extension: {
      directory: extension,
      version: JSON.parse(readFileSync(path.join(extension, "manifest.json"), "utf8")).version,
      files: files.length,
      treeSha256: tree.digest("hex"),
    },
    script: { file: "test/perf/run.mjs", sha256: digest(fileURLToPath(import.meta.url)) },
    page: { file: "test/perf/fixtures/page.html", sha256: digest(path.join(root, "test", "perf", "fixtures", "page.html")) },
    source: { commit: git("rev-parse", "HEAD"), uncommitted: git("status", "--porcelain") },
    host: {
      system: `${os.type()} ${os.release()}`,
      processor: os.cpus()[0]?.model ?? null,
      logicalProcessors: os.cpus().length,
      memoryGib: round(os.totalmem() / 2 ** 30, 1),
      node: process.version,
    },
  };
}

/** Record a trace while `work` runs, and read it. */
async function traced(context, target, pid, seconds, work) {
  const before = await cpuSeconds(context, pid);
  await target.page.tracing.start({ categories: CATEGORIES });
  const began = Date.now();
  await work();
  const elapsed = (Date.now() - began) / 1000;
  const events = JSON.parse(Buffer.from(await target.page.tracing.stop()).toString("utf8")).traceEvents;
  const after = await cpuSeconds(context, pid);
  const facts = analyse(events, { pid, extensionId: context.id, seconds: seconds ?? elapsed });
  facts.cpuSeconds = before === null || after === null ? null : round(after - before, 3);
  facts.cpuPercent = facts.cpuSeconds === null ? null : round((facts.cpuSeconds / elapsed) * 100, 2);
  return facts;
}

const rows = [];
const record = (row) => {
  rows.push(row);
  const { site, state, test, ...rest } = row;
  console.log(`${site.padEnd(8)} ${String(state).padEnd(11)} ${String(test).padEnd(22)} ${JSON.stringify(rest)}`);
};

function finish(extra = {}) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ suite, label, extension, when: new Date().toISOString(), ...extra, rows }, null, 1)}\n`);
  console.log(`\nresults: ${path.relative(root, out)}`);
}

const wanted = (name) => only.length === 0 || only.includes(name);

// In groups, so that several browsers are measured side by side without
// starving one another.
async function inGroups(items, size, run) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(run));
  }
}

// ---------------------------------------------------------------------------
// idle: a settled page, watched

async function idle() {
  const seconds = Number(option("--seconds", 60));
  const repeat = Number(option("--repeat", 3));
  const cases = [];
  for (const site of sites) {
    for (const state of Object.keys(STATES)) cases.push({ site, state, name: state });
    // Bookmarks present: several, and many; the conversation shown has one.
    cases.push({ site, state: "default", name: "default+10", marks: 9, bookmarked: true });
    cases.push({ site, state: "default", name: "default+1000", marks: 999, bookmarked: true });
    cases.push({ site, state: "night+sans", name: "night+sans+1000", marks: 999, bookmarked: true });
    // A long conversation and a heavy sidebar.
    cases.push({ site, state: "baseline", name: "baseline long", turns: 60, rows: 300 });
    cases.push({ site, state: "off", name: "off long", turns: 60, rows: 300 });
    cases.push({ site, state: "default", name: "default long", turns: 60, rows: 300 });
    cases.push({ site, state: "night+sans", name: "night+sans long+1000", turns: 60, rows: 300, marks: 999, bookmarked: true });
  }
  await inGroups(cases.filter((entry) => wanted(entry.name)), 4, async (entry) => {
    const context = await launch(STATES[entry.state] !== null);
    try {
      await applyState(context, entry.state, entry.marks ?? 0);
      const target = await openSite(context, entry.site, { turns: entry.turns, rows: entry.rows });
      if (entry.bookmarked) {
        const status = await bookmark(context, target, await tabOf(context));
        if (status !== "saved") throw new Error(`${entry.name}: bookmark ${status}`);
      }
      await target.page.bringToFront();
      await sleep(6000); // warm up: fonts, first marks, the first beats
      const pid = await rendererOf(target);
      const windows = [];
      for (let run = 0; run < repeat; run += 1) {
        windows.push(await traced(context, target, pid, seconds, () => sleep(seconds * 1000)));
      }
      const memory = await memoryOf(target, pid);
      const pick = (key) => median(windows.map((window) => window[key]));
      record({
        site: entry.site,
        state: entry.name,
        test: `idle ${seconds}s x${repeat}`,
        siteTheme: target.scheme,
        turns: entry.turns ?? 12,
        bookmarks: entry.bookmarked ? (entry.marks ?? 0) + 1 : (entry.marks ?? 0),
        cpuPercent: pick("cpuPercent"),
        cpuPercentRange: [Math.min(...windows.map((w) => w.cpuPercent)), Math.max(...windows.map((w) => w.cpuPercent))],
        busyMs: pick("busyMs"),
        extensionMs: pick("extensionMs"),
        extensionCalls: pick("extensionCalls"),
        extensionTimerCalls: pick("extensionTimerCalls"),
        extensionLongestMs: Math.max(...windows.map((w) => w.extensionLongestMs)),
        layoutMs: pick("layoutMs"),
        styleMs: pick("styleMs"),
        longTasks: Math.max(...windows.map((w) => w.longTasks)),
        backgroundCalls: Math.max(...windows.map((w) => w.backgroundCalls)),
        ...memory,
      });
    } finally {
      await context.browser.close();
    }
  });
  finish({ seconds, repeat });
}

// ---------------------------------------------------------------------------
// work: what a page and a reader do

async function work() {
  const repeat = Number(option("--repeat", 3));
  const cases = [];
  for (const site of sites) {
    for (const state of ["baseline", "off", "default", "night+sans"]) cases.push({ site, state, name: state });
    cases.push({ site, state: "night+sans", name: "night+sans+1000", marks: 999, bookmarked: true });
  }
  const WORKLOADS = {
    "streaming 10s": (target) => target.page.evaluate(() => window.perfStream(10000, 30)),
    "after streaming 5s": () => sleep(5000),
    "typing 8s": (target) => target.page.evaluate(() => window.perfType(8000, 80)),
    "sidebar churn 8s": (target) => target.page.evaluate(() => window.perfChurn(8000, 250)),
    "scrolling 6s": (target) => target.page.evaluate(() => window.perfScroll(6000)),
    "navigating x6": async (target) => {
      for (let step = 1; step <= 6; step += 1) {
        await target.page.evaluate((conversation) => window.perfNavigate(conversation), step);
        await sleep(700);
      }
      await target.page.evaluate(() => window.perfNavigate(0));
      await sleep(700);
    },
  };
  await inGroups(cases.filter((entry) => wanted(entry.name)), 3, async (entry) => {
    const context = await launch(STATES[entry.state] !== null);
    try {
      await applyState(context, entry.state, entry.marks ?? 0);
      const target = await openSite(context, entry.site, { turns: 12, rows: 28 });
      const tab = context.popup === null ? null : await tabOf(context);
      if (entry.bookmarked) await bookmark(context, target, tab);
      await target.page.bringToFront();
      await sleep(4000);
      const pid = await rendererOf(target);
      for (const [name, run] of Object.entries(WORKLOADS)) {
        const windows = [];
        for (let pass = 0; pass < repeat; pass += 1) {
          windows.push(await traced(context, target, pid, null, () => run(target)));
          if (name === "streaming 10s") break; // the page grows with every pass; once is the comparison
        }
        const pick = (key) => median(windows.map((window) => window[key]));
        record({
          site: entry.site,
          state: entry.name,
          test: name,
          cpuPercent: pick("cpuPercent"),
          busyMs: pick("busyMs"),
          scriptMs: pick("scriptMs"),
          extensionMs: pick("extensionMs"),
          extensionCalls: pick("extensionCalls"),
          extensionLongestMs: Math.max(...windows.map((w) => w.extensionLongestMs)),
          layoutMs: pick("layoutMs"),
          styleMs: pick("styleMs"),
          longTasks: Math.max(...windows.map((w) => w.longTasks)),
          longestTaskMs: Math.max(...windows.map((w) => w.longestTaskMs)),
        });
      }
      // What the reader does through the extension: settings and bookmarks.
      if (context.popup !== null && STATES[entry.state]?.enabled !== false) {
        const settings = await traced(context, target, pid, null, async () => {
          for (const change of [{ theme: "paper" }, { theme: "night" }, { font: "sans" }, { font: "page" }, { direction: "rtl" }, { direction: "auto" }, { size: "125" }, { spacing: "1.75" }, { size: "page", spacing: "page" }]) {
            await setStored(context, { "readela.preferences": { ...DEFAULTS, ...STATES[entry.state], ...change } });
            await sleep(400);
          }
          await setStored(context, { "readela.preferences": { ...DEFAULTS, ...STATES[entry.state] } });
          await sleep(400);
        });
        record({ site: entry.site, state: entry.name, test: "settings x10", ...settings });
        const marks = await traced(context, target, pid, null, async () => {
          for (let pass = 0; pass < 3; pass += 1) {
            await bookmark(context, target, tab); // Bookmark or Update
            await target.page.evaluate(() => {
              const scroller = document.querySelector("#perf-scroller");
              scroller.scrollTop = scroller.scrollTop > -10 && scroller.scrollTop < 10 ? (document.body.className === "claude" ? 0 : -scroller.scrollHeight) : 0;
            });
            await ask(context, tab, "go");
            await bookmark(context, target, tab);
            await ask(context, tab, "clear");
          }
        });
        record({ site: entry.site, state: entry.name, test: "bookmark, return, update, remove x3", ...marks });
        const settle = await traced(context, target, pid, 5, () => sleep(5000));
        record({ site: entry.site, state: entry.name, test: "back to idle 5s", ...settle });
      }
      record({ site: entry.site, state: entry.name, test: "memory after work", ...(await memoryOf(target, pid)) });
    } finally {
      await context.browser.close();
    }
  });
  finish({ repeat });
}

// ---------------------------------------------------------------------------
// scale: how the cost follows the number of stored bookmarks

async function scale() {
  for (const site of sites) {
    for (const count of [0, 10, 100, 1000]) {
      const context = await launch(true);
      try {
        // One less than the count: the conversation shown gets the last one.
        await applyState(context, "default", Math.max(0, count - 1));
        const target = await openSite(context, site, { turns: 12, rows: 300 });
        const tab = await tabOf(context);
        await target.page.bringToFront();
        await sleep(3000);
        const pid = await rendererOf(target);
        const timed = async (action) => {
          const began = performance.now();
          await action();
          return performance.now() - began;
        };
        const saves = [];
        const updates = [];
        const removes = [];
        for (let pass = 0; pass < 5; pass += 1) {
          if (count > 0) saves.push(await timed(() => bookmark(context, target, tab)));
          if (count > 0) updates.push(await timed(() => bookmark(context, target, tab)));
          if (count > 0) removes.push(await timed(() => ask(context, tab, "clear")));
        }
        if (count > 0) await bookmark(context, target, tab);
        const stored = await context.popup.evaluate(async () => {
          const marks = (await chrome.storage.local.get("readela.marks"))["readela.marks"];
          return { items: marks.items.length, bytes: JSON.stringify(marks).length };
        });
        const quiet = await traced(context, target, pid, 20, () => sleep(20000));
        const churn = await traced(context, target, pid, null, () => target.page.evaluate(() => window.perfChurn(8000, 250)));
        const stream = await traced(context, target, pid, null, () => target.page.evaluate(() => window.perfStream(8000, 30)));
        // The popup: from opening it to the total being shown.
        const popup = await context.browser.newPage();
        const opened = await timed(async () => {
          await popup.goto(`chrome-extension://${context.id}/popup/popup.html?tab=${tab}`);
          await popup.waitForFunction(() => /total$/.test(document.querySelector("#place-total, #place-state")?.textContent ?? ""), { polling: 20 });
        });
        const total = await popup.evaluate(() => document.querySelector("#place-total, #place-state").textContent);
        await popup.close();
        record({
          site,
          state: `default, ${count} stored`,
          test: "scale",
          stored: stored.items,
          storedBytes: stored.bytes,
          saveMs: round(median(saves), 1),
          updateMs: round(median(updates), 1),
          removeMs: round(median(removes), 1),
          idleExtensionMs20s: quiet.extensionMs,
          idleExtensionCalls20s: quiet.extensionCalls,
          churnExtensionMs: churn.extensionMs,
          churnExtensionCalls: churn.extensionCalls,
          streamExtensionMs: stream.extensionMs,
          popupOpenMs: round(opened, 0),
          popupTotal: total,
          ...(await memoryOf(target, pid)),
        });
      } finally {
        await context.browser.close();
      }
    }
  }
  finish();
}

// ---------------------------------------------------------------------------
// fonts: which packaged fonts a page takes, and when

async function fonts() {
  // What a page took from the extension, by file, with how many times.
  const taken = (target) => {
    const counts = {};
    for (const url of target.requests) {
      if (!/^chrome-extension:.*\.woff2$/.test(url)) continue;
      const name = url.split("/").pop();
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => `${name} x${count}`).sort();
  };
  const faces = (target) =>
    target.page.evaluate(() => [...document.fonts].filter((face) => face.status === "loaded").map((face) => `${face.family.replace(/"/g, "")} ${face.style}`).sort());
  const purged = async (context, target, pid) => {
    await context.system.send("Memory.simulatePressureNotification", { level: "critical" }).catch(() => {});
    await sleep(2500);
    return (await memoryOf(target, pid)).privateMb;
  };
  for (const site of sites) {
    for (const [name, state, extra] of [
      ["Original font, mixed text", "default", ""],
      ["Paper, Original font, mixed text", "paper", ""],
      ["Readela Sans, English, no emphasis", "sans", "&lang=en&em=0"],
      ["Readela Sans, English with emphasis", "sans", "&lang=en"],
      ["Readela Sans, Persian, no emphasis", "sans", "&lang=fa&em=0"],
      ["Readela Sans, mixed text with emphasis", "sans", ""],
      ["Night + Readela Sans, mixed text with emphasis", "night+sans", ""],
    ]) {
      const context = await launch(true);
      try {
        await applyState(context, state);
        const target = await openSite(context, site, { turns: 12, extra });
        await target.page.bringToFront();
        await sleep(3500);
        const pid = await rendererOf(target);
        const first = taken(target);
        const loaded = await faces(target);
        // Rendering the conversation again several times fetches nothing again.
        for (let step = 1; step <= 5; step += 1) {
          await target.page.evaluate((conversation) => window.perfNavigate(conversation), step);
          await sleep(500);
        }
        const after = taken(target);
        const withFonts = await purged(context, target, pid);
        // Back to Original: the faces are no longer used by anything.
        await setStored(context, { "readela.preferences": { ...DEFAULTS, ...STATES[state], font: "page" } });
        await sleep(1500);
        const original = await purged(context, target, pid);
        record({
          site,
          state: name,
          test: "fonts",
          files: first,
          loadedFaces: loaded,
          filesAfterFiveRenders: after,
          requestsElsewhere: target.requests.filter((url) => !/^chrome-extension:|^https:\/\/(chatgpt\.com|claude\.ai)\//.test(url)).length,
          privateMbUnderPressure: withFonts,
          privateMbUnderPressureBackOnOriginal: original,
        });
      } finally {
        await context.browser.close();
      }
    }
  }
  finish();
}

// ---------------------------------------------------------------------------
// memory: a settled page, state by state
//
// The private memory of a browser process differs by megabytes from one start
// to the next, so each state is started several times in a browser of its own
// and the middle value is reported, with the lowest and the highest.

async function memory() {
  const repeat = Number(option("--repeat", 5));
  const cases = [];
  for (const site of sites) {
    for (const turns of [12, 60]) {
      for (const state of ["baseline", "off", "default", "night", "sans", "night+sans"]) {
        if (wanted(state)) cases.push({ site, turns, state });
      }
    }
  }
  for (const entry of cases) {
    const samples = [];
    await inGroups(Array.from({ length: repeat }), 5, async () => {
      const context = await launch(STATES[entry.state] !== null);
      try {
        await applyState(context, entry.state);
        const target = await openSite(context, entry.site, { turns: entry.turns, rows: entry.turns === 60 ? 300 : 28 });
        await target.page.bringToFront();
        await sleep(8000);
        const pid = await rendererOf(target);
        const settled = await memoryOf(target, pid);
        // What is still held once the browser is told that memory is short:
        // freed memory a process keeps for reuse is given back then.
        await context.system.send("Memory.simulatePressureNotification", { level: "critical" }).catch(() => {});
        await sleep(2500);
        const purged = await memoryOf(target, pid);
        samples.push({ ...settled, purgedMb: purged.privateMb });
      } finally {
        await context.browser.close();
      }
    });
    const of = (key) => samples.map((sample) => sample[key]);
    record({
      site: entry.site,
      state: entry.state,
      test: `memory, ${entry.turns} turns, ${repeat} browsers`,
      turns: entry.turns,
      privateMb: median(of("privateMb")),
      privateMbRange: [Math.min(...of("privateMb")), Math.max(...of("privateMb"))],
      privateMbUnderPressure: median(of("purgedMb")),
      privateMbUnderPressureRange: [Math.min(...of("purgedMb")), Math.max(...of("purgedMb"))],
      heapMb: median(of("heapMb")),
      nodes: median(of("nodes")),
    });
  }
  finish({ repeat });
}

// ---------------------------------------------------------------------------
// allocators: a settled page's memory by allocator

async function allocators() {
  for (const site of sites) {
    for (const turns of [12, 60]) {
      for (const state of ["off", "default", "night", "sans", "night+sans"].filter(wanted)) {
        const context = await launch(true);
        try {
          await applyState(context, state);
          const target = await openSite(context, site, { turns, rows: turns === 60 ? 300 : 28 });
          await target.page.bringToFront();
          await sleep(6000);
          const pid = await rendererOf(target);
          record({ site, state, test: `allocators, ${turns} turns`, turns, ...(await allocatorsOf(context, target, pid)) });
        } finally {
          await context.browser.close();
        }
      }
    }
  }
  finish();
}

// ---------------------------------------------------------------------------
// soak: a long run, sampled

async function soak() {
  const minutes = Number(option("--minutes", 15));
  const settingsEvery = Number(option("--settings", 1));
  const byAllocator = args.includes("--allocators");
  await Promise.all(
    sites.flatMap((site) =>
      ["baseline", "night+sans"].filter(wanted).map(async (state) => {
        const context = await launch(STATES[state] !== null);
        try {
          await applyState(context, state, 20);
          const target = await openSite(context, site, { turns: 12, rows: 60 });
          const tab = context.popup === null ? null : await tabOf(context);
          await target.page.bringToFront();
          await sleep(3000);
          const pid = await rendererOf(target);
          const began = Date.now();
          const samples = [];
          let cycle = 0;
          while (Date.now() - began < minutes * 60000) {
            cycle += 1;
            // One cycle: another conversation, a reply, the sidebar, scrolling,
            // and, with the extension, bookmarks and settings.
            await oneCycle(context, target, tab, cycle);
            if (tab !== null && settingsEvery > 0 && cycle % settingsEvery === 0) {
              const theme = ["paper", "night", "page"][cycle % 3];
              const font = cycle % 2 ? "sans" : "page";
              await setStored(context, { "readela.preferences": { ...DEFAULTS, ...STATES[state], theme, font } });
              await sleep(300);
              await setStored(context, { "readela.preferences": { ...DEFAULTS, ...STATES[state] } });
            }
            await sleep(500);
            if (cycle % (byAllocator ? 24 : 4) === 0) {
              const memory = await memoryOf(target, pid);
              if (byAllocator) Object.assign(memory, await allocatorsOf(context, target, pid));
              samples.push({ minute: round((Date.now() - began) / 60000, 2), cycle, ...memory });
              console.log(`${site} ${state} ${JSON.stringify(samples.at(-1))}`);
            }
          }
          // Growth after the first third, by a straight line through the samples.
          const slope = (key) => {
            // A sample whose dump was not valid has no number for this.
            const settled = samples.filter((sample) => sample.minute >= minutes / 3 && sample[key] !== null && sample[key] !== undefined);
            const n = settled.length;
            const mx = settled.reduce((sum, sample) => sum + sample.minute, 0) / n;
            const my = settled.reduce((sum, sample) => sum + sample[key], 0) / n;
            const top = settled.reduce((sum, sample) => sum + (sample.minute - mx) * (sample[key] - my), 0);
            const bottom = settled.reduce((sum, sample) => sum + (sample.minute - mx) ** 2, 0);
            return round((top / bottom) * 60, 2); // per hour
          };
          record({
            site,
            state,
            test: `soak ${minutes} min, ${cycle} cycles`,
            settingChanges: tab === null || settingsEvery === 0 ? 0 : Math.floor(cycle / settingsEvery) * 2,
            first: samples[0],
            last: samples.at(-1),
            heapMbPerHour: slope("heapMb"),
            privateMbPerHour: slope("privateMb"),
            nodesPerHour: slope("nodes"),
            listenersPerHour: slope("listeners"),
            ...(byAllocator
              ? { collectedLiveMbPerHour: slope("collectedLiveMb"), collectedPagesMbPerHour: slope("collectedPagesMb"), mallocLiveMbPerHour: slope("mallocLiveMb"), mediaQueryObjectsMbPerHour: slope("mediaQueryObjectsMb") }
              : {}),
            samples,
          });
        } finally {
          await context.browser.close();
        }
      }),
    ),
  );
  finish({ minutes, settingsEvery });
}

// ---------------------------------------------------------------------------
// reuse: is what a block of work takes used again by the same block?
//
// One case at a time, each in a browser and a profile of its own: a browser
// without the extension that does in the page what the measuring script does
// there for a bookmark and a return, and the extension in the reading states
// named. A case is warmed with the same cycles until its fonts are loaded,
// does a fixed number of cycles at a fixed pace, is left alone, and does the
// same cycles again. From the first cycle to the end of the last rest
// nothing is collected by force: the processes are read from the operating
// system by a helper, and the memory dumps at the ends of the blocks show the
// heaps as the work left them. Only after that is a collection forced and
// the browser told that memory is short, to see what is still held and what
// is given back. With --diagnostic a collection is forced before every dump
// instead: such a run says what is held after each block, and is not a
// natural run.

async function reuse() {
  if (process.platform !== "win32") throw new Error("the processes are read the Windows way");
  const cycles = Number(option("--cycles", 150));
  const period = Number(option("--period", 6400));
  const idleSeconds = Number(option("--idle", 300));
  const restSeconds = Number(option("--rest", idleSeconds));
  const settleSeconds = Number(option("--settle", 60));
  const warm = Number(option("--warm", 10));
  const every = Number(option("--every", 5));
  const diagnostic = args.includes("--diagnostic");
  const arms = option("--arms", "control,night,night+sans").split(",");
  const stateOf = (arm) => (arm === "control" ? "baseline" : arm);
  for (const arm of arms) if (!(stateOf(arm) in STATES)) throw new Error(`no such case: ${arm}`);
  const dumps = out.replace(/\.json$/, "-dumps");
  mkdirSync(dumps, { recursive: true });
  const options = { arms, sites, cycles, periodMs: period, idleSeconds, restSeconds, settleSeconds, warmCycles: warm, sampleSeconds: every, diagnostic, turns: 12, rows: 60, storedBookmarks: 20 };
  let source = null;
  let order = 0;
  for (const site of sites) {
    for (const arm of arms) {
      order += 1;
      const state = stateOf(arm);
      const before = census();
      const context = await launch(STATES[state] !== null, { standIn: true });
      const watchers = [];
      const points = [];
      let row = null;
      try {
        source ??= identity(await context.browser.version());
        await applyState(context, state, 20);
        const target = await openSite(context, site, { turns: 12, rows: 60 });
        const tab = context.popup === null ? null : await tabOf(context);
        await target.page.bringToFront();
        await sleep(3000);
        const pid = await rendererOf(target);
        const began = new Date().toISOString();

        // A block: the cycles one after another, each given the same time.
        const answers = {};
        const paced = async (count, timings) => {
          const took = [];
          for (let number = 1; number <= count; number += 1) {
            const start = Date.now();
            await oneCycle(context, target, tab, number, { sham: true, timings, answers: timings && answers });
            took.push(Date.now() - start);
            await sleep(Math.max(200, period - took.at(-1)));
          }
          return took;
        };

        // Warm: the cycles of the blocks, after which every font the page
        // uses is loaded and what is built once has been built. Then the
        // page is left to settle, so that the first block begins from a page
        // at rest as the second does.
        await paced(warm, null);
        const fonts = await target.page.evaluate(async () => {
          await document.fonts.ready;
          return {
            loaded: [...document.fonts].filter((face) => face.status === "loaded").map((face) => `${face.family.replace(/"/g, "")} ${face.style}`).sort(),
            loading: [...document.fonts].filter((face) => face.status === "loading").length,
            lessMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          };
        });
        if (fonts.loading > 0) throw new Error("fonts are still loading after the warm cycles");

        const processesNow = async () =>
          (await context.system.send("SystemInfo.getProcessInfo")).processInfo.map(({ id, type, cpuTime }) => ({ id, type: id === pid ? "page" : type, cpuSeconds: round(cpuTime, 3) }));
        const watch = (list) => watchers.push(watchProcesses(list.map((entry) => entry.id), every));
        watch(await processesNow());
        await sleep(settleSeconds * 1000);

        // A point: what the page counts, the processor time of every process
        // of the browser, and a memory dump; after a forced collection only
        // where that is said.
        const point = async (name, collect = diagnostic) => {
          const at = Date.now();
          if (collect && !(await collectNow(target))) throw new Error(`${name}: the browser refused to collect`);
          const counters = await countersOf(target);
          const processes = await processesNow();
          if (processes.some((entry) => !watchers.at(-1).pids.includes(entry.id))) {
            watchers.at(-1).stop();
            watch(processes);
          }
          const { raw, ...dump } = await dumpOf(context, target, pid);
          const file = `${String(order).padStart(2, "0")}-${site}-${arm}-${points.length}-${name.replace(/[^a-z0-9]+/g, "-")}.json`;
          writeFileSync(path.join(dumps, file), JSON.stringify(raw));
          points.push({ name, at, collected: collect, counters, processes, dump: { ...dump, collected: collect, file } });
          console.log(`${site} ${arm} ${name}: ${JSON.stringify({ ...counters, ...dump, collected: collect })}`);
        };

        const timings = { save: [], return: [], remove: [] };
        await point("block 1 begins");
        const first = await paced(cycles, timings);
        await point("block 1 ends");
        await sleep(idleSeconds * 1000);
        await point("left alone");
        const second = await paced(cycles, timings);
        await point("block 2 ends");
        await sleep(restSeconds * 1000);
        await point("left alone again");
        // Only now is anything collected by force, and the browser told that
        // memory is short.
        await point("collected", true);
        await context.system.send("Memory.simulatePressureNotification", { level: "critical" }).catch(() => {});
        await sleep(2500 + every * 1000);
        await point("memory short");
        await sleep(every * 1000 + 1500);

        const samples = watchers.flatMap((entry) => entry.samples).sort((a, b) => a.at - b.at);
        const whole = (sample, key) => round(Object.values(sample.processes).reduce((sum, entry) => sum + entry[key], 0), 2);
        const reads = {
          pagePrivateMib: (sample) => sample.processes[pid]?.privateMib ?? null,
          pageWorkingMib: (sample) => sample.processes[pid]?.workingMib ?? null,
          browserPrivateMib: (sample) => whole(sample, "privateMib"),
          browserWorkingMib: (sample) => whole(sample, "workingMib"),
        };
        const known = (values) => values.filter((value) => value !== null && value !== undefined);
        // A level: the middle of the readings of the half minute before.
        const level = (at, read) => median(known(samples.filter((sample) => sample.at > at - 30000 && sample.at <= at + 500).map(read)));
        // A trend: a straight line through the readings of a phase after its
        // first two minutes, in which a page at rest comes to work, an hour long.
        const trend = (inside, from, read) => {
          const pairs = inside.filter((sample) => sample.at >= from.at + 120000 && read(sample) !== null).map((sample) => [sample.at / 3600000, read(sample)]);
          if (pairs.length < 6) return null;
          const mx = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
          const my = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
          return round(pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0) / pairs.reduce((sum, [x]) => sum + (x - mx) ** 2, 0), 1);
        };
        const phase = (name, from, to) => {
          const inside = samples.filter((sample) => sample.at >= from.at && sample.at <= to.at);
          const span = (read) => {
            const values = known(inside.map(read));
            return {
              begins: level(from.at, read),
              ends: level(to.at, read),
              lowest: values.length ? Math.min(...values) : null,
              highest: values.length ? Math.max(...values) : null,
              perHour: trend(inside, from, read),
            };
          };
          const cpu = (test) => round(to.processes.filter(test).reduce((sum, entry) => sum + entry.cpuSeconds - (from.processes.find((other) => other.id === entry.id)?.cpuSeconds ?? 0), 0), 2);
          const counted = (key) => round(to.counters[key] - from.counters[key], 3);
          const seconds = (to.at - from.at) / 1000;
          const kinds = [...new Set(to.processes.map((entry) => entry.type))];
          return {
            name,
            seconds: round(seconds, 1),
            ...Object.fromEntries(Object.entries(reads).map(([key, read]) => [key, span(read)])),
            pageCpuSeconds: cpu((entry) => entry.id === pid),
            browserCpuSeconds: cpu(() => true),
            cpuSecondsByKind: Object.fromEntries(kinds.map((kind) => [kind, cpu((entry) => entry.type === kind)])),
            machineBusyPercent: round(inside.reduce((sum, sample) => sum + sample.machineBusyPercent, 0) / Math.max(1, inside.length), 2),
            layouts: counted("layouts"),
            styles: counted("styles"),
            layoutSeconds: counted("layoutSeconds"),
            styleSeconds: counted("styleSeconds"),
            scriptSeconds: counted("scriptSeconds"),
            taskSeconds: counted("taskSeconds"),
          };
        };
        const pace = (took) => ({ middleMs: median(took), longestMs: Math.max(...took), overPeriod: took.filter((ms) => ms > period - 200).length });
        const files = {};
        for (const url of target.requests) {
          if (/^chrome-extension:.*\.woff2$/.test(url)) files[url.split("/").pop()] = (files[url.split("/").pop()] ?? 0) + 1;
        }
        row = {
          site,
          state: arm,
          test: `reuse, ${cycles} cycles twice${diagnostic ? ", collected before every dump" : ""}`,
          order,
          began,
          ended: new Date().toISOString(),
          natural: !diagnostic,
          siteTheme: target.scheme,
          lessMotion: fonts.lessMotion,
          fontFaces: fonts.loaded,
          fontFiles: files,
          requestsElsewhere: target.requests.filter((url) => !/^chrome-extension:|^https:\/\/(chatgpt\.com|claude\.ai)\//.test(url)).length,
          pageProcess: pid,
          pace: {
            periodMs: period,
            first: pace(first),
            second: pace(second),
            stepsMiddleMs: Object.fromEntries(Object.entries(timings).map(([name, values]) => [name, round(median(values), 1)])),
            answers,
          },
          phases: [
            phase("block 1", points[0], points[1]),
            phase("left alone", points[1], points[2]),
            phase("block 2", points[2], points[3]),
            phase("left alone again", points[3], points[4]),
          ],
          points,
          sampleColumns: ["seconds since block 1 began", ...Object.keys(reads), "machineBusyPercent"],
          samples: samples.map((sample) => [round((sample.at - points[0].at) / 1000, 0), ...Object.values(reads).map((read) => read(sample)), sample.machineBusyPercent]),
        };
      } catch (error) {
        // What was read before the failure is kept; it is not a result.
        row = { site, state: arm, test: "reuse", order, failed: String(error?.stack ?? error), points };
      } finally {
        for (const entry of watchers) entry.stop();
        await context.browser.close().catch(() => {});
      }
      // What else the machine did meanwhile, once the browser has closed.
      row.elsewhere = elsewhere(before, census());
      rows.push(row);
      console.log(
        row.failed
          ? `${site} ${arm} FAILED ${row.failed}`
          : `${site} ${arm} ${row.phases.map((entry) => `${entry.name}: page ${entry.pagePrivateMib.begins} -> ${entry.pagePrivateMib.ends} Mib, ${entry.pageCpuSeconds} s`).join("; ")}`,
      );
      finish({ source, options });
    }
  }
}

// ---------------------------------------------------------------------------
// micro: the stored-places functions alone

function micro() {
  const blocks = ["one", "two", "three", "four", "five"].map((text) => ({ f: fingerprint(text), t: "p" }));
  const place = createPlace({ key: messageKey("turn-1"), ordinal: null, blocks }, 2, 0.4);
  const key = (index) => conversationKey("chatgpt", conversationId([/c\/(.+)/], `c/conversation-${index}`));
  const time = (run, times) => {
    const began = performance.now();
    for (let index = 0; index < times; index += 1) run(index);
    return ((performance.now() - began) / times) * 1000; // microseconds
  };
  for (const count of [0, 10, 100, 1000]) {
    let marks = normalizeMarks(undefined);
    for (let index = 0; index < count; index += 1) marks = saveMark(marks, key(index), place);
    const raw = JSON.parse(JSON.stringify(marks));
    const index = indexMarks(marks);
    const present = key(Math.max(0, count - 1));
    record({
      site: "node",
      state: `${count} stored`,
      test: "micro (microseconds per call)",
      bytes: JSON.stringify(marks).length,
      normalize: round(time(() => normalizeMarks(raw), 400), 1),
      findMark: round(time(() => findMark(marks, present), 400), 1),
      indexBuild: round(time(() => indexMarks(marks), 400), 1),
      indexLookup: round(time(() => index.byKey.get(present), 200000), 3),
      save: round(time((turn) => saveMark(marks, key(turn % Math.max(1, count)), place), 200), 1),
      remove: round(time((turn) => removeMark(marks, key(turn % Math.max(1, count))), 200), 1),
    });
  }
  finish();
}

// ---------------------------------------------------------------------------
// firefox: processor time and memory of the browser's processes

const FIREFOX_ADDON_ID = "readela@amir42.com";
const FIREFOX_UUID = "5f0d3b0e-6a57-4a3e-9d1f-7c1c2f4a9b10";

/**
 * Processor seconds and private memory of a browser process and the processes
 * it started. A process's recorded parent can be a number that was given to
 * another process since, so only processes of the same program that started
 * no earlier than the browser itself are counted.
 */
function treeUsage(pid) {
  const script = [
    "$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CreationDate",
    `$top = $all | Where-Object { $_.ProcessId -eq ${pid} }`,
    "function Kids($p) { $all | Where-Object { $_.ParentProcessId -eq $p -and $_.Name -eq $top.Name -and $_.CreationDate -ge $top.CreationDate } | ForEach-Object { $_.ProcessId; Kids $_.ProcessId } }",
    `$ids = @(${pid}) + @(Kids ${pid})`,
    "$found = Get-Process -Id $ids -ErrorAction SilentlyContinue",
    '"$(($found | Measure-Object CPU -Sum).Sum) $(($found | Measure-Object PrivateMemorySize64 -Sum).Sum) $($found.Count)"',
  ].join("; ");
  const [cpu, bytes, count] = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim().split(/\s+/).map(Number);
  return { cpu, privateMb: megabytes(bytes), processes: count };
}

async function firefox() {
  if (process.platform !== "win32") throw new Error("the Firefox measurement reads processes the Windows way");
  const seconds = Number(option("--seconds", 60));
  const repeat = Number(option("--repeat", 3));
  const minutes = Number(option("--minutes", 5));
  const installed = await getInstalledBrowsers({ cacheDir: path.join(root, ".cache", "browsers") });
  const executablePath = process.env.READELA_FIREFOX ?? installed.find((entry) => entry.browser === "firefox")?.executablePath;
  const open = async (state) => {
    const browser = await puppeteer.launch({
      browser: "firefox",
      executablePath,
      headless: true,
      args: ["--remote-allow-system-access"],
      extraPrefsFirefox: { "extensions.webextensions.uuids": JSON.stringify({ [FIREFOX_ADDON_ID]: FIREFOX_UUID }) },
    });
    let popup = null;
    if (STATES[state] !== null) {
      await browser.installExtension(extension);
      popup = await browser.newPage();
      await popup.goto(`moz-extension://${FIREFOX_UUID}/popup/popup.html`, { waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => {});
      await popup.waitForFunction(() => document.querySelector('input[name="direction"]:checked') !== null, { timeout: 15000 });
      await popup.evaluate((stored) => browser.storage.local.set(stored), { "readela.preferences": { ...DEFAULTS, ...STATES[state] }, "readela.marks": syntheticMarks(20) });
    }
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (/^moz-extension:/.test(url)) return request.continue();
      // The page asks for nothing but itself.
      if (new URL(url).host === HOSTS.chatgpt) {
        return request.respond({ status: 200, contentType: "text/html; charset=utf-8", body: pageSource });
      }
      return request.abort();
    });
    await page.goto("https://chatgpt.com/c/perf-conversation-0?turns=12&rows=60", { waitUntil: "load" });
    await page.waitForFunction(() => window.perfReady === true);
    await page.bringToFront().catch(() => {});
    let tab = null;
    if (popup !== null) {
      tab = await popup.evaluate(async () => {
        for (const entry of await browser.tabs.query({})) {
          try {
            if ((await browser.tabs.sendMessage(entry.id, { readelaMark: "status" }))?.site) return entry.id;
          } catch {
            // Not a page this extension runs on.
          }
        }
        return null;
      });
    }
    return { browser, popup, page, tab, pid: browser.process().pid };
  };
  const states = ["baseline", "off", "default", "night+sans"].filter(wanted);

  // Idle: a settled page, by processor time of the whole browser.
  await Promise.all(
    states.map(async (state) => {
      const context = await open(state);
      try {
        await sleep(8000);
        const windows = [];
        for (let run = 0; run < repeat; run += 1) {
          const before = treeUsage(context.pid);
          await sleep(seconds * 1000);
          const after = treeUsage(context.pid);
          windows.push({ cpuPercent: round(((after.cpu - before.cpu) / seconds) * 100, 2), privateMb: after.privateMb });
        }
        record({
          site: "chatgpt",
          state,
          test: `firefox idle ${seconds}s x${repeat}`,
          cpuPercentAllProcesses: median(windows.map((window) => window.cpuPercent)),
          cpuPercentRange: [Math.min(...windows.map((w) => w.cpuPercent)), Math.max(...windows.map((w) => w.cpuPercent))],
          privateMbAllProcesses: median(windows.map((window) => window.privateMb)),
        });
      } finally {
        await context.browser.close();
      }
    }),
  );

  // A shorter long run: the same cycle as in Chrome, memory of the whole browser.
  await Promise.all(
    ["baseline", "night+sans"].filter(wanted).map(async (state) => {
      const context = await open(state);
      try {
        const ask = (word) => context.popup.evaluate((id, request) => browser.tabs.sendMessage(id, { readelaMark: request }), context.tab, word);
        const began = Date.now();
        const samples = [];
        let cycle = 0;
        while (Date.now() - began < minutes * 60000) {
          cycle += 1;
          await context.page.evaluate((conversation) => window.perfNavigate(conversation), cycle % 9);
          await context.page.evaluate(() => window.perfStream(2500, 30));
          await context.page.evaluate(() => window.perfChurn(1500, 250));
          if (context.popup !== null) {
            await context.page.evaluate(() => {
              const paragraphs = document.querySelectorAll("#perf-content .turn:nth-last-child(2) p");
              paragraphs[paragraphs.length - 3].scrollIntoView({ block: "center" });
              getSelection().selectAllChildren(paragraphs[paragraphs.length - 3]);
            });
            await ask("set");
            await ask("set");
            await ask("clear");
            const theme = ["paper", "night", "page"][cycle % 3];
            await context.popup.evaluate((stored) => browser.storage.local.set(stored), { "readela.preferences": { ...DEFAULTS, ...STATES[state], theme, font: cycle % 2 ? "sans" : "page" } });
            await sleep(300);
            await context.popup.evaluate((stored) => browser.storage.local.set(stored), { "readela.preferences": { ...DEFAULTS, ...STATES[state] } });
          }
          await sleep(500);
          if (cycle % 4 === 0) {
            samples.push({ minute: round((Date.now() - began) / 60000, 2), ...treeUsage(context.pid) });
            console.log(`firefox ${state} ${JSON.stringify(samples.at(-1))}`);
          }
        }
        const settled = samples.filter((sample) => sample.minute >= minutes / 3);
        const mx = settled.reduce((sum, sample) => sum + sample.minute, 0) / settled.length;
        const my = settled.reduce((sum, sample) => sum + sample.privateMb, 0) / settled.length;
        const slope = settled.reduce((sum, sample) => sum + (sample.minute - mx) * (sample.privateMb - my), 0) / settled.reduce((sum, sample) => sum + (sample.minute - mx) ** 2, 0);
        record({
          site: "chatgpt",
          state,
          test: `firefox long run ${minutes} min, ${cycle} cycles`,
          first: samples[0],
          last: samples.at(-1),
          privateMbPerHourAllProcesses: round(slope * 60, 1),
          samples,
        });
      } finally {
        await context.browser.close();
      }
    }),
  );
  finish({ seconds, repeat, minutes });
}

const SUITES = { idle, work, scale, fonts, memory, allocators, soak, reuse, micro, firefox };
if (!(suite in SUITES)) {
  console.error(`usage: node test/perf/run.mjs <${Object.keys(SUITES).join("|")}> [options]`);
  process.exit(2);
}
await SUITES[suite]();
