// End-to-end checks in real browsers.
//
// The built extension is installed into a fresh temporary profile; no
// existing browser profile is read or changed. A synthetic conversation page
// is served at a https://chatgpt.com/ address by answering that one request
// inside the test browser, so the real manifest match pattern and the real
// content script are exercised. Every other request the page makes is
// refused and recorded.
//
//   node test/e2e/run.mjs [--browser chrome|firefox] [--live] [--headed]
//
// --live additionally opens the real https://chatgpt.com/ start page, signed
// out, without sending anything. It reports what it observed; it is a smoke
// check, not a substitute for the fixture checks.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getInstalledBrowsers } from "@puppeteer/browsers";
import puppeteer from "puppeteer-core";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const results = path.join(root, "test-results");
const fixtureSource = readFileSync(path.join(root, "test", "e2e", "fixtures", "conversation.html"), "utf8");
const FIXTURE_URL = "https://chatgpt.com/c/readela-fixture";

const FIREFOX_ADDON_ID = "readela@amir42.com";
const FIREFOX_UUID = "5f0d3b0e-6a57-4a3e-9d1f-7c1c2f4a9b10"; // fixed so the popup address is known

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const selected = option("--browser") ? [option("--browser")] : ["chrome", "firefox"];
const headless = !flag("--headed");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Browser start-up

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

async function firefoxExecutable() {
  if (process.env.READELA_FIREFOX) return process.env.READELA_FIREFOX;
  const cacheDir = path.join(root, ".cache", "browsers");
  if (!existsSync(cacheDir)) return undefined;
  const installed = await getInstalledBrowsers({ cacheDir });
  return installed.find((entry) => entry.browser === "firefox")?.executablePath;
}

// Firefox has no runtime colour-scheme emulation through this protocol; the
// scheme is fixed for a launch by preference (0 dark, 1 light).
async function start(name, firefoxScheme = "light") {
  const extensionPath = path.join(root, "dist", name);
  if (!existsSync(path.join(extensionPath, "manifest.json"))) {
    throw new Error(`dist/${name} is missing; run "npm run build" first`);
  }

  if (name === "chrome") {
    const executablePath = chromeExecutable();
    if (!executablePath) return { unavailable: "no Chrome or Chromium executable found (set READELA_CHROME)" };
    const browser = await puppeteer.launch({ browser: "chrome", executablePath, headless, pipe: true, enableExtensions: true });
    const id = await browser.installExtension(extensionPath);
    return { browser, popupUrl: `chrome-extension://${id}/popup/popup.html`, input: true };
  }

  const executablePath = await firefoxExecutable();
  if (!executablePath) return { unavailable: 'no Firefox executable found (run "npm run browsers:firefox" or set READELA_FIREFOX)' };
  const browser = await puppeteer.launch({
    browser: "firefox",
    executablePath,
    headless,
    // Lets the automation protocol open the extension's own popup page.
    args: ["--remote-allow-system-access"],
    extraPrefsFirefox: {
      "extensions.webextensions.uuids": JSON.stringify({ [FIREFOX_ADDON_ID]: FIREFOX_UUID }),
      "layout.css.prefers-color-scheme.content-override": firefoxScheme === "dark" ? 0 : 1,
    },
  });
  await browser.installExtension(extensionPath);
  // Firefox's automation protocol does not deliver pointer or key input to an
  // extension page, so there the real popup is operated through its DOM.
  return { browser, popupUrl: `moz-extension://${FIREFOX_UUID}/popup/popup.html`, input: false };
}

// ---------------------------------------------------------------------------
// Page helpers

async function openFixture(browser, requests) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    requests.push(url);
    if (url === FIXTURE_URL) {
      request.respond({ status: 200, contentType: "text/html; charset=utf-8", body: fixtureSource });
    } else {
      request.abort();
    }
  });
  await page.goto(FIXTURE_URL, { waitUntil: "load" });
  return page;
}

// Firefox moves the tab into its extension process during this navigation and
// the automation protocol does not report the load, so readiness is checked
// on the page itself.
async function loadPopup(popup, popupUrl) {
  await popup.goto(popupUrl, { waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => {});
  await popup.waitForFunction(() => document.querySelector('input[name="direction"]:checked') !== null, {
    timeout: 15000,
  });
}

// Firefox does not activate a tab that shows an extension page through the
// automation protocol; the checks do not depend on which tab is in front.
const front = (target) => target.bringToFront().catch(() => {});

// The built popup document served as an ordinary page with an in-memory
// stand-in for extension storage. Used only where real input cannot reach the
// extension page: it shows how this browser's engine renders and operates the
// popup, not that the installed popup was operated.
async function openStandInPopup(browser, name) {
  const directory = path.join(root, "dist", name, "popup");
  const standIn =
    "globalThis.browser = (() => { const data = {}; return { runtime: { id: 'stand-in' }, storage: { local: { " +
    "get: async () => ({ ...data }), set: async (values) => { Object.assign(data, values); } }, " +
    "onChanged: { addListener() {}, removeListener() {} } } }; })();";
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" };
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = new URL(request.url());
    const file = path.join(directory, path.basename(url.pathname));
    if (url.host !== "popup.readela.test" || !existsSync(file)) return request.abort();
    let body = readFileSync(file, "utf8");
    if (file.endsWith(".html")) body = body.replace('<script src="popup.js">', `<script>${standIn}</script><script src="popup.js">`);
    return request.respond({ status: 200, contentType: types[path.extname(file)], body });
  });
  await page.goto("https://popup.readela.test/popup.html", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector('input[name="direction"]:checked') !== null);
  return page;
}

async function openPopup(browser, popupUrl) {
  const popup = await browser.newPage();
  await popup.setViewport({ width: 360, height: 640 });
  await loadPopup(popup, popupUrl);
  return popup;
}

const waitForMark = (page, selector, value, timeout = 5000) =>
  page.waitForFunction(
    (s, v) => document.querySelector(s)?.getAttribute("data-readela-dir") === v,
    { timeout },
    selector,
    value,
  );

// Facts about elements, read inside the page.
const inspect = (page, selectors) =>
  page.evaluate((list) => {
    const facts = {};
    for (const selector of list) {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      facts[selector] = {
        mark: element.getAttribute("data-readela-dir"),
        top: element.hasAttribute("data-readela-top"),
        marks: element.getAttributeNames().filter((name) => name.startsWith("data-readela")),
        direction: style.direction,
        unicodeBidi: style.unicodeBidi,
        textAlign: style.textAlign,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        borderLeftWidth: style.borderLeftWidth,
        borderRightWidth: style.borderRightWidth,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight,
        zoom: style.zoom,
        fontSize: style.fontSize,
        text: element.textContent,
      };
    }
    return facts;
  }, selectors);

// Horizontal position of one character as laid out, to check visual order.
const characterLeft = (page, selector, character, fromEnd = false) =>
  page.evaluate(
    (s, c, last) => {
      const element = document.querySelector(s);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (walker.nextNode()) {
        const data = walker.currentNode.data;
        for (let index = data.indexOf(c); index !== -1; index = data.indexOf(c, index + 1)) {
          hits.push([walker.currentNode, index]);
        }
      }
      const [node, index] = last ? hits.at(-1) : hits[0];
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      return range.getBoundingClientRect().left;
    },
    selector,
    character,
    fromEnd,
  );

const footprint = (page) =>
  page.evaluate(() => {
    const marked = [...document.querySelectorAll("*")].filter((element) =>
      element.getAttributeNames().some((name) => name.startsWith("data-readela")),
    );
    const customProperties = [...document.querySelectorAll("[style]")].filter((element) =>
      element.getAttribute("style").includes("--readela"),
    );
    return { marked: marked.length, customProperties: customProperties.length };
  });

function relativeLuminance([red, green, blue]) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const rgb = (value) => value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

// ---------------------------------------------------------------------------
// Theme check, shared by the main suite and the Firefox dark-theme pass

async function checkTheme({ name, ui, page, scheme, emulate, report }) {
  const prepare = async (target) => {
    if (emulate) await target.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
    await sleep(100);
    const active = await target.evaluate((value) => matchMedia(`(prefers-color-scheme: ${value})`).matches, scheme);
    assert.equal(active, true, `the ${scheme} colour scheme is in effect`);
  };

  await front(ui);
  await ui.setViewport({ width: 320, height: 640 });
  await prepare(ui);
  const colours = await ui.evaluate(() => {
    const pair = (selector) => {
      const element = document.querySelector(selector);
      let background = "rgba(0, 0, 0, 0)";
      for (let node = element; node && /rgba\(0, 0, 0, 0\)|transparent/.test(background); node = node.parentElement) {
        background = getComputedStyle(node).backgroundColor;
      }
      return { color: getComputedStyle(element).color, background };
    };
    return {
      body: pair("h1"),
      note: pair("main > .note:last-child"),
      select: pair("#font"),
      button: pair("#reset"),
      label: pair(".choices label"),
      fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
  assert.equal(colours.fits, true, "no horizontal overflow at 320px");
  const measured = {};
  for (const key of ["body", "note", "select", "button", "label"]) {
    const ratio = contrast(rgb(colours[key].color), rgb(colours[key].background));
    measured[key] = Math.round(ratio * 100) / 100;
    assert.ok(ratio >= 4.5, `${key}: contrast ${ratio.toFixed(2)}`);
  }
  (report.popupContrast ??= {})[scheme] = measured;
  await ui.screenshot({ path: path.join(results, `${name}-popup-${scheme}.png`) });
  if (emulate) await ui.emulateMediaFeatures([]);

  await front(page);
  await prepare(page);
  const readable = await page.evaluate(() => {
    const paragraph = document.querySelector("#p-en-start");
    return {
      color: getComputedStyle(paragraph).color,
      background: getComputedStyle(document.body).backgroundColor,
      mark: paragraph.getAttribute("data-readela-dir"),
    };
  });
  assert.equal(readable.mark, "rtl");
  assert.ok(contrast(rgb(readable.color), rgb(readable.background)) >= 4.5, "page text keeps its contrast");
  await page.screenshot({ path: path.join(results, `${name}-fixture-${scheme}.png`) });
  if (emulate) await page.emulateMediaFeatures([]);
}

// ---------------------------------------------------------------------------
// The checks

async function runSuite(name, browser, popupUrl, input, schemes, report) {
  const steps = [];
  const step = async (title, body) => {
    try {
      await body();
      steps.push({ title, ok: true });
      console.log(`  ok    ${title}`);
    } catch (error) {
      const detail = String(error?.message ?? error).split("\n").slice(0, 16);
      steps.push({ title, ok: false, error: detail.join("\n") });
      console.log(`  FAIL  ${title}\n        ${detail.join("\n        ")}`);
    }
  };

  const requests = [];
  const page = await openFixture(browser, requests);
  const popup = await openPopup(browser, popupUrl);
  await front(page);

  const press = (target, selector) =>
    input ? target.click(selector) : target.$eval(selector, (element) => element.click());

  const setPreference = async (action) => {
    await front(popup);
    await action(popup);
    await front(page);
  };

  await step("the content script runs on the matched address and marks the conversation", async () => {
    await waitForMark(page, "#p-en-start", "rtl");
  });

  await step("right-to-left paragraphs that start with a left-to-right word read right-to-left", async () => {
    const facts = await inspect(page, ["#p-en-start", "#p-ar-en-start", "#p-he-en-start", "#h-fa", "#quote-fa-p"]);
    for (const [selector, fact] of Object.entries(facts)) {
      assert.equal(fact.mark, "rtl", selector);
      assert.equal(fact.direction, "rtl", selector);
      assert.equal(fact.unicodeBidi, "isolate", selector);
    }
    // Visual order: the leading Latin word sits at the right edge, the final full stop at the left.
    assert.ok((await characterLeft(page, "#p-en-start", "R")) > (await characterLeft(page, "#p-en-start", ".", true)));
    assert.ok((await characterLeft(page, "#p-ar-en-start", "P")) > (await characterLeft(page, "#p-ar-en-start", ".", true)));
    assert.ok((await characterLeft(page, "#p-he-en-start", "J")) > (await characterLeft(page, "#p-he-en-start", ".", true)));
  });

  await step("Persian, Arabic and Hebrew paragraphs read right-to-left; English reads left-to-right", async () => {
    const facts = await inspect(page, ["#p-ar", "#p-he", "#p-en", "#h-en", "#p-en-quote", "#user-bubble"]);
    assert.equal(facts["#p-ar"].direction, "rtl");
    assert.equal(facts["#p-he"].direction, "rtl");
    assert.equal(facts["#user-bubble"].direction, "rtl");
    assert.equal(facts["#p-en"].mark, "ltr");
    assert.equal(facts["#h-en"].direction, "ltr");
    // Starts with a Persian word but is an English sentence.
    assert.equal(facts["#p-en-quote"].mark, "ltr");
    assert.ok((await characterLeft(page, "#p-en-quote", "i")) < (await characterLeft(page, "#p-en-quote", ".", true)));
  });

  await step("mixed punctuation and numbers keep their order in a right-to-left paragraph", async () => {
    const facts = await inspect(page, ["#p-punct", "#p-neutral"]);
    assert.equal(facts["#p-punct"].direction, "rtl");
    // Digits stay left-to-right; the closing exclamation mark ends at the left.
    assert.ok((await characterLeft(page, "#p-punct", "2")) < (await characterLeft(page, "#p-punct", "5")));
    assert.ok((await characterLeft(page, "#p-punct", "!")) < (await characterLeft(page, "#p-punct", "2")));
    // A number-only paragraph follows the paragraphs before it.
    assert.equal(facts["#p-neutral"].mark, "rtl");
  });

  await step("lists present as a unit, nested lists decide for themselves, physical indents are mirrored", async () => {
    const facts = await inspect(page, [
      "#ul-fa", "#li-fa-1", "#li-fa-2-p", "#ol-en", "#li-en-1", "#ul-physical", "#ul-en", "#li-en-a", "#quote-fa",
    ]);
    assert.equal(facts["#ul-fa"].direction, "rtl");
    assert.equal(facts["#li-fa-1"].direction, "rtl");
    assert.equal(facts["#li-fa-2-p"].direction, "rtl");
    assert.equal(parseFloat(facts["#ul-fa"].paddingRight), 26);
    assert.equal(parseFloat(facts["#ul-fa"].paddingLeft), 0);
    assert.equal(facts["#ol-en"].direction, "ltr");
    assert.equal(facts["#li-en-1"].direction, "ltr");
    assert.equal(parseFloat(facts["#ol-en"].paddingLeft), 26);
    assert.equal(parseFloat(facts["#ul-physical"].paddingRight), 30, "physical indent moved to the reading start");
    assert.equal(parseFloat(facts["#ul-physical"].paddingLeft), 0);
    assert.equal(facts["#ul-en"].direction, "ltr");
    assert.equal(parseFloat(facts["#ul-en"].paddingLeft), 26);
    assert.deepEqual(facts["#ul-en"].marks.sort(), ["data-readela-dir", "data-readela-top"]);
    assert.equal(parseFloat(facts["#quote-fa"].borderRightWidth), 3, "quotation bar moved to the reading start");
    assert.equal(parseFloat(facts["#quote-fa"].borderLeftWidth), 0);
  });

  await step("tables follow their content; a physically pinned header aligns to the reading start", async () => {
    const facts = await inspect(page, ["#table-fa", "#th-fa", "#td-fa"]);
    assert.equal(facts["#table-fa"].direction, "rtl");
    assert.equal(facts["#th-fa"].direction, "rtl");
    assert.equal(facts["#th-fa"].textAlign, "start");
  });

  await step("code, mathematics and web addresses stay left-to-right and keep their font", async () => {
    const facts = await inspect(page, ["#inline-code", "#code-block", "#code", "#math", "#link-url", "#link-text"]);
    for (const selector of ["#inline-code", "#code-block", "#math", "#link-url"]) {
      assert.equal(facts[selector].direction, "ltr", selector);
    }
    assert.equal(facts["#inline-code"].unicodeBidi, "isolate");
    assert.equal(facts["#link-url"].unicodeBidi, "isolate");
    assert.equal(facts["#code-block"].mark, null);
    assert.deepEqual(facts["#link-text"].marks, []);
    assert.match(facts["#code"].fontFamily, /monospace/);
    // Inline code reads in its own order: "npm" before "react".
    assert.ok((await characterLeft(page, "#inline-code", "n")) < (await characterLeft(page, "#inline-code", "c", true)));
  });

  await step("text content, links and selection are unchanged", async () => {
    const outcome = await page.evaluate((source) => {
      const original = new DOMParser().parseFromString(source, "text/html");
      const paragraph = document.querySelector("#p-inline");
      const selection = getSelection();
      selection.selectAllChildren(paragraph);
      const selected = selection.toString();
      selection.removeAllRanges();
      const link = document.querySelector("#link-url");
      const box = link.getBoundingClientRect();
      return {
        sameText: document.querySelector("main").textContent === original.querySelector("main").textContent,
        sameElements: document.querySelectorAll("main *").length === original.querySelectorAll("main *").length,
        selected,
        expected: original.querySelector("#p-inline").textContent,
        href: link.href,
        hit: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.id,
      };
    }, fixtureSource);
    assert.equal(outcome.sameText, true);
    assert.equal(outcome.sameElements, true);
    assert.equal(outcome.selected, outcome.expected);
    assert.equal(outcome.href, "https://react.dev/learn");
    assert.equal(outcome.hit, "link-url");
  });

  await step("the composer, other editable fields, navigation and page controls are untouched", async () => {
    const facts = await inspect(page, [
      "#prompt-textarea", "#composer-p", "#composer-textarea", "#composer-form", "#send-button", "#nav-title", "#page-button",
    ]);
    for (const [selector, fact] of Object.entries(facts)) assert.deepEqual(fact.marks, [], selector);
    assert.equal(facts["#composer-p"].direction, "ltr");
    await page.click("#composer-textarea");
    await page.keyboard.type(" abc");
    await sleep(200);
    assert.equal(await page.$eval("#composer-textarea", (element) => element.value), "سلام world abc");
    assert.deepEqual((await inspect(page, ["#composer-textarea"]))["#composer-textarea"].marks, []);
  });

  await step("streamed text is followed as it arrives", async () => {
    await page.evaluate(() => {
      const turn = document.createElement("div");
      turn.className = "turn";
      turn.id = "turn-stream";
      turn.dataset.messageAuthorRole = "assistant";
      const paragraph = document.createElement("p");
      paragraph.id = "p-stream";
      paragraph.setAttribute("dir", "auto");
      paragraph.textContent = "TypeScript";
      turn.append(paragraph);
      document.querySelector("#composer-form").before(turn);
    });
    await waitForMark(page, "#p-stream", "ltr");
    await page.evaluate(async () => {
      const paragraph = document.querySelector("#p-stream");
      for (const piece of [" یک", " زبان", " برنامه‌نویسی", " است", " که", " روی", " JavaScript", " ساخته", " شده", "."]) {
        paragraph.firstChild.appendData(piece);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      const list = document.createElement("ul");
      list.id = "ul-stream";
      paragraph.after(list);
      for (const text of ["نوع‌های ایستا", "ابزارهای بهتر"]) {
        const item = document.createElement("li");
        list.append(item);
        for (const word of text.split(" ")) {
          item.append(document.createTextNode(`${word} `));
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      }
    });
    await waitForMark(page, "#p-stream", "rtl");
    await waitForMark(page, "#ul-stream", "rtl");
    await waitForMark(page, "#ul-stream li:last-child", "rtl");
    assert.equal(
      await page.$eval("#p-stream", (element) => element.textContent),
      "TypeScript یک زبان برنامه‌نویسی است که روی JavaScript ساخته شده.",
    );
  });

  await step("navigation to another conversation is followed", async () => {
    await page.evaluate(() => {
      history.pushState({}, "", "/c/readela-fixture-2");
      for (const turn of document.querySelectorAll("main .turn")) turn.remove();
      const turn = document.createElement("div");
      turn.className = "turn";
      turn.dataset.messageAuthorRole = "assistant";
      turn.innerHTML =
        '<p id="p-nav-fa" dir="auto">Next.js یک فریم‌ورک برای React است.</p><p id="p-nav-en" dir="auto">It supports server rendering.</p>';
      document.querySelector("#composer-form").before(turn);
    });
    await waitForMark(page, "#p-nav-fa", "rtl");
    await waitForMark(page, "#p-nav-en", "ltr");
    await page.evaluate(() => history.pushState({}, "", "/c/readela-fixture"));
  });

  await step("an explicit direction overrides the automatic decision; code stays left-to-right", async () => {
    await page.reload({ waitUntil: "load" });
    await waitForMark(page, "#p-en-start", "rtl");
    await setPreference((p) => press(p, 'input[name="direction"][value="rtl"]'));
    await waitForMark(page, "#p-en", "rtl");
    let facts = await inspect(page, ["#p-en", "#ul-en", "#code-block", "#inline-code"]);
    assert.equal(facts["#p-en"].direction, "rtl");
    assert.equal(facts["#ul-en"].direction, "rtl");
    assert.equal(facts["#code-block"].direction, "ltr");
    assert.equal(facts["#inline-code"].direction, "ltr");
    await setPreference((p) => press(p, 'input[name="direction"][value="ltr"]'));
    await waitForMark(page, "#p-en-start", "ltr");
    facts = await inspect(page, ["#p-en-start", "#ul-fa"]);
    assert.equal(facts["#p-en-start"].direction, "ltr");
    assert.equal(facts["#ul-fa"].direction, "ltr");
    assert.equal(parseFloat(facts["#ul-fa"].paddingLeft), 26);
    await setPreference((p) => press(p, 'input[name="direction"][value="auto"]'));
    await waitForMark(page, "#p-en-start", "rtl");
    await waitForMark(page, "#p-en", "ltr");
  });

  let before;
  await step("font, size and line spacing apply to prose and leave code in its own font", async () => {
    before = await inspect(page, ["#p-en-start", "#code", "#h-fa", "#li-fa-1"]);
    await setPreference(async (p) => {
      await p.select("#font", "serif");
      await p.select("#size", "125");
      await p.select("#spacing", "2.2");
    });
    await page.waitForFunction(() => document.documentElement.getAttribute("data-readela-spacing") === "2.2");
    const after = await inspect(page, ["#p-en-start", "#code", "#h-fa", "#li-fa-1", "#ul-fa", "#code-block"]);
    assert.match(after["#p-en-start"].fontFamily, /serif$/);
    assert.notEqual(after["#p-en-start"].fontFamily, before["#p-en-start"].fontFamily);
    assert.equal(after["#code"].fontFamily, before["#code"].fontFamily);
    assert.equal(Number(after["#p-en-start"].zoom), 1.25);
    assert.equal(Number(after["#ul-fa"].zoom), 1.25);
    assert.equal(Number(after["#code-block"].zoom), 1.25);
    assert.equal(Number(after["#li-fa-1"].zoom), 1, "scale is applied once, on the outermost block");
    assert.equal(
      Math.round(parseFloat(after["#p-en-start"].lineHeight) / parseFloat(after["#p-en-start"].fontSize) * 10) / 10,
      2.2,
    );
    const widths = await page.evaluate(() => ({
      paragraph: document.querySelector("#p-en-start").getBoundingClientRect().right,
      main: document.querySelector("main").getBoundingClientRect().right,
      scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    }));
    assert.ok(widths.paragraph <= widths.main + 1, "scaled text still fits its column");
    assert.equal(widths.scroll, true, "no horizontal scrolling introduced");
  });

  await step("preferences persist: a reloaded page and a reopened popup show the saved choices", async () => {
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.getAttribute("data-readela-size") === "125");
    await waitForMark(page, "#p-en-start", "rtl");
    const rootMarks = await page.evaluate(() => ({
      font: document.documentElement.getAttribute("data-readela-font"),
      spacing: document.documentElement.getAttribute("data-readela-spacing"),
    }));
    assert.deepEqual(rootMarks, { font: "serif", spacing: "2.2" });
    await loadPopup(popup, popupUrl);
    await popup.waitForFunction(() => document.querySelector("#size").value === "125");
    const shown = await popup.evaluate(() => ({
      font: document.querySelector("#font").value,
      spacing: document.querySelector("#spacing").value,
      direction: document.querySelector('input[name="direction"]:checked').value,
      enabled: document.querySelector("#enabled").checked,
    }));
    assert.deepEqual(shown, { font: "serif", spacing: "2.2", direction: "auto", enabled: true });
    await front(page);
  });

  await step("turning Readela off restores the page and keeps page-owned changes made meanwhile", async () => {
    // The page changes two of its own attributes while Readela is on.
    await page.evaluate(() => {
      document.querySelector("#p-ar").setAttribute("dir", "rtl");
      document.querySelector("#p-he").style.color = "rgb(1, 2, 3)";
    });
    await setPreference((p) => press(p, "#enabled"));
    await page.waitForFunction(() => document.querySelector("[data-readela-dir]") === null);
    assert.deepEqual(await footprint(page), { marked: 0, customProperties: 0 });
    const state = await page.evaluate((source) => {
      const original = new DOMParser().parseFromString(source, "text/html");
      const strip = (html) => html.replace(/\s+/g, " ");
      const live = document.querySelector("#turn-fa").cloneNode(true);
      return {
        sameMarkup: strip(live.innerHTML) === strip(original.querySelector("#turn-fa").innerHTML),
        rootAttributes: document.documentElement.getAttributeNames().sort(),
        pageDir: document.querySelector("#p-ar").getAttribute("dir"),
        pageColour: document.querySelector("#p-he").style.color,
      };
    }, fixtureSource);
    assert.equal(state.sameMarkup, true, "markup of the first reply is byte-for-byte the page's own");
    assert.deepEqual(state.rootAttributes, ["dir", "lang"]);
    assert.equal(state.pageDir, "rtl");
    assert.equal(state.pageColour, "rgb(1, 2, 3)");
    const facts = await inspect(page, ["#p-en-start", "#ul-physical", "#quote-fa", "#p-en"]);
    // Back to the page's own first-strong handling and physical layout.
    assert.equal(facts["#p-en-start"].unicodeBidi, "plaintext");
    assert.equal(parseFloat(facts["#ul-physical"].paddingLeft), 30);
    assert.equal(parseFloat(facts["#quote-fa"].borderLeftWidth), 3);
    assert.equal(Number(facts["#p-en"].zoom), 1);
  });

  await step("while off, new content is left alone (observers are released)", async () => {
    await page.evaluate(() => {
      const paragraph = document.createElement("p");
      paragraph.id = "p-while-off";
      paragraph.textContent = "React در حالت خاموش";
      document.querySelector("#turn-other").append(paragraph);
    });
    await sleep(400);
    assert.deepEqual(await footprint(page), { marked: 0, customProperties: 0 });
  });

  await step("repeated enabling and disabling does not stack anything", async () => {
    for (let round = 0; round < 4; round += 1) {
      await setPreference((p) => press(p, "#enabled"));
      await waitForMark(page, "#p-while-off", "rtl");
      await setPreference((p) => press(p, "#enabled"));
      await page.waitForFunction(() => document.querySelector("[data-readela-dir]") === null);
    }
    await page.evaluate(() => {
      const paragraph = document.createElement("p");
      paragraph.id = "p-after-rounds";
      paragraph.textContent = "Vue هم یک فریم‌ورک است";
      document.querySelector("#turn-other").append(paragraph);
    });
    await sleep(400);
    assert.deepEqual(await footprint(page), { marked: 0, customProperties: 0 }, "no observer survived being turned off");
    await setPreference((p) => press(p, "#enabled"));
    await waitForMark(page, "#p-after-rounds", "rtl");
    const counts = await page.evaluate(() => ({
      mirrored: document.querySelectorAll("[data-readela-mirror]").length,
      physicalStyle: document.querySelector("#ul-physical").getAttribute("style"),
    }));
    assert.equal(counts.mirrored, 2);
    assert.equal(counts.physicalStyle.match(/--readela-padding-start/g).length, 1);
  });

  await step("reset returns reading settings to the page's own presentation and keeps Readela on", async () => {
    await setPreference((p) => press(p, "#reset"));
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-readela-size"));
    const state = await page.evaluate(() => ({
      root: document.documentElement.getAttributeNames().filter((name) => name.startsWith("data-readela")),
      zoom: getComputedStyle(document.querySelector("#p-en-start")).zoom,
      mark: document.querySelector("#p-en-start").getAttribute("data-readela-dir"),
    }));
    assert.deepEqual(state, { root: [], zoom: "1", mark: "rtl" });
    const shown = await popup.evaluate(() => ({
      font: document.querySelector("#font").value,
      size: document.querySelector("#size").value,
      spacing: document.querySelector("#spacing").value,
      direction: document.querySelector('input[name="direction"]:checked').value,
      enabled: document.querySelector("#enabled").checked,
      status: document.querySelector("#status").textContent,
    }));
    assert.deepEqual(shown, {
      font: "page", size: "page", spacing: "page", direction: "auto", enabled: true, status: "Reading settings were reset.",
    });
  });

  // Where real input cannot reach the extension page, these two checks run on
  // the stand-in rendering of the same popup files.
  const ui = input ? popup : await openStandInPopup(browser, name);
  report.popupInputEvidence = input
    ? "installed popup, real pointer and key input"
    : "installed popup operated through its DOM; keyboard and contrast checked on a stand-in rendering of the same files";

  await step("the popup is fully operable from the keyboard with a visible focus indicator", async () => {
    await front(ui);
    if (input) await loadPopup(popup, popupUrl);
    await ui.evaluate(() => document.body.focus());
    const visited = [];
    const focused = () =>
      ui.evaluate(() => {
        const element = document.activeElement;
        const style = getComputedStyle(element);
        return { id: element.id || element.name, outline: `${style.outlineStyle} ${parseFloat(style.outlineWidth)}` };
      });
    const order = ["enabled", "direction", "font", "size", "spacing", "reset"];
    for (const expected of order) {
      await ui.keyboard.press("Tab");
      visited.push(await focused());
    }
    assert.deepEqual(visited.map((entry) => entry.id), order);
    for (const entry of visited) assert.equal(entry.outline, "solid 3", entry.id);
    // Focus is not trapped: it moves back as well as forward.
    await ui.keyboard.down("Shift");
    await ui.keyboard.press("Tab");
    await ui.keyboard.up("Shift");
    assert.equal((await focused()).id, "spacing");

    // Operate every kind of control without the mouse.
    await ui.focus("#enabled");
    await ui.keyboard.press(" ");
    await ui.waitForFunction(() => document.querySelector("#enabled-label").textContent === "Off");
    await ui.keyboard.press(" ");
    await ui.waitForFunction(() => document.querySelector("#enabled-label").textContent === "On");
    await ui.focus('input[name="direction"]:checked');
    await ui.keyboard.press("ArrowDown");
    await ui.waitForFunction(() => document.querySelector('input[name="direction"]:checked').value === "rtl");
    await ui.keyboard.press("ArrowUp");
    await ui.waitForFunction(() => document.querySelector('input[name="direction"]:checked').value === "auto");
    await ui.focus("#reset");
    await ui.keyboard.press("Enter");
    await ui.waitForFunction(() => document.querySelector("#status").textContent !== "");
    await front(page);
    await waitForMark(page, "#p-en-start", "rtl");
  });

  for (const scheme of schemes) {
    await step(`${scheme} theme: popup text contrast, 320px fit, and readable page text`, () =>
      checkTheme({ name, ui, page, scheme, emulate: input, report }),
    );
  }

  await step("the extension makes no network request", async () => {
    // Inline data: resources never reach the network and are not counted.
    const unexpected = requests.filter((url) => url !== FIXTURE_URL && !url.startsWith("data:"));
    assert.deepEqual(unexpected, [], "every request seen on the fixture page is the fixture document itself");
    const stored = await popup.evaluate(async () => {
      const api = globalThis.browser ?? globalThis.chrome;
      return api.storage.local.get(null);
    });
    assert.deepEqual(Object.keys(stored), ["readela.preferences"], "only the preferences object is stored");
    assert.deepEqual(Object.keys(stored["readela.preferences"]).sort(), ["direction", "enabled", "font", "size", "spacing", "version"]);
  });

  report.fixtureRequests = [...new Set(requests)].map((url) => (url.startsWith("data:") ? `${url.slice(0, 24)}…` : url));
  if (ui !== popup) await ui.close();
  await page.close();
  await popup.close();
  return steps;
}

// ---------------------------------------------------------------------------
// Live start page (signed out, nothing sent)

async function runLive(name, browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const requests = [];
  page.on("request", (request) => {
    let initiator;
    try {
      initiator = JSON.stringify(request.initiator?.() ?? null);
    } catch {
      initiator = null;
    }
    requests.push({ url: request.url(), initiator });
  });
  const outcome = { url: "https://chatgpt.com/" };
  try {
    await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(8000);
    Object.assign(
      outcome,
      await page.evaluate(() => {
        const editable = [...document.querySelectorAll('textarea, input, [contenteditable]:not([contenteditable="false"])')];
        const marked = [...document.querySelectorAll("[data-readela-dir]")];
        return {
          finalUrl: location.href,
          title: document.title,
          hasMain: document.querySelector("main") !== null,
          editableFields: editable.length,
          editableTouched: editable.filter(
            (element) =>
              element.closest("[data-readela-dir], [data-readela-top]") !== null ||
              element.querySelector("[data-readela-dir]") !== null,
          ).length,
          markedBlocks: marked.length,
          markedSample: marked.slice(0, 5).map((element) => `${element.tagName.toLowerCase()}:${element.getAttribute("data-readela-dir")}`),
        };
      }),
    );
    outcome.botCheck = /just a moment|verify you are human|attention required/i.test(outcome.title ?? "");
    await page.screenshot({ path: path.join(results, `${name}-live.png`) });
  } catch (error) {
    outcome.error = String(error?.message ?? error).split("\n")[0];
  }
  const hosts = {};
  for (const { url } of requests) {
    try {
      const host = new URL(url).host || url.split(":")[0];
      hosts[host] = (hosts[host] ?? 0) + 1;
    } catch {
      hosts.other = (hosts.other ?? 0) + 1;
    }
  }
  outcome.pageRequestCount = requests.length;
  outcome.pageRequestHosts = hosts;
  outcome.requestsInitiatedByExtension = requests
    .filter(({ url, initiator }) => /^(chrome|moz)-extension:/.test(url) || /(chrome|moz)-extension:/.test(initiator ?? ""))
    .map(({ url }) => url);
  await page.close();
  return outcome;
}

// ---------------------------------------------------------------------------

mkdirSync(results, { recursive: true });
const summary = { startedAt: new Date().toISOString(), browsers: {} };
let failed = false;

for (const name of selected) {
  console.log(`\n${name}`);
  const report = {};
  summary.browsers[name] = report;
  let started;
  try {
    started = await start(name);
  } catch (error) {
    report.unavailable = `could not start or install the extension: ${String(error?.message ?? error).split("\n")[0]}`;
    console.log(`  not run: ${report.unavailable}`);
    failed = true;
    continue;
  }
  if (started.unavailable) {
    report.unavailable = started.unavailable;
    console.log(`  not run: ${report.unavailable}`);
    continue;
  }
  const { browser, popupUrl } = started;
  try {
    report.version = await browser.version();
    report.headless = headless;
    console.log(`  ${report.version}${headless ? " (headless)" : ""}`);
    report.steps = await runSuite(name, browser, popupUrl, started.input, started.input ? ["light", "dark"] : ["light"], report);
    if (report.steps.some((entry) => !entry.ok)) failed = true;
    if (flag("--live")) {
      report.live = await runLive(name, browser);
      console.log(`  live: ${JSON.stringify(report.live)}`);
    }
  } finally {
    await browser.close();
  }

  if (!started.input) {
    // Second launch for the dark theme, which cannot be switched at runtime here.
    const dark = await start(name, "dark");
    try {
      const page = await openFixture(dark.browser, []);
      await waitForMark(page, "#p-en-start", "rtl");
      const ui = await openStandInPopup(dark.browser, name);
      const title = "dark theme: popup text contrast, 320px fit, and readable page text";
      try {
        await checkTheme({ name, ui, page, scheme: "dark", emulate: false, report });
        report.steps.push({ title, ok: true });
        console.log(`  ok    ${title}`);
      } catch (error) {
        failed = true;
        report.steps.push({ title, ok: false, error: String(error?.message ?? error) });
        console.log(`  FAIL  ${title}
        ${String(error?.message ?? error)}`);
      }
    } finally {
      await dark.browser.close();
    }
  }
}

writeFileSync(path.join(results, "e2e-report.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nreport: ${path.relative(root, path.join(results, "e2e-report.json"))}`);
process.exitCode = failed ? 1 : 0;
