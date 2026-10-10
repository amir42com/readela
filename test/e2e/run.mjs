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
// --live additionally opens the real start pages of the supported sites, signed
// out, without sending anything. It reports what it observed; it is a smoke
// check, not a substitute for the fixture checks.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { getInstalledBrowsers } from "@puppeteer/browsers";
import puppeteer from "puppeteer-core";

import { PAGE_MARK, THEMES } from "../../src/core/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const results = path.join(root, "test-results");
const fixtureSource = readFileSync(path.join(root, "test", "e2e", "fixtures", "conversation.html"), "utf8");
const claudeSource = readFileSync(path.join(root, "test", "e2e", "fixtures", "claude-conversation.html"), "utf8");
const longSource = readFileSync(path.join(root, "test", "e2e", "fixtures", "claude-long-conversation.html"), "utf8");
const FIXTURE_URL = "https://chatgpt.com/c/readela-fixture";
const CLAUDE_FIXTURE_URL = "https://claude.ai/chat/readela-fixture";
const LONG_FIXTURE_URL = "https://claude.ai/chat/readela-long-fixture";
// The single-page sites change the address without loading a document; a
// reload at such an address is answered with the conversation it belongs to.
const FIXTURES = {
  [FIXTURE_URL]: fixtureSource,
  "https://chatgpt.com/g/g-p-0123456789abcdef-fixture-project/c/readela-fixture": fixtureSource,
  [CLAUDE_FIXTURE_URL]: claudeSource,
  [LONG_FIXTURE_URL]: longSource,
};

// A file inside the installed extension: never a network request.
const EXTENSION_FILE = /^(?:chrome|moz)-extension:\/\//;

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
async function start(name, firefoxScheme = "light", userDataDir = undefined) {
  const extensionPath = path.join(root, "dist", name);
  if (!existsSync(path.join(extensionPath, "manifest.json"))) {
    throw new Error(`dist/${name} is missing; run "npm run build" first`);
  }

  if (name === "chrome") {
    const executablePath = chromeExecutable();
    if (!executablePath) return { unavailable: "no Chrome or Chromium executable found (set READELA_CHROME)" };
    const browser = await puppeteer.launch({ browser: "chrome", executablePath, headless, pipe: true, enableExtensions: true, userDataDir });
    const id = await browser.installExtension(extensionPath);
    return { browser, popupUrl: `chrome-extension://${id}/popup/popup.html`, input: true };
  }

  const executablePath = await firefoxExecutable();
  if (!executablePath) return { unavailable: 'no Firefox executable found (run "npm run browsers:firefox" or set READELA_FIREFOX)' };
  const browser = await puppeteer.launch({
    browser: "firefox",
    executablePath,
    headless,
    userDataDir,
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

async function openFixture(browser, requests, address = FIXTURE_URL) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    requests.push(url);
    if (url in FIXTURES) {
      request.respond({ status: 200, contentType: "text/html; charset=utf-8", body: FIXTURES[url] });
    } else if (EXTENSION_FILE.test(url)) {
      request.continue();
    } else {
      request.abort();
    }
  });
  await page.goto(address, { waitUntil: "load" });
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
    "globalThis.browser = (() => { const data = {}; return { " +
    "runtime: { id: 'stand-in', getManifest: () => ({ version: '0.0.0' }) }, " +
    "tabs: { query: async () => [], sendMessage: async () => { throw new Error('no page'); } }, " +
    "storage: { local: { get: async () => ({ ...data }), set: async (values) => { Object.assign(data, values); } }, " +
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
const hexRgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const isColour = (computed, hex) => rgb(computed).join() === hexRgb(hex).join();

// Colours of elements as rendered: the text colour, the element's own
// background and the first background behind it that covers what is under it
// (a faint see-through tint is not what text is read against), with its
// shape. How opaque a colour is, is asked of the browser itself, by painting it.
const colours = (page, selectors) =>
  page.evaluate((list) => {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const painted = (colour) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "#000";
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3];
    };
    const facts = {};
    for (const selector of list) {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      let background = style.backgroundColor;
      for (let node = element.parentElement; node && painted(background) < 200; node = node.parentElement) {
        background = getComputedStyle(node).backgroundColor;
      }
      const box = element.getBoundingClientRect();
      facts[selector] = {
        color: style.color,
        own: style.backgroundColor,
        opacity: painted(style.backgroundColor),
        background: painted(background) < 200 ? "rgb(255, 255, 255)" : background,
        sheet: element.getAttribute("data-readela-sheet"),
        island: element.getAttribute("data-readela-island"),
        underline: style.textDecorationLine,
        radius: style.borderTopLeftRadius,
        overflow: `${style.overflowX} ${style.overflowY}`,
        edges: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor].join(" | "),
        box: [box.left, box.top, box.right, box.bottom].map(Math.round).join(" "),
      };
    }
    return facts;
  }, selectors);

// The first pixel of a PNG image. In the first row every PNG filter leaves
// the first pixel as it is.
function firstPixel(png) {
  const chunks = [];
  let depth = 0;
  let colourType = 0;
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") [depth, colourType] = [body[8], body[9]];
    if (type === "IDAT") chunks.push(body);
    offset += 12 + length;
  }
  assert.ok(depth === 8 && (colourType === 2 || colourType === 6), `PNG format ${depth}/${colourType}`);
  const raw = inflateSync(Buffer.concat(chunks));
  return [raw[1], raw[2], raw[3]];
}

// One pixel of the page as the browser painted it.
const pixelAt = async (page, x, y) =>
  firstPixel(Buffer.from(await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } })));
const near = (pixel, expected, tolerance = 4) => pixel.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

// Paper and Night on one synthetic conversation. Readela owns the text of a
// response and nothing else: the reading surface and its text take the
// theme's colours at 10:1 or better; a code block stays the site's as a whole,
// with nothing of another colour showing around its corners; the reader's own
// messages, the application shell, a layout that is not recognised and a
// conversation the site keeps hidden do not change at all. Run with the page
// in a light and in a dark colour scheme, so each theme is checked both with
// and against the site's own.
async function checkReadingThemes({ name, page, choose, scheme, parts, report }) {
  const units = parts.units ?? [];
  const semantic = parts.semantic ? Object.values(parts.semantic) : [];
  const all = [
    ...new Set([
      ...parts.text, parts.link, parts.inlineCode, parts.header, parts.sheet, parts.site, ...parts.outside, ...semantic,
      ...units.flatMap((unit) => [unit.frame, unit.unit, ...unit.inside]),
      ...(parts.pre ? [parts.pre] : []),
    ]),
  ];
  const original = await colours(page, all);
  // The site's own colours: the background painted behind the conversation
  // and the text colour there.
  const site = { surface: original[parts.site].own, text: original[parts.site].color };
  assert.equal(original[parts.site].opacity, 255, `the ${scheme} page has a painted background: ${site.surface}`);
  const kept = parts.kept ? await page.$eval(parts.kept, (element) => element.outerHTML) : null;

  for (const [theme, palette] of Object.entries(THEMES)) {
    await choose("theme", theme);
    await page.waitForFunction(
      (selector, value) =>
        document.documentElement.getAttribute("data-readela-theme") === value &&
        document.querySelector(selector).hasAttribute("data-readela-sheet"),
      {},
      parts.sheet,
      theme,
    );
    const facts = await colours(page, all);
    const label = `${theme} on a ${scheme} ${parts.name} page`;

    assert.equal(facts[parts.sheet].sheet, "", `${label}: the response text is the reading surface`);
    assert.ok(isColour(facts[parts.sheet].own, palette.surface), `${label}: surface ${facts[parts.sheet].own}`);
    const ratios = {};
    for (const selector of parts.text) {
      assert.ok(isColour(facts[selector].color, palette.text), `${label}: ${selector} text ${facts[selector].color}`);
      const ratio = contrast(rgb(facts[selector].color), rgb(facts[selector].background));
      ratios[selector] = Math.round(ratio * 100) / 100;
      assert.ok(ratio >= 10, `${label}: ${selector} contrast ${ratio.toFixed(2)}`);
    }
    assert.ok(isColour(facts[parts.link].color, palette.link), `${label}: link colour ${facts[parts.link].color}`);
    assert.match(facts[parts.link].underline, /underline/, `${label}: links are underlined, not colour alone`);
    assert.ok(contrast(rgb(facts[parts.link].color), rgb(facts[parts.link].background)) >= 7, `${label}: link contrast`);
    assert.ok(isColour(facts[parts.inlineCode].own, palette.code), `${label}: inline code background`);
    assert.ok(isColour(facts[parts.header].own, palette.head), `${label}: table header background`);

    if (parts.pre) {
      // A plain pre block with a see-through background: on the site's own
      // background, with the site's own text colour.
      assert.equal(facts[parts.pre].own, site.surface, `${label}: code block background`);
      assert.equal(facts[parts.pre].color, site.text, `${label}: code block text`);
      assert.equal(facts[parts.pre].island, "surface text", `${label}: code block is a unit of the site's`);
    }

    // A code block with a header and controls is one unit of the site's:
    // every colour in it, its own background, its shape and its clipping are
    // as the site made them.
    for (const unit of units) {
      for (const selector of [unit.unit, ...unit.inside]) {
        assert.deepEqual(
          { color: facts[selector].color, own: facts[selector].own, radius: facts[selector].radius, overflow: facts[selector].overflow, edges: facts[selector].edges },
          { color: original[selector].color, own: original[selector].own, radius: original[selector].radius, overflow: original[selector].overflow, edges: original[selector].edges },
          `${label}: ${selector} is as the site made it`,
        );
      }
      assert.equal(facts[unit.frame].box, facts[unit.unit].box, `${label}: ${unit.frame} is exactly as large as the unit in it`);
      assert.equal(facts[unit.frame].overflow, original[unit.frame].overflow, `${label}: ${unit.frame} clips nothing it did not clip`);
      if (original[unit.unit].opacity === 255) {
        // The unit brings an opaque background: nothing is painted behind it.
        assert.ok(!facts[unit.frame].island.includes("surface"), `${label}: ${unit.frame} needs no background (${facts[unit.frame].island})`);
        if (unit.frame !== unit.unit) assert.equal(facts[unit.frame].opacity, 0, `${label}: nothing is painted behind ${unit.unit}`);
      } else {
        // The unit is see-through: the site's own background is behind it, in
        // the unit's own rounded shape.
        assert.ok(facts[unit.frame].island.includes("surface round"), `${label}: ${unit.frame} (${facts[unit.frame].island})`);
        assert.equal(facts[unit.frame].own, site.surface, `${label}: the site's background behind ${unit.unit}`);
        assert.equal(facts[unit.frame].radius, original[unit.unit].radius, `${label}: in the unit's own shape`);
        assert.notEqual(parseFloat(facts[unit.frame].radius), 0, `${label}: the unit is rounded`);
      }
      // What the browser painted just inside the corner of the unit's box,
      // outside its rounded shape: the reading surface, not a white or black
      // corner of a wrapper.
      const corner = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        element.scrollIntoView({ block: "center" });
        const box = element.getBoundingClientRect();
        return { x: box.left + 2, y: box.top + 2, inside: [box.left + box.width / 2, box.top + 4] };
      }, unit.frame);
      const painted = await pixelAt(page, corner.x, corner.y);
      assert.ok(near(painted, hexRgb(palette.surface)), `${label}: corner of ${unit.frame} is painted ${painted}, the surface is ${hexRgb(palette.surface)}`);
      assert.ok(contrast(rgb(facts[unit.inside[0]].color), rgb(facts[unit.inside[0]].background)) >= 4.5, `${label}: ${unit.inside[0]} stays readable`);
    }

    if (parts.semantic) {
      const names = parts.semantic;
      const extra = await page.evaluate((selectors) => {
        const style = (selector, pseudo) => getComputedStyle(document.querySelector(selector), pseudo);
        const quote = style(selectors.quote);
        const sides = ["Left", "Right"].filter((side) => parseFloat(quote[`border${side}Width`]) > 0);
        const table = document.querySelector(selectors.tableScroll);
        return {
          marker: style(selectors.item, "::marker").color,
          quoteSides: sides.length,
          quoteBar: quote[`border${sides[0]}Color`],
          quoteWidth: parseFloat(quote[`border${sides[0]}Width`]),
          quoteIndent: parseFloat(quote.paddingLeft) + parseFloat(quote.paddingRight),
          cellEdge: style(selectors.cell).borderTopColor,
          formulaLine: style(selectors.formulaLine).borderBottomColor,
          formulaText: style(selectors.formula).color,
          formulaFont: style(selectors.formula).fontFamily,
          tableOverflow: getComputedStyle(table).overflowX,
          tableSheet: table.getAttribute("data-readela-sheet"),
          tableFrameSheet: document.querySelector(selectors.tableFrame).getAttribute("data-readela-sheet"),
          tableFrameIsland: document.querySelector(selectors.tableFrame).getAttribute("data-readela-island"),
        };
      }, names);
      const surface = hexRgb(palette.surface);
      // A list marker, small and struck text: secondary text, still at 7:1.
      for (const [what, colour] of [["list marker", extra.marker], ["struck text", facts[names.struck].color], ["small text", facts[names.small].color]]) {
        assert.ok(isColour(colour, palette.muted), `${label}: ${what} ${colour}`);
        assert.ok(contrast(rgb(colour), surface) >= 7, `${label}: ${what} contrast`);
      }
      // A quotation keeps its indentation and a bar that can be seen.
      assert.equal(extra.quoteSides, 1, `${label}: the quotation has one bar`);
      assert.ok(isColour(extra.quoteBar, palette.quote), `${label}: quotation bar ${extra.quoteBar}`);
      assert.ok(extra.quoteWidth >= 2 && extra.quoteIndent >= 8, `${label}: quotation bar ${extra.quoteWidth}px, indent ${extra.quoteIndent}px`);
      assert.ok(contrast(rgb(extra.quoteBar), surface) >= 3, `${label}: quotation bar contrast`);
      // Highlighted text stays highlighted.
      assert.ok(isColour(facts[names.highlight].own, palette.selection), `${label}: highlight ${facts[names.highlight].own}`);
      assert.ok(contrast(rgb(facts[names.highlight].color), rgb(facts[names.highlight].own)) >= 7, `${label}: highlighted text contrast`);
      // A table keeps its lines, and its wrappers are part of the surface and
      // still scroll sideways.
      assert.ok(isColour(extra.cellEdge, palette.rule), `${label}: table line ${extra.cellEdge}`);
      assert.deepEqual(
        { overflow: extra.tableOverflow, scroll: extra.tableSheet, frame: extra.tableFrameSheet, unit: extra.tableFrameIsland },
        { overflow: "auto", scroll: "inner", frame: "inner", unit: null },
        `${label}: table wrappers`,
      );
      // A row of controls inside a response shows no text of its own: it is
      // the site's, and nothing is painted behind it.
      assert.equal(facts[names.controls].opacity, 0, `${label}: nothing is painted behind the table's controls`);
      assert.ok(facts[names.controls].island !== null && !facts[names.controls].island.includes("surface"), `${label}: table controls (${facts[names.controls].island})`);
      // A formula keeps its own font, and the lines it is drawn with keep the text's colour.
      assert.equal(extra.formulaLine, extra.formulaText, `${label}: formula line`);
      assert.ok(isColour(extra.formulaText, palette.text), `${label}: formula text`);
      assert.match(extra.formulaFont, /Times New Roman/, `${label}: formula font`);
    }

    for (const selector of parts.outside) {
      assert.deepEqual(
        { color: facts[selector].color, own: facts[selector].own, sheet: facts[selector].sheet, island: facts[selector].island },
        { color: original[selector].color, own: original[selector].own, sheet: null, island: null },
        `${label}: ${selector} is not Readela's and is unchanged`,
      );
    }
    if (parts.kept) {
      assert.equal(await page.$eval(parts.kept, (element) => element.outerHTML), kept, `${label}: the hidden conversation is untouched`);
    }
    const selection = await page.evaluate((selector) => {
      const style = getComputedStyle(document.querySelector(selector), "::selection");
      return { background: style.backgroundColor, color: style.color };
    }, parts.text[0]);
    assert.ok(isColour(selection.background, palette.selection), `${label}: selection background ${selection.background}`);
    assert.ok(contrast(rgb(selection.color), rgb(selection.background)) >= 7, `${label}: selected text contrast`);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      true,
      `${label}: no horizontal scrolling introduced`,
    );
    ((report.readingThemeContrast ??= {})[parts.name] ??= {})[label] = ratios;
    await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: "start" }), parts.sheet);
    await page.screenshot({ path: path.join(results, `${name}-${parts.name}-${theme}-on-${scheme}.png`) });
    if (units.length > 0) {
      await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: "center" }), units[0].frame);
      await page.screenshot({ path: path.join(results, `${name}-${parts.name}-${theme}-on-${scheme}-code.png`) });
    }
  }

  await choose("theme", "page");
  await page.waitForFunction(() => document.querySelector("[data-readela-sheet], [data-readela-island]") === null);
  const restored = await colours(page, all);
  for (const selector of all) {
    assert.deepEqual(
      { color: restored[selector].color, own: restored[selector].own, radius: restored[selector].radius },
      { color: original[selector].color, own: original[selector].own, radius: original[selector].radius },
      `Original restores ${selector}`,
    );
  }
  assert.equal(
    await page.evaluate(() => document.documentElement.getAttribute("style")),
    null,
    "nothing is left on the root element",
  );
  assert.equal(
    await page.evaluate(() => document.querySelectorAll('[style*="--readela-island"]').length),
    0,
    "nothing is left on a code block",
  );
}

const CHATGPT_PARTS = {
  name: "chatgpt",
  sheet: "#md-fa",
  // The conversation region paints the page background: opaque black in the dark theme.
  site: "#main",
  text: ["#p-en-start", "#h-fa", "#li-fa-1", "#quote-fa-p", "#td-fa", "#th-fa", "#math", "#inline-code", "#p-en", "#li-en-a"],
  link: "#link-text",
  inlineCode: "#inline-code",
  pre: "#code-block",
  header: "#th-fa",
  units: [
    // A rounded code block without a pre element, inside a plain wrapper.
    { frame: "#block-wrap", unit: "#block", inside: ["#block-label", "#block-code", "#block-keyword", "#block-copy"] },
    // The same inside a list item, where it is surrounded by reading text.
    { frame: "#nested-block", unit: "#nested-block", inside: ["#nested-label", "#nested-code", "#nested-copy"] },
  ],
  semantic: {
    item: "#li-fa-1",
    quote: "#quote-fa",
    struck: "#struck-text",
    small: "#small-text",
    highlight: "#marked-text",
    cell: "#td-fa",
    formula: "#math",
    formulaLine: "#math-line",
    tableScroll: "#table-scroll",
    tableFrame: "#table-frame",
    controls: "#table-actions",
  },
  // The frame of a reply holds a heading for screen readers and controls; the
  // reader's own bubbles, inside and out; the bar the site keeps on top; a
  // reply in a layout that is not recognised; the composer; the page itself.
  outside: [
    "#turn-fa", "#sr-fa", "#copy-fa", "#nav-title", "#page-button", "#user-bubble-frame", "#user-bubble", "#user-bubble-en",
    "#thread-bar", "#thread-share", "#turn-other", "#p-ar", "#composer-textarea", "#send-button", "#main", "#scroller",
  ],
  kept: "#main-kept",
};

const CLAUDE_PARTS = {
  name: "claude",
  sheet: "#c-markdown-fa",
  site: "body",
  text: ["#c-p-en-start", "#c-h-fa", "#c-li-fa-1", "#c-quote-fa-p", "#c-th-fa", "#c-math", "#c-inline-code", "#c-p-en"],
  link: "#c-link-url",
  inlineCode: "#c-inline-code",
  header: "#c-th-fa",
  units: [
    // A rounded, see-through code block with a header and a pre element inside.
    { frame: "#c-code-frame", unit: "#c-code-group", inside: ["#c-code-label", "#c-code-block", "#c-code", "#c-code-keyword", "#c-code-copy"] },
  ],
  outside: [
    "#c-nav-title", "#c-page-button", "#c-user-bubble", "#c-user", "#c-user-rich-bubble", "#c-user-rich-p", "#c-user-code",
    "#c-ui-p", "#c-input", "#c-send", "#c-scroller",
  ],
};

// ---------------------------------------------------------------------------
// Theme check, shared by the main suite and the Firefox dark-theme pass

async function checkTheme({ name, ui, page, scheme, emulate, report, choose }) {
  const prepare = async (target) => {
    if (emulate) await target.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
    await sleep(100);
    const active = await target.evaluate((value) => matchMedia(`(prefers-color-scheme: ${value})`).matches, scheme);
    assert.equal(active, true, `the ${scheme} colour scheme is in effect`);
  };

  await front(ui);
  await ui.setViewport({ width: 320, height: 640 });
  await prepare(ui);
  const shown = await ui.evaluate(() => {
    const pair = (selector) => {
      const element = document.querySelector(selector);
      let background = "rgba(0, 0, 0, 0)";
      for (let node = element; node && /rgba\(0, 0, 0, 0\)|transparent/.test(background); node = node.parentElement) {
        background = getComputedStyle(node).backgroundColor;
      }
      return { color: getComputedStyle(element).color, background };
    };
    return {
      heading: pair("h1"),
      note: pair("#state-note"),
      hint: pair("#place-guide"),
      legend: pair(".group legend"),
      segment: pair(".segments label:not(:has(input:checked)) span"),
      selected: pair(".segments label:has(input:checked) span"),
      button: pair("#place-save"),
      reset: pair("#reset"),
      about: pair(".about"),
      link: pair("#publisher"),
      fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      height: Math.ceil(document.querySelector("main").getBoundingClientRect().height),
    };
  });
  assert.equal(shown.fits, true, "no horizontal overflow at 320px");
  // Browsers cap a popup at about 600px; at its own size everything is
  // reachable without scrolling.
  assert.ok(shown.height <= 600, `popup height ${shown.height}`);
  const measured = {};
  for (const key of ["heading", "note", "hint", "legend", "segment", "selected", "button", "reset", "about", "link"]) {
    const ratio = contrast(rgb(shown[key].color), rgb(shown[key].background));
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
  await checkReadingThemes({ name, page, choose, scheme, parts: CHATGPT_PARTS, report });
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
      // Where in this file the check stopped.
      const where = String(error?.stack ?? "").split("\n").find((line) => /run\.mjs:\d+/.test(line));
      if (where) detail.push(where.trim());
      steps.push({ title, ok: false, error: detail.join("\n") });
      console.log(`  FAIL  ${title}\n        ${detail.join("\n        ")}`);
    }
  };

  const requests = [];
  const page = await openFixture(browser, requests);
  const popup = await openPopup(browser, popupUrl);
  const popupRequests = [];
  popup.on("request", (request) => popupRequests.push(request.url()));
  await loadPopup(popup, popupUrl);
  await front(page);

  const press = (target, selector) =>
    input ? target.click(selector) : target.$eval(selector, (element) => element.click());

  const setPreference = async (action) => {
    await front(popup);
    await action(popup);
    await front(page);
  };
  const choose = (group, value) => setPreference((p) => press(p, `input[name="${group}"][value="${value}"]`));
  const picked = (target) =>
    target.evaluate(() => {
      const value = (group) => document.querySelector(`input[name="${group}"]:checked`).value;
      return {
        direction: value("direction"),
        theme: value("theme"),
        font: value("font"),
        size: value("size"),
        spacing: value("spacing"),
        enabled: document.querySelector("#enabled").checked,
      };
    });
  // The address of the popup once it has been told which tab it acts on.
  let popupAddress = popupUrl;

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
        sameText: document.querySelector("#main").textContent === original.querySelector("#main").textContent,
        sameElements: document.querySelectorAll("#main *").length === original.querySelectorAll("#main *").length,
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
      for (const turn of document.querySelectorAll("#main .turn")) turn.remove();
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

  await step("a conversation the site kept hidden is read when it is shown, and the one shown before is let go", async () => {
    const marksIn = (selector) =>
      page.$eval(selector, (element) => element.querySelectorAll("[data-readela-dir], [data-readela-top]").length);
    assert.equal(await marksIn("#main-kept"), 0, "while hidden it is not read");
    // The site swaps which conversation is shown and changes the address. No
    // element is added or removed.
    await page.evaluate(() => {
      const [kept, shown] = document.querySelectorAll(".page");
      history.pushState({}, "", "/c/readela-fixture-kept");
      shown.style.display = "none";
      shown.dataset.appShellActivePage = "false";
      kept.style.display = "";
      kept.dataset.appShellActivePage = "true";
    });
    await waitForMark(page, "#kept-p", "ltr");
    assert.equal(await marksIn("#main"), 0, "nothing is left on the conversation that is no longer shown");
    await page.evaluate(() => {
      const [kept, shown] = document.querySelectorAll(".page");
      history.pushState({}, "", "/c/readela-fixture");
      kept.style.display = "none";
      kept.dataset.appShellActivePage = "false";
      shown.style.display = "";
      shown.dataset.appShellActivePage = "true";
    });
    await page.waitForFunction(() => document.querySelector("#main [data-readela-dir]") !== null, { polling: 200 });
    await page.waitForFunction(() => document.querySelector("#main-kept [data-readela-dir], #main-kept [data-readela-top]") === null, { polling: 200 });
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
    await choose("font", "sans");
    await choose("size", "125");
    await choose("spacing", "2.2");
    await page.waitForFunction(() => document.documentElement.getAttribute("data-readela-spacing") === "2.2");
    const after = await inspect(page, ["#p-en-start", "#code", "#h-fa", "#li-fa-1", "#ul-fa", "#code-block"]);
    assert.match(after["#p-en-start"].fontFamily, /^"?Readela Sans Arabic"?, system-ui/);
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
      main: document.querySelector("#main").getBoundingClientRect().right,
      scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    }));
    assert.ok(widths.paragraph <= widths.main + 1, "scaled text still fits its column");
    assert.equal(widths.scroll, true, "no horizontal scrolling introduced");
  });

  await step("Readela Sans shows Arabic-script text in the packaged font and leaves other scripts to system fonts", async () => {
    // Text is measured on a canvas that is never added to the page. A face
    // that is in use changes the width of the text it covers and of no other.
    const measured = await page.evaluate(async () => {
      const context = document.createElement("canvas").getContext("2d");
      const width = (font, text) => {
        context.font = font;
        return context.measureText(text).width;
      };
      const packaged = '40px "Readela Sans Arabic", monospace';
      const differs = (text) => width(packaged, text) !== width("40px monospace", text);
      const deadline = Date.now() + 8000;
      while (!differs("سلام دنیا") && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
      return { persian: differs("سلام دنیا"), arabic: differs("مرحبا بالعالم"), latin: differs("Hello world 123"), hebrew: differs("שלום עולם") };
    });
    assert.deepEqual(measured, { persian: true, arabic: true, latin: false, hebrew: false });
  });

  await step("preferences persist: a reloaded page and a reopened popup show the saved choices", async () => {
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.getAttribute("data-readela-size") === "125");
    await waitForMark(page, "#p-en-start", "rtl");
    const rootMarks = await page.evaluate(() => ({
      font: document.documentElement.getAttribute("data-readela-font"),
      spacing: document.documentElement.getAttribute("data-readela-spacing"),
    }));
    assert.deepEqual(rootMarks, { font: "sans", spacing: "2.2" });
    await loadPopup(popup, popupUrl);
    await popup.waitForFunction(() => document.querySelector('input[name="size"]:checked')?.value === "125");
    assert.deepEqual(await picked(popup), {
      direction: "auto", theme: "page", font: "sans", size: "125", spacing: "2.2", enabled: true,
    });
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
    assert.deepEqual(await picked(popup), {
      direction: "auto", theme: "page", font: "page", size: "page", spacing: "page", enabled: true,
    });
    assert.equal(
      await popup.$eval("#status", (element) => element.textContent),
      "Settings were reset. Your saved places are kept.",
    );
  });

  await step("Original direction leaves the page's own direction alone while other aspects still apply", async () => {
    await choose("direction", "page");
    await choose("size", "110");
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute("data-readela-size") === "110" &&
        document.querySelector("[data-readela-dir]") === null,
    );
    const facts = await inspect(page, ["#p-en-start", "#p-en"]);
    assert.equal(facts["#p-en-start"].mark, null);
    assert.equal(facts["#p-en-start"].unicodeBidi, "plaintext", "the page's own first-strong handling");
    assert.equal(facts["#p-en-start"].top, true, "still a reading block for the other aspects");
    assert.equal(Number(facts["#p-en-start"].zoom), 1.1);
    assert.equal(Number(facts["#p-en"].zoom), 1.1);
    assert.equal((await footprint(page)).customProperties, 0, "nothing is mirrored");
    await choose("direction", "auto");
    await choose("size", "page");
    await waitForMark(page, "#p-en-start", "rtl");
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-readela-size"));
  });

  // -------------------------------------------------------------------------
  // The saved place, operated from the installed popup

  const tabOf = (site) =>
    popup.evaluate(async (wanted) => {
      const extension = globalThis.browser ?? globalThis.chrome;
      for (const tab of await extension.tabs.query({})) {
        try {
          const answer = await extension.tabs.sendMessage(tab.id, { readelaMark: "status" });
          if (answer?.site === wanted) return tab.id;
        } catch {
          // Not a page this extension runs on.
        }
      }
      return null;
    }, site);
  const storedMarks = () =>
    popup.evaluate(async () => {
      const extension = globalThis.browser ?? globalThis.chrome;
      return (await extension.storage.local.get("readela.marks"))["readela.marks"] ?? null;
    });
  const places = (target) =>
    target.evaluate(() =>
      [...document.querySelectorAll("[data-readela-mark]")].map(
        (element) => `${element.id}:${element.getAttribute("data-readela-mark")}`,
      ),
    );
  const waitForPlace = (target, id, quality = "exact") =>
    target.waitForFunction(
      (i, q) =>
        document.querySelectorAll("[data-readela-mark]").length === 1 &&
        document.getElementById(i)?.getAttribute("data-readela-mark") === q,
      { timeout: 8000, polling: 200 },
      id,
      quality,
    );
  const waitForNoPlace = (target) =>
    target.waitForFunction(() => document.querySelector("[data-readela-mark]") === null, { timeout: 8000, polling: 200 });
  const waitForNote = async (text, timeout = 8000) => {
    try {
      // Polled on a timer: the popup's tab is not always the one in front,
      // and a tab in the background gets no animation frames to poll on.
      await popup.waitForFunction(
        (t) => document.querySelector("#place-note").textContent.startsWith(t),
        { timeout, polling: 200 },
        text,
      );
    } catch {
      const shown = await popup.$eval("#place-note", (element) => element.textContent);
      throw new Error(`the popup says "${shown}" instead of "${text}"`);
    }
  };
  const placeButton = async (button, target = page) => {
    await front(popup);
    await press(popup, `#place-${button}`);
    await front(target);
  };
  const buttons = () =>
    popup.evaluate(() => ({
      save: document.querySelector("#place-save").textContent,
      saveOff: document.querySelector("#place-save").disabled,
      returnOff: document.querySelector("#place-return").disabled,
      clearOff: document.querySelector("#place-clear").disabled,
    }));
  // The conversation scrolls in a region of its own; these move it at once.
  const scrollTop = (target = page, selector = "#scroller") => target.$eval(selector, (element) => element.scrollTop);
  const scrollTo = (value, target = page, selector = "#scroller") =>
    target.$eval(
      selector,
      (element, to) => {
        element.scrollTop = to === "end" ? element.scrollHeight : to;
      },
      value,
    );
  // Put a block `offset` pixels below the top edge of the scrolling region.
  const putAt = (id, offset, target = page, selector = "#scroller") =>
    target.evaluate(
      (i, o, s) => {
        const scroller = document.querySelector(s);
        const box = document.getElementById(i).getBoundingClientRect();
        scroller.scrollTop += box.top - scroller.getBoundingClientRect().top - o;
      },
      id,
      offset,
      selector,
    );
  const select = (id, target = page) =>
    target.evaluate((i) => {
      const element = document.getElementById(i);
      element.scrollIntoView({ block: "center" });
      getSelection().selectAllChildren(element);
    }, id);
  const inView = (id, target = page, selector = "#scroller") =>
    target.evaluate(
      (i, s) => {
        const element = document.getElementById(i);
        if (element === null) return false;
        const frame = document.querySelector(s).getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return box.top >= Math.max(0, frame.top) && box.bottom <= Math.min(innerHeight, frame.bottom);
      },
      id,
      selector,
    );
  const bar = (id) =>
    page.evaluate((i) => {
      const element = document.getElementById(i);
      const before = getComputedStyle(element, "::before");
      return {
        width: parseFloat(before.width),
        left: before.left,
        right: before.right,
        colour: before.backgroundColor,
        image: before.backgroundImage,
        tint: getComputedStyle(element).backgroundColor,
      };
    }, id);
  // A paragraph the site rendered again: a new element with the same text.
  const rerender = (id) =>
    page.evaluate((i) => {
      const old = document.getElementById(i);
      const fresh = document.createElement("p");
      fresh.id = old.id;
      fresh.className = old.className;
      fresh.setAttribute("dir", "auto");
      fresh.textContent = old.textContent;
      old.replaceWith(fresh);
    }, id);

  await step("Save place saves the response paragraph that holds the selection, as matching metadata only", async () => {
    const tab = await tabOf("ChatGPT");
    assert.ok(Number.isInteger(tab), "the popup can reach the page without a tabs permission");
    popupAddress = `${popupUrl}?tab=${tab}`;
    await loadPopup(popup, popupAddress);
    await popup.waitForFunction(() => !document.querySelector("#place-save").disabled, { polling: 200 });
    assert.deepEqual(await buttons(), { save: "Save place", saveOff: false, returnOff: true, clearOff: true });
    assert.equal(
      await popup.$eval("#place-guide", (element) => element.textContent),
      "Saves the first paragraph in view. Select text to choose another.",
    );
    assert.equal(await popup.$eval("#place-note", (element) => element.textContent), "", "nothing is claimed before anything is saved");

    await select("p-en");
    await placeButton("save");
    await waitForPlace(page, "p-en");
    await waitForNote("Place saved.");
    assert.deepEqual(await buttons(), { save: "Update place", saveOff: false, returnOff: false, clearOff: false });

    const shown = await bar("p-en");
    assert.equal(shown.width, 5, "a bar, not a hairline");
    assert.equal(parseFloat(shown.left), -14, "on the leading edge of a left-to-right paragraph");
    assert.ok(isColour(shown.colour, PAGE_MARK.mark), shown.colour);
    assert.notEqual(shown.tint, "rgba(0, 0, 0, 0)", "the saved block is tinted");

    const stored = await storedMarks();
    assert.equal(stored.version, 2);
    assert.equal(stored.items.length, 1);
    const [item] = stored.items;
    assert.deepEqual(Object.keys(item).sort(), ["a", "b", "f", "i", "k", "m", "n", "p", "s", "t"]);
    for (const key of ["a", "b", "f", "k", "m"]) assert.match(item[key], /^[0-9a-f]{16}$/, key);
    assert.deepEqual({ s: item.s, t: item.t, i: item.i, n: item.n }, { s: null, t: "p", i: 1, n: null });
    assert.ok(Number.isInteger(item.p) && item.p > 0 && item.p < 1000, `position ${item.p}`);
    assert.doesNotMatch(
      JSON.stringify(stored),
      /Hooks|state|chatgpt|fixture|turn-en|readela-|https?:/i,
      "no readable text, address or site identifier is stored",
    );
    // The conversation the site keeps hidden holds the same paragraph in a turn
    // with the same key. It is not the conversation shown, so it is not read.
    assert.deepEqual(await places(page), ["p-en:exact"]);
    assert.equal(await page.$eval("#main-kept", (element) => element.querySelector("[data-readela-mark], [data-readela-dir], [data-readela-top]")), null);
  });

  await step("without a selection the first readable paragraph at the unobscured top is saved; there is one place per conversation", async () => {
    await page.setViewport({ width: 1100, height: 520 });
    await page.evaluate(() => getSelection().removeAllRanges());
    // At the very top the heading kept for screen readers comes first in the
    // document. It is not something a reader reads, so the real heading is saved.
    await scrollTo(0);
    assert.equal((await buttons()).save, "Update place");
    await placeButton("save");
    await waitForPlace(page, "h-fa");
    await waitForNote("Place saved.");
    assert.equal((await storedMarks()).items[0].t, "h");

    // The bar the site keeps on top covers the first paragraph and the top of
    // the second, which is partly in view below it and is the one saved.
    await putAt("p-punct", 34);
    const under = await page.evaluate(() => {
      const edge = document.querySelector("#thread-bar").getBoundingClientRect().bottom;
      const box = (id) => document.getElementById(id).getBoundingClientRect();
      return { first: box("p-en-start").bottom <= edge, second: box("p-punct").top < edge && box("p-punct").bottom > edge };
    });
    assert.deepEqual(under, { first: true, second: true });
    await placeButton("save");
    await waitForPlace(page, "p-punct");
    assert.deepEqual(await places(page), ["p-punct:exact"]);
    assert.equal((await storedMarks()).items.length, 1);
    assert.equal(parseFloat((await bar("p-punct")).right), -14, "on the leading edge of a right-to-left paragraph");

    // A selection in the reader's own message is not a response paragraph;
    // the bubble is the site's and nothing in it is saved or marked.
    await page.evaluate(() => getSelection().selectAllChildren(document.querySelector("#user-bubble")));
    await putAt("p-inline", 60);
    await placeButton("save");
    await waitForPlace(page, "p-inline");
    assert.equal(await page.$eval("#user-bubble-frame", (element) => element.querySelector("[data-readela-mark]")), null);
    await page.evaluate(() => getSelection().removeAllRanges());
  });

  await step("identical paragraphs that cannot be told apart are not saved, and the place saved before is kept", async () => {
    const before = await storedMarks();
    await select("p-same-2");
    await placeButton("save");
    await waitForNote("This paragraph cannot be told apart from an identical one beside it.");
    assert.deepEqual(await storedMarks(), before);
    assert.deepEqual(await places(page), ["p-inline:exact"]);
    assert.deepEqual(await buttons(), { save: "Update place", saveOff: false, returnOff: false, clearOff: false });
    await page.evaluate(() => getSelection().removeAllRanges());
  });

  await step("Return brings the place into view, says so only once it is there, and makes it easy to find", async () => {
    await scrollTo("end");
    assert.equal(await inView("p-inline"), false);
    await placeButton("return");
    await waitForNote("Returned to your saved place.");
    // The popup said so after the fact: the place is in view already.
    assert.equal(await inView("p-inline"), true);
    const emphasis = await page.evaluate(() => {
      const element = document.querySelector("#p-inline");
      const style = getComputedStyle(element);
      return {
        flash: element.hasAttribute("data-readela-flash"),
        outline: `${style.outlineStyle} ${parseFloat(style.outlineWidth)}`,
        animation: style.animationName,
      };
    });
    assert.deepEqual(emphasis, { flash: true, outline: "solid 3", animation: "readela-flash" });
    // The emphasis is temporary; the place itself stays.
    await page.waitForFunction(() => !document.querySelector("#p-inline").hasAttribute("data-readela-flash"), { timeout: 6000 });
    assert.deepEqual(await places(page), ["p-inline:exact"]);

    if (input) {
      // With reduced motion the jump is immediate and nothing is animated.
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await scrollTo("end");
      await placeButton("return");
      await waitForNote("Returned to your saved place.");
      const calm = await page.evaluate(() => getComputedStyle(document.querySelector("#p-inline")).animationName);
      assert.equal(await inView("p-inline"), true);
      assert.equal(calm, "none");
      await page.emulateMediaFeatures([]);
    }
  });

  await step("the same sentence in another response is never the place: Return goes to the response it was saved in, or nowhere", async () => {
    // The sentence is in two responses of this conversation and in the hidden one.
    await select("p-twin-again");
    await placeButton("save");
    await waitForPlace(page, "p-twin-again");
    await waitForNote("Place saved.");
    await page.evaluate(() => getSelection().removeAllRanges());
    await scrollTo(0);
    await placeButton("return");
    await waitForNote("Returned to your saved place.");
    assert.deepEqual(await places(page), ["p-twin-again:exact"]);
    assert.equal(await inView("p-twin-again"), true);

    // The response it was saved in leaves the page. Its twin is still there,
    // word for word, and is not taken for it.
    await page.evaluate(() => {
      window.readelaTwin = document.querySelector('[data-turn-key="turn-twin"]');
      window.readelaTwinNext = window.readelaTwin.nextElementSibling;
      window.readelaTwin.remove();
    });
    await waitForNoPlace(page);
    await putAt("p-en", 80);
    const before = await scrollTop();
    await placeButton("return");
    await waitForNote("Your saved place was not found. It is still saved.", 20000);
    assert.deepEqual(await places(page), [], "no other paragraph is marked");
    assert.equal(await scrollTop(), before, "the conversation is back where the reader was");
    assert.equal((await storedMarks()).items.length, 1, "a place that is not found is not deleted");
    assert.deepEqual(await buttons(), { save: "Update place", saveOff: false, returnOff: false, clearOff: false });

    // The response comes back (the site loaded it): so does the place.
    await page.evaluate(() => window.readelaTwinNext.before(window.readelaTwin));
    await waitForPlace(page, "p-twin-again");
  });

  await step("the place survives a reload and a re-render, and belongs to the conversation whichever route shows it", async () => {
    await page.reload({ waitUntil: "load" });
    await waitForPlace(page, "p-twin-again");
    await rerender("p-twin-again");
    await waitForPlace(page, "p-twin-again");

    // The same conversation inside a project. The address changes and the
    // document does not, as when the site shows a conversation it kept.
    await page.evaluate(() => history.pushState({}, "", "/g/g-p-0123456789abcdef-fixture-project/c/readela-fixture"));
    await sleep(1600);
    assert.deepEqual(await places(page), ["p-twin-again:exact"]);
    await loadPopup(popup, popupAddress);
    await waitForNote("A place is saved in this conversation.");
    assert.equal((await buttons()).save, "Update place");
    await scrollTo(0);
    await placeButton("return");
    await waitForNote("Returned to your saved place.");
    assert.equal(await inView("p-twin-again"), true);

    // Another conversation has no place, though the page shows the same words.
    await page.evaluate(() => history.pushState({}, "", "/c/readela-fixture-2"));
    await waitForNoPlace(page);
    await loadPopup(popup, popupAddress);
    await popup.waitForFunction(() => document.querySelector("#place-save").textContent === "Save place", { polling: 200 });
    assert.deepEqual(await buttons(), { save: "Save place", saveOff: false, returnOff: true, clearOff: true });
    // A page that shows no conversation cannot hold one.
    await page.evaluate(() => history.pushState({}, "", "/"));
    await loadPopup(popup, popupAddress);
    await waitForNote("Open a conversation to save a place.");
    assert.deepEqual(await buttons(), { save: "Save place", saveOff: true, returnOff: true, clearOff: true });

    await page.evaluate(() => history.pushState({}, "", "/c/readela-fixture"));
    await waitForPlace(page, "p-twin-again");
    await loadPopup(popup, popupAddress);
    await waitForNote("A place is saved in this conversation.");
    assert.equal((await storedMarks()).items.length, 1);
  });

  await step("a saved paragraph whose text changes is looked at again: approximate between unchanged neighbours, otherwise not found", async () => {
    // The text changes inside the element that carries the mark.
    await page.evaluate(() => {
      const paragraph = document.querySelector("#p-twin-again");
      window.readelaSaved = paragraph.textContent;
      paragraph.firstChild.data = "This sentence has been rewritten.";
    });
    await waitForPlace(page, "p-twin-again", "approximate");
    assert.match((await bar("p-twin-again")).image, /repeating-linear-gradient/, "an approximate place has a broken bar");
    await scrollTo(0);
    await placeButton("return");
    await waitForNote("Returned close to your saved place. Its paragraph has changed.");
    assert.equal(await inView("p-twin-again"), true);

    // A neighbour changes too: nothing is left to trust.
    await page.evaluate(() => {
      const neighbour = document.querySelector("#p-twin-intro");
      window.readelaNeighbour = neighbour.textContent;
      neighbour.firstChild.data = "Something else stands here now.";
    });
    await waitForNoPlace(page);
    await scrollTo(0);
    const before = await scrollTop();
    await placeButton("return");
    await waitForNote("Your saved place was not found. It is still saved.");
    await sleep(500);
    assert.deepEqual(await places(page), []);
    assert.equal(await scrollTop(), before, "the page did not jump anywhere");
    assert.equal((await storedMarks()).items.length, 1);

    // When the text is there again, so is the place.
    await page.evaluate(() => {
      document.querySelector("#p-twin-again").firstChild.data = window.readelaSaved;
      document.querySelector("#p-twin-intro").firstChild.data = window.readelaNeighbour;
    });
    await waitForPlace(page, "p-twin-again");
    await placeButton("return");
    await waitForNote("Returned to your saved place.");
  });

  await step("the place stays clear on Paper and Night, with reading text still at 10:1 on its tint", async () => {
    await page.evaluate(() => getSelection().selectAllChildren(document.querySelector("#p-punct")));
    await putAt("p-punct", 120);
    await placeButton("save");
    await waitForPlace(page, "p-punct");
    await page.evaluate(() => getSelection().removeAllRanges());
    for (const [theme, palette] of Object.entries(THEMES)) {
      await choose("theme", theme);
      await page.waitForFunction(
        (value) =>
          document.documentElement.getAttribute("data-readela-theme") === value &&
          document.querySelector("#md-fa").hasAttribute("data-readela-sheet"),
        {},
        theme,
      );
      const shown = await bar("p-punct");
      const text = await page.$eval("#p-punct", (element) => getComputedStyle(element).color);
      assert.ok(isColour(shown.colour, palette.mark), `${theme}: bar ${shown.colour}`);
      assert.ok(isColour(shown.tint, palette.markTint), `${theme}: tint ${shown.tint}`);
      assert.ok(contrast(rgb(text), rgb(shown.tint)) >= 10, `${theme}: saved text contrast`);
      assert.ok(contrast(rgb(shown.colour), hexRgb(palette.surface)) >= 3, `${theme}: bar against the surface`);
      await putAt("p-punct", 120);
      await page.screenshot({ path: path.join(results, `${name}-place-${theme}.png`) });
    }
    await choose("theme", "page");
    await page.waitForFunction(() => document.querySelector("[data-readela-sheet]") === null);
    await page.screenshot({ path: path.join(results, `${name}-place-original.png`) });
  });

  await step("turning Readela off hides the place and keeps it saved", async () => {
    await setPreference((p) => press(p, "#enabled"));
    await page.waitForFunction(() => document.querySelector("[data-readela-mark], [data-readela-dir]") === null);
    assert.deepEqual(await footprint(page), { marked: 0, customProperties: 0 });
    assert.equal((await storedMarks()).items.length, 1);
    await waitForNote("Turn Readela on to use saved places.");
    assert.deepEqual(
      await popup.evaluate(() =>
        ["#settings", "#place-save", "#place-return", "#place-clear"].map((selector) => document.querySelector(selector).disabled),
      ),
      [true, true, true, true],
    );
    await setPreference((p) => press(p, "#enabled"));
    await waitForPlace(page, "p-punct");
    await popup.waitForFunction(() => !document.querySelector("#place-return").disabled, { polling: 200 });
  });

  await step("with every aspect Original the place is the only thing on the page; Clear removes it and the work", async () => {
    await choose("direction", "page");
    await page.waitForFunction(() => document.querySelector("[data-readela-dir], [data-readela-top]") === null);
    assert.deepEqual(await places(page), ["p-punct:exact"]);
    assert.deepEqual(await footprint(page), { marked: 1, customProperties: 0 });
    // The saved place is still kept current.
    await rerender("p-punct");
    await waitForPlace(page, "p-punct");

    await placeButton("clear");
    await waitForNote("Saved place cleared.");
    assert.deepEqual(await footprint(page), { marked: 0, customProperties: 0 });
    assert.deepEqual((await storedMarks()).items, []);
    assert.deepEqual(await buttons(), { save: "Save place", saveOff: false, returnOff: true, clearOff: true });
    // Nothing is left to keep current, so new content is not read at all.
    await page.evaluate(() => {
      const paragraph = document.createElement("p");
      paragraph.id = "p-idle";
      paragraph.textContent = "React در حالت اصلی";
      document.querySelector("#turn-other").append(paragraph);
    });
    await sleep(400);
    assert.deepEqual(await footprint(page), { marked: 0, customProperties: 0 });

    await choose("direction", "auto");
    await waitForMark(page, "#p-idle", "rtl");
    await page.setViewport({ width: 1100, height: 900 });
  });

  if (input) {
    await step("a save or a clear the browser refuses is reported as a failure, and nothing on the page says otherwise", async () => {
      // The extension's own storage is filled to its limit, so the next write fails.
      const filled = await popup.evaluate(async () => {
        const extension = globalThis.browser ?? globalThis.chrome;
        const quota = extension.storage.local.QUOTA_BYTES;
        if (!Number.isInteger(quota)) return false;
        const used = await extension.storage.local.getBytesInUse(null);
        await extension.storage.local.set({ "readela.test.filler": "x".repeat(quota - used - 64) });
        return true;
      });
      assert.equal(filled, true, "the storage limit could be reached");
      try {
        await select("p-en");
        await placeButton("save");
        await waitForNote("The place could not be saved. Nothing was changed.");
        assert.deepEqual(await places(page), [], "no place is shown for a save that did not happen");
        assert.deepEqual((await storedMarks()).items, []);
        assert.deepEqual(await buttons(), { save: "Save place", saveOff: false, returnOff: true, clearOff: true });
      } finally {
        await popup.evaluate(async () => {
          const extension = globalThis.browser ?? globalThis.chrome;
          await extension.storage.local.remove("readela.test.filler");
        });
      }
      // With room again the same save succeeds.
      await placeButton("save");
      await waitForPlace(page, "p-en");
      await waitForNote("Place saved.");
      await placeButton("clear");
      await waitForNote("Saved place cleared.");
      await page.evaluate(() => getSelection().removeAllRanges());
    });
  }

  // Where real input cannot reach the extension page, these two checks run on
  // the stand-in rendering of the same popup files.
  const ui = input ? popup : await openStandInPopup(browser, name);
  report.popupInputEvidence = input
    ? "installed popup, real pointer and key input"
    : "installed popup operated through its DOM; keyboard and contrast checked on a stand-in rendering of the same files";

  await step("the popup is fully operable from the keyboard with a visible focus indicator", async () => {
    await front(ui);
    if (input) await loadPopup(popup, popupAddress);
    if (input) await ui.waitForFunction(() => !document.querySelector("#place-save").disabled, { polling: 200 });
    await ui.evaluate(() => document.body.focus());
    const visited = [];
    const focused = () =>
      ui.evaluate(() => {
        const element = document.activeElement;
        const style = getComputedStyle(element);
        return { id: element.id || element.name, outline: `${style.outlineStyle} ${parseFloat(style.outlineWidth)}` };
      });
    // Reading settings come first, direction last among them. Save place is
    // reachable when the popup acts on a conversation; the two buttons that
    // need a saved place are disabled and skipped. The publisher's link is last.
    const order = [
      "enabled", "theme", "font", "size", "spacing", "direction", ...(input ? ["place-save"] : []), "reset", "publisher",
    ];
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
    assert.equal((await focused()).id, order.at(-2));

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

  // -------------------------------------------------------------------------
  // Claude: the second site adapter, with the same extension and preferences

  const claude = await openFixture(browser, requests, CLAUDE_FIXTURE_URL);
  const onClaude = async (action) => {
    await front(popup);
    await action(popup);
    await front(claude);
  };

  await step("Claude: the content script runs on claude.ai and reads message content only", async () => {
    await waitForMark(claude, "#c-p-en-start", "rtl");
    const outside = ["#c-ui-p", "#c-nav-title", "#c-page-button", "#c-composer", "#c-input", "#c-input-p", "#c-send"];
    for (const [selector, fact] of Object.entries(await inspect(claude, outside))) assert.deepEqual(fact.marks, [], selector);
    await claude.click("#c-input");
    await claude.keyboard.type(" abc");
    await sleep(200);
    assert.match(await claude.$eval("#c-input", (element) => element.textContent), /abc/);
    for (const [selector, fact] of Object.entries(await inspect(claude, ["#c-input", "#c-input-p"]))) {
      assert.deepEqual(fact.marks, [], selector);
    }
  });

  await step("Claude: mixed-direction replies and the reader's own messages read correctly", async () => {
    const facts = await inspect(claude, [
      "#c-p-en-start", "#c-h-fa", "#c-user", "#c-quote-fa-p", "#c-table-fa", "#c-th-fa", "#c-p-en", "#c-user-rich-p",
    ]);
    for (const selector of ["#c-p-en-start", "#c-h-fa", "#c-user", "#c-quote-fa-p", "#c-table-fa", "#c-th-fa"]) {
      assert.equal(facts[selector].direction, "rtl", selector);
    }
    assert.equal(facts["#c-user"].unicodeBidi, "isolate", "first-strong handling on the own message is overridden");
    assert.equal(facts["#c-p-en"].mark, "ltr");
    assert.equal(facts["#c-user-rich-p"].mark, "ltr");
    assert.ok((await characterLeft(claude, "#c-p-en-start", "T")) > (await characterLeft(claude, "#c-p-en-start", ".", true)));
    assert.ok((await characterLeft(claude, "#c-user", "T")) > (await characterLeft(claude, "#c-user", ".")));
  });

  await step("Claude: lists and quotations follow the direction; the site's own spacing is not rearranged", async () => {
    const facts = await inspect(claude, ["#c-ul-fa", "#c-li-fa-1", "#c-quote-fa", "#c-ul-en", "#c-li-en-1", "#c-quote-en"]);
    assert.equal(facts["#c-ul-fa"].direction, "rtl");
    assert.equal(facts["#c-li-fa-1"].direction, "rtl");
    assert.equal(parseFloat(facts["#c-ul-fa"].paddingRight), 32, "marker room at the reading start");
    assert.equal(parseFloat(facts["#c-ul-fa"].paddingLeft), 0);
    assert.equal(parseFloat(facts["#c-quote-fa"].borderRightWidth), 2, "quotation bar at the reading start");
    assert.equal(parseFloat(facts["#c-quote-fa"].borderLeftWidth), 0);
    // Left-to-right content keeps exactly the layout the site gives it.
    assert.equal(facts["#c-ul-en"].direction, "ltr");
    assert.equal(parseFloat(facts["#c-ul-en"].paddingLeft), 28);
    assert.equal(parseFloat(facts["#c-ul-en"].paddingRight), 32);
    assert.equal(parseFloat(facts["#c-quote-en"].borderLeftWidth), 2);
    assert.equal(parseFloat(facts["#c-quote-en"].paddingLeft), 8);
    assert.equal(parseFloat(facts["#c-quote-en"].paddingRight), 32);
    // This layout moves by itself with the direction, so nothing is mirrored.
    assert.equal((await footprint(claude)).customProperties, 0);
    await claude.screenshot({ path: path.join(results, `${name}-claude-fixture.png`) });
  });

  await step("Claude: code, mathematics and web addresses stay left-to-right; text is unchanged", async () => {
    const facts = await inspect(claude, ["#c-inline-code", "#c-code-block", "#c-code", "#c-math", "#c-link-url"]);
    for (const selector of ["#c-inline-code", "#c-code-block", "#c-math", "#c-link-url"]) {
      assert.equal(facts[selector].direction, "ltr", selector);
    }
    assert.equal(facts["#c-inline-code"].unicodeBidi, "isolate");
    assert.equal(facts["#c-code-block"].mark, null);
    assert.match(facts["#c-code"].fontFamily, /monospace/);
    const same = await claude.evaluate((source) => {
      const original = new DOMParser().parseFromString(source, "text/html");
      const live = document.querySelector("#c-transcript");
      const selection = getSelection();
      selection.selectAllChildren(document.querySelector("#c-p-inline"));
      const selected = selection.toString();
      selection.removeAllRanges();
      return {
        text: live.textContent === original.querySelector("#c-transcript").textContent,
        elements: live.querySelectorAll("*").length === original.querySelectorAll("#c-transcript *").length,
        selected: selected === original.querySelector("#c-p-inline").textContent,
        href: document.querySelector("#c-link-url").href,
      };
    }, claudeSource);
    assert.deepEqual(same, { text: true, elements: true, selected: true, href: "https://www.typescriptlang.org/docs/" });
  });

  await step("Claude: the shared preferences apply here too, and only to message content", async () => {
    const before = await inspect(claude, ["#c-ui-p", "#c-code"]);
    await onClaude(async (p) => {
      await press(p, 'input[name="font"][value="sans"]');
      await press(p, 'input[name="size"][value="125"]');
    });
    await claude.waitForFunction(() => document.documentElement.getAttribute("data-readela-size") === "125");
    // One preference set: the ChatGPT page received the same change.
    await page.waitForFunction(() => document.documentElement.getAttribute("data-readela-size") === "125");
    const after = await inspect(claude, ["#c-p-en-start", "#c-user", "#c-ul-fa", "#c-li-fa-1", "#c-ui-p", "#c-code"]);
    assert.equal(Number(after["#c-p-en-start"].zoom), 1.25);
    assert.equal(Number(after["#c-user"].zoom), 1.25);
    assert.equal(Number(after["#c-ul-fa"].zoom), 1.25);
    assert.equal(Number(after["#c-li-fa-1"].zoom), 1);
    assert.match(after["#c-p-en-start"].fontFamily, /^"?Readela Sans Arabic"?, system-ui/);
    assert.equal(after["#c-code"].fontFamily, before["#c-code"].fontFamily);
    assert.equal(Number(after["#c-ui-p"].zoom), 1, "page text outside messages is not scaled");
    assert.equal(after["#c-ui-p"].fontFamily, before["#c-ui-p"].fontFamily);
    assert.equal(
      await claude.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      true,
      "no horizontal scrolling introduced",
    );
  });

  await step("Claude: turning Readela off restores the page exactly; while off, new content is left alone", async () => {
    await onClaude((p) => press(p, "#enabled"));
    await claude.waitForFunction(() => document.querySelector("[data-readela-dir]") === null);
    assert.deepEqual(await footprint(claude), { marked: 0, customProperties: 0 });
    const state = await claude.evaluate((source) => {
      const original = new DOMParser().parseFromString(source, "text/html");
      const strip = (html) => html.replace(/\s+/g, " ");
      const same =
        strip(document.querySelector("#c-transcript").innerHTML) === strip(original.querySelector("#c-transcript").innerHTML);
      const paragraph = document.createElement("p");
      paragraph.id = "c-while-off";
      paragraph.textContent = "Vite در حالت خاموش";
      document.querySelector("#c-markdown-fa").append(paragraph);
      return {
        same,
        rootAttributes: document.documentElement.getAttributeNames().sort(),
        ownMessage: getComputedStyle(document.querySelector("#c-user")).unicodeBidi,
      };
    }, claudeSource);
    assert.deepEqual(state, { same: true, rootAttributes: ["dir", "lang"], ownMessage: "plaintext" });
    await sleep(400);
    assert.deepEqual(await footprint(claude), { marked: 0, customProperties: 0 });
    await onClaude((p) => press(p, "#enabled"));
    await waitForMark(claude, "#c-while-off", "rtl");
  });

  await step("Claude: streamed replies and conversation navigation are followed", async () => {
    await claude.evaluate(async () => {
      const pause = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
      const message = document.createElement("div");
      message.dataset.testid = "assistant-message";
      message.dataset.isStreaming = "true";
      message.id = "c-stream";
      const markdown = document.createElement("div");
      markdown.className = "progressive-markdown";
      const paragraph = document.createElement("p");
      paragraph.id = "c-p-stream";
      paragraph.textContent = "Vite";
      markdown.append(paragraph);
      message.append(markdown);
      document.querySelector("#c-transcript").append(message);
      await pause(1500);
      window.readelaFirstMark = paragraph.getAttribute("data-readela-dir");
      for (const piece of [" یک", " ابزار", " ساخت", " سریع", " برای", " پروژه‌های", " front-end", " است", "."]) {
        paragraph.firstChild.appendData(piece);
        await pause();
      }
      const list = document.createElement("ul");
      list.id = "c-ul-stream";
      list.className = "list-disc ps-7";
      markdown.append(list);
      for (const text of ["راه‌اندازی سریع", "به‌روزرسانی آنی"]) {
        const item = document.createElement("li");
        list.append(item);
        for (const word of text.split(" ")) {
          item.append(document.createTextNode(`${word} `));
          await pause();
        }
      }
      markdown.className = "standard-markdown";
      message.dataset.isStreaming = "false";
    });
    assert.equal(
      await claude.evaluate(() => window.readelaFirstMark),
      "ltr",
      "the first streamed word alone reads left-to-right",
    );
    await waitForMark(claude, "#c-p-stream", "rtl");
    await waitForMark(claude, "#c-ul-stream", "rtl");
    await waitForMark(claude, "#c-ul-stream li:last-child", "rtl");

    await claude.evaluate(() => {
      history.pushState({}, "", "/chat/readela-fixture-2");
      const transcript = document.querySelector("#c-transcript");
      transcript.replaceChildren();
      const message = document.createElement("div");
      message.dataset.testid = "assistant-message";
      message.dataset.isStreaming = "false";
      const markdown = document.createElement("div");
      markdown.className = "standard-markdown";
      for (const [id, text] of [
        ["c-nav-fa", "Rust یک زبان سیستمی است."],
        ["c-nav-en", "It has no garbage collector."],
      ]) {
        const paragraph = document.createElement("p");
        paragraph.id = id;
        paragraph.textContent = text;
        markdown.append(paragraph);
      }
      message.append(markdown);
      transcript.append(message);
    });
    await waitForMark(claude, "#c-nav-fa", "rtl");
    await waitForMark(claude, "#c-nav-en", "ltr");

    await onClaude((p) => press(p, "#reset"));
    await claude.waitForFunction(() => !document.documentElement.hasAttribute("data-readela-size"));
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-readela-size"));
  });

  await step("Claude: Paper and Night colour the response only; a table's own wrapper is part of the same surface", async () => {
    const chooseOnClaude = (group, value) => onClaude((p) => press(p, `input[name="${group}"][value="${value}"]`));
    // The conversation of the earlier checks was replaced; start from the fixture again.
    await claude.goto(CLAUDE_FIXTURE_URL, { waitUntil: "load" });
    await waitForMark(claude, "#c-p-en-start", "rtl");
    await chooseOnClaude("theme", "paper");
    await claude.waitForFunction(() => document.querySelector("#c-markdown-fa").hasAttribute("data-readela-sheet"));
    const sheets = await claude.evaluate(() => ({
      table: document.querySelector(".md-table-scroll").getAttribute("data-readela-sheet"),
      code: document.querySelector("#c-code-frame").getAttribute("data-readela-island"),
      ownMessages: [...document.querySelectorAll('[data-testid="user-message"]')].every(
        (message) => message.closest("[data-readela-sheet]") === null && message.querySelector("[data-readela-sheet], [data-readela-island]") === null,
      ),
      outside: document.querySelector("#c-ui").hasAttribute("data-readela-sheet"),
      surfaces: document.querySelectorAll('[data-readela-sheet=""]').length,
    }));
    assert.deepEqual(sheets, { table: "inner", code: "surface round text", ownMessages: true, outside: false, surfaces: 2 });
    await chooseOnClaude("theme", "page");
    await claude.waitForFunction(() => document.querySelector("[data-readela-sheet]") === null);
    for (const scheme of schemes) {
      if (input) await claude.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
      await sleep(100);
      assert.equal(await claude.evaluate((value) => matchMedia(`(prefers-color-scheme: ${value})`).matches, scheme), true);
      await checkReadingThemes({ name, page: claude, choose: chooseOnClaude, scheme, parts: CLAUDE_PARTS, report });
    }
    if (input) await claude.emulateMediaFeatures([]);
  });

  await step("Claude: a place is saved in a response with the row the site numbers, and found again after a reload", async () => {
    const tab = await tabOf("Claude");
    assert.ok(Number.isInteger(tab));
    await loadPopup(popup, `${popupUrl}?tab=${tab}`);
    await popup.waitForFunction(() => !document.querySelector("#place-save").disabled, { polling: 200 });
    await select("c-quote-fa-p", claude);
    await placeButton("save", claude);
    await waitForPlace(claude, "c-quote-fa-p");
    // The popup says so only once the place is stored.
    await waitForNote("Place saved.");
    const [item] = (await storedMarks()).items;
    assert.match(item.m, /^[0-9a-f]{16}$/);
    assert.equal(item.n, 1, "the row of the response");
    await claude.reload({ waitUntil: "load" });
    await waitForPlace(claude, "c-quote-fa-p");
    // A selection in the reader's own message saves nothing there.
    await claude.evaluate(() => getSelection().selectAllChildren(document.querySelector("#c-user-rich-p")));
    await placeButton("save", claude);
    await waitForNote("Place saved.");
    assert.equal(await claude.$eval("#c-user-rich-bubble", (element) => element.querySelector("[data-readela-mark]")), null);
    assert.equal((await places(claude)).length, 1);
    await claude.evaluate(() => getSelection().removeAllRanges());
    await placeButton("clear", claude);
    await waitForNote("Saved place cleared.");
    assert.deepEqual(await places(claude), []);
  });

  // -------------------------------------------------------------------------
  // A long conversation as a virtual list: only the rows near the viewport are
  // in the document, and every reply ends with the same sentence.

  const LONG = "#l-scroller";
  const rows = () => claude.evaluate(() => window.readelaRows());
  // Row 21 is a reply some way up from the end; rows are 90px and 310px tall in turn.
  const ROW_21_TOP = 10 * 400 + 90;
  const awayFromPlace = async (to) => {
    await scrollTo(to, claude, LONG);
    await claude.waitForFunction(() => !window.readelaRows().includes(21), { polling: 100 });
    await waitForNoPlace(claude);
  };

  await step("a place in a response that is not in the document is found on Return by a bounded search, and nothing identical is taken for it", async () => {
    await claude.goto(LONG_FIXTURE_URL, { waitUntil: "load" });
    await claude.waitForFunction(() => document.querySelector("[data-readela-dir]") !== null, { polling: 200 });
    await loadPopup(popup, `${popupUrl}?tab=${await tabOf("Claude")}`);
    await popup.waitForFunction(() => !document.querySelector("#place-save").disabled, { polling: 200 });
    // The conversation opened at its end; most of it is not in the document.
    const atEnd = await rows();
    assert.ok(atEnd.length < 12 && atEnd.includes(59) && !atEnd.includes(21), `rows ${atEnd}`);

    // The closing sentence of reply 21: the same words end every reply.
    await scrollTo(ROW_21_TOP - 120, claude, LONG);
    await claude.waitForFunction(() => document.querySelector("#l-same-21") !== null, { polling: 100 });
    await select("l-same-21", claude);
    await placeButton("save", claude);
    await waitForPlace(claude, "l-same-21");
    await waitForNote("Place saved.");
    await claude.evaluate(() => getSelection().removeAllRanges());
    const [item] = (await storedMarks()).items;
    assert.equal(item.n, 21);

    // From the beginning and from the end of the conversation.
    for (const from of [0, "end"]) {
      await awayFromPlace(from);
      // Seen from here the same sentence is in view in another reply. It is not marked.
      assert.deepEqual(await places(claude), []);
      await loadPopup(popup, `${popupUrl}?tab=${await tabOf("Claude")}`);
      await waitForNote("A place is saved in this conversation.");
      await placeButton("return", claude);
      await waitForNote("Returned to your saved place.", 20000);
      assert.deepEqual(await places(claude), ["l-same-21:exact"], `from ${from}`);
      assert.equal(await inView("l-same-21", claude, LONG), true, `from ${from}: the place is in view`);
      assert.equal(await claude.$eval("#l-same-21", (element) => element.hasAttribute("data-readela-flash")), true);
    }
  });

  await step("a search for a place stops when the reader scrolls, when the conversation changes and when Readela is turned off; the place stays saved", async () => {
    // A page that takes its time to bring rows into the document, and never
    // brings the one the place is in, so each search lasts until it is stopped.
    await awayFromPlace(0);
    await claude.evaluate(() => {
      window.readelaMountDelay = 300;
      window.readelaNeverMount = 21;
    });

    // The reader takes over with the wheel.
    await awayFromPlace(0);
    await placeButton("return", claude);
    await waitForNote("Looking for your saved place");
    await claude.mouse.move(700, 300);
    await claude.mouse.wheel({ deltaY: 160 });
    await waitForNote("Return was stopped. Your place is still saved.", 20000);
    const where = await scrollTop(claude, LONG);
    await sleep(900);
    assert.equal(await scrollTop(claude, LONG), where, "nothing moves the conversation after the reader took over");
    assert.equal((await storedMarks()).items.length, 1);

    // The conversation changes under the search.
    await awayFromPlace(0);
    await placeButton("return", claude);
    await waitForNote("Looking for your saved place");
    await claude.evaluate(() => history.pushState({}, "", "/chat/readela-another-conversation"));
    await waitForNote("Return was stopped. Your place is still saved.", 20000);
    assert.deepEqual(await places(claude), []);
    await claude.evaluate(() => history.pushState({}, "", "/chat/readela-long-fixture"));
    assert.equal((await storedMarks()).items.length, 1);

    // Readela is turned off during the search.
    await awayFromPlace(0);
    await loadPopup(popup, `${popupUrl}?tab=${await tabOf("Claude")}`);
    await waitForNote("A place is saved in this conversation.");
    await placeButton("return", claude);
    await waitForNote("Looking for your saved place");
    await onClaude((p) => press(p, "#enabled"));
    await claude.waitForFunction(() => document.querySelector("[data-readela-dir], [data-readela-mark]") === null, { polling: 100 });
    const stopped = await scrollTop(claude, LONG);
    await sleep(900);
    assert.equal(await scrollTop(claude, LONG), stopped, "nothing moves the conversation once Readela is off");
    assert.equal((await storedMarks()).items.length, 1);
    await onClaude((p) => press(p, "#enabled"));
    await claude.waitForFunction(() => document.querySelector("[data-readela-dir]") !== null, { polling: 100 });
    await claude.evaluate(() => {
      window.readelaMountDelay = 40;
      window.readelaNeverMount = undefined;
    });
  });

  await step("a search that cannot find the place ends at its limits, says so, puts the conversation back and keeps the place", async () => {
    // The response the place is in never enters the document.
    await awayFromPlace(0);
    await claude.evaluate(() => {
      window.readelaNeverMount = 21;
    });
    await loadPopup(popup, `${popupUrl}?tab=${await tabOf("Claude")}`);
    await waitForNote("A place is saved in this conversation.");
    const began = Date.now();
    await placeButton("return", claude);
    await waitForNote("Your saved place was not found. It is still saved.", 30000);
    const took = Date.now() - began;
    report.searchLimitMs = took;
    assert.ok(took < 16000, `the search ended after ${took} ms`);
    assert.deepEqual(await places(claude), [], "no other paragraph is marked");
    assert.equal(await scrollTop(claude, LONG), 0, "the conversation is back where the reader was");
    assert.equal((await storedMarks()).items.length, 1);
    assert.deepEqual(await buttons(), { save: "Update place", saveOff: false, returnOff: false, clearOff: false });

    // When the response can be loaded again, the same place is found.
    await claude.evaluate(() => {
      window.readelaNeverMount = undefined;
    });
    await placeButton("return", claude);
    await waitForNote("Returned to your saved place.", 20000);
    assert.deepEqual(await places(claude), ["l-same-21:exact"]);
    await placeButton("clear", claude);
    await waitForNote("Saved place cleared.");
    await loadPopup(popup, popupAddress);
  });

  // -------------------------------------------------------------------------
  // The popup itself

  await step("popup: reading comes first; a selected choice, the keyboard focus and the off state are told apart without an underline", async () => {
    await front(ui);
    if (input) await loadPopup(popup, popupAddress);
    await ui.setViewport({ width: 320, height: 640 });
    const layout = await ui.evaluate(() => {
      const text = (element) => element.textContent.trim().replace(/\s+/g, " ");
      const link = document.querySelector("#publisher");
      const reset = getComputedStyle(document.querySelector("#reset"));
      return {
        order: [...document.querySelectorAll("main h1, #settings .group > legend, main h2, #reset, .about")].map(text),
        direction: [...document.querySelectorAll('input[name="direction"]')].map((radio) => radio.value),
        link: { text: text(link), href: link.href, target: link.target, rel: link.rel, tab: link.tabIndex },
        linksInPopup: document.querySelectorAll("a").length,
        reset: { border: `${reset.borderTopStyle} ${parseFloat(reset.borderTopWidth)}`, underline: reset.textDecorationLine },
        scrolls: getComputedStyle(document.documentElement).overflowY,
      };
    });
    assert.match(layout.order.at(-1), /^By Amir42 Version \d+\.\d+\.\d+$/);
    assert.deepEqual(layout.order.slice(0, -1), [
      "Readela", "Appearance", "Font", "Text size", "Line spacing", "Text direction", "Saved place", "Reset settings",
    ]);
    assert.deepEqual(layout.direction, ["page", "auto", "rtl", "ltr"]);
    assert.deepEqual(layout.link, { text: "Amir42", href: "https://amir42.com/", target: "_blank", rel: "noopener noreferrer", tab: 0 });
    assert.equal(layout.linksInPopup, 1);
    assert.deepEqual(layout.reset, { border: "solid 1", underline: "none" }, "Reset is a quiet outlined button");
    assert.equal(layout.scrolls, "auto");

    // Selection, on a choice that does not have the keyboard.
    const segment = (selector) =>
      ui.evaluate((s) => {
        const input = document.querySelector(s);
        const label = getComputedStyle(input.closest("label"));
        const span = getComputedStyle(input.closest("label").querySelector("span"));
        const ring = getComputedStyle(input);
        return {
          background: label.backgroundColor,
          border: `${label.borderTopStyle} ${label.borderTopColor}`,
          weight: Number(label.fontWeight),
          underline: span.textDecorationLine,
          colour: span.color,
          ring: `${ring.outlineStyle} ${parseFloat(ring.outlineWidth)}`,
          ringColour: ring.outlineColor,
        };
      }, selector);
    await ui.evaluate(() => document.activeElement?.blur());
    const selected = await segment('input[name="size"]:checked');
    const plain = await segment('input[name="size"]:not(:checked)');
    assert.equal(selected.underline, "none", "no underline on the selected choice");
    assert.notEqual(selected.background, plain.background, "selected: its own fill");
    assert.notEqual(selected.border, plain.border, "selected: its own outline");
    assert.ok(selected.weight >= 600 && plain.weight <= 500, `selected: heavier text (${selected.weight} against ${plain.weight})`);
    assert.equal(selected.ring.split(" ")[0], "none", "selection alone shows no focus ring");

    // Focus, reached with the keyboard: a ring of its own in another colour,
    // on a choice that is selected as well. Selection looks the same with it.
    await ui.focus("#enabled");
    await ui.keyboard.press("Tab");
    assert.equal(await ui.evaluate(() => document.activeElement.name), "theme");
    const focused = await segment('input[name="theme"]:checked');
    assert.equal(focused.ring, "solid 3");
    assert.notEqual(focused.ringColour, focused.border.split(" ").slice(1).join(" "), "the focus ring is not the selection outline");
    assert.deepEqual(
      { background: focused.background, border: focused.border, weight: focused.weight },
      { background: selected.background, border: selected.border, weight: selected.weight },
    );
    await ui.screenshot({ path: path.join(results, `${name}-popup-focus.png`) });

    // Off: every choice is still readable and the selected one still marked.
    await ui.$eval("#enabled", (element) => element.click());
    await ui.waitForFunction(() => document.querySelector("#settings").disabled);
    const off = await ui.evaluate(() => {
      const behind = (element) => {
        let background = "rgba(0, 0, 0, 0)";
        for (let node = element; node && /rgba\(0, 0, 0, 0\)|transparent/.test(background); node = node.parentElement) {
          background = getComputedStyle(node).backgroundColor;
        }
        return background;
      };
      const pair = (selector) => {
        const element = document.querySelector(selector);
        return { color: getComputedStyle(element).color, background: behind(element) };
      };
      const chosen = getComputedStyle(document.querySelector('input[name="size"]:checked').closest("label"));
      return {
        plain: pair('.segments label:not(:has(input:checked)) span'),
        chosen: pair('.segments label:has(input:checked) span'),
        button: pair("#place-save"),
        note: document.querySelector("#state-note").textContent,
        opacity: getComputedStyle(document.querySelector("#settings")).opacity,
        chosenBorder: chosen.borderTopStyle,
        chosenWeight: Number(chosen.fontWeight),
      };
    });
    for (const key of ["plain", "chosen", "button"]) {
      const ratio = contrast(rgb(off[key].color), rgb(off[key].background));
      assert.ok(ratio >= 4.5, `off: ${key} contrast ${ratio.toFixed(2)}`);
    }
    assert.equal(off.opacity, "1", "the off state is not a faded copy");
    assert.ok(off.chosenBorder !== "none" && off.chosenWeight >= 600, "off: the selected choice is still marked");
    assert.match(off.note, /Readela is off\..*saved places are kept\./);
    await ui.screenshot({ path: path.join(results, `${name}-popup-off.png`) });
    await ui.$eval("#enabled", (element) => element.click());
    await ui.waitForFunction(() => !document.querySelector("#settings").disabled);

    // A short window: the content scrolls, nothing is cut off.
    await ui.setViewport({ width: 320, height: 360 });
    const short = await ui.evaluate(() => {
      const scrolling = document.scrollingElement;
      scrolling.scrollTop = scrolling.scrollHeight;
      const last = document.querySelector("#publisher").getBoundingClientRect();
      const reached = last.bottom <= innerHeight && last.top >= 0;
      const facts = { taller: scrolling.scrollHeight > innerHeight, reached, wide: scrolling.scrollWidth <= scrolling.clientWidth };
      scrolling.scrollTop = 0;
      return facts;
    });
    assert.deepEqual(short, { taller: true, reached: true, wide: true });
    await ui.setViewport({ width: 320, height: 640 });

    if (input) {
      // Forced colours: selection is the system's highlight, and the focus
      // ring is still there beside it.
      const session = await ui.createCDPSession();
      await session.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }] });
      assert.equal(await ui.evaluate(() => matchMedia("(forced-colors: active)").matches), true);
      await ui.evaluate(() => document.activeElement?.blur());
      const forcedSelected = await segment('input[name="size"]:checked');
      const forcedPlain = await segment('input[name="size"]:not(:checked)');
      assert.notEqual(forcedSelected.background, forcedPlain.background, "forced colours: selected fill");
      assert.notEqual(forcedSelected.colour, forcedPlain.colour, "forced colours: selected text");
      assert.ok(contrast(rgb(forcedSelected.colour), rgb(forcedSelected.background)) >= 4.5, "forced colours: selected text contrast");
      await ui.focus("#enabled");
      await ui.keyboard.press("Tab");
      assert.equal(await ui.evaluate(() => document.activeElement.name), "theme");
      const forcedFocus = await segment('input[name="theme"]:checked');
      assert.equal(forcedFocus.ring, "solid 3", "forced colours: focus ring");
      assert.notEqual(forcedFocus.ringColour, forcedFocus.background, "forced colours: the ring stands out from the selection");
      await ui.screenshot({ path: path.join(results, `${name}-popup-forced-colours.png`) });
      await session.send("Emulation.setEmulatedMedia", { features: [] });
      await session.detach();
      report.forcedColours = "checked in the installed popup with the forced-colours media feature emulated";
    } else {
      report.forcedColours = "not checked in this browser: the automation protocol cannot switch it";
    }
    // The popup asked for nothing outside the extension, opening or in use.
    assert.deepEqual(popupRequests.filter((url) => !EXTENSION_FILE.test(url) && !url.startsWith("data:")), []);
    await front(page);
  });

  for (const scheme of schemes) {
    await step(`${scheme} theme: popup contrast and 320px fit; Paper and Night at 10:1 on the reading surface only`, () =>
      checkTheme({ name, ui, page, scheme, emulate: input, report, choose }),
    );
  }

  await step("the extension makes no network request", async () => {
    // Inline data: resources never reach the network and are not counted.
    const unexpected = requests.filter((url) => !(url in FIXTURES) && !url.startsWith("data:") && !EXTENSION_FILE.test(url));
    assert.deepEqual(unexpected, [], "every request seen on the fixture pages is a fixture document itself");
    // The only file a page takes from the extension is the packaged font.
    for (const url of requests.filter((entry) => EXTENSION_FILE.test(entry))) {
      assert.match(url, /\/fonts\/Vazirmatn-NL-wght\.woff2$/, url);
    }
    assert.ok(requests.includes(FIXTURE_URL) && requests.includes(CLAUDE_FIXTURE_URL) && requests.includes(LONG_FIXTURE_URL));
    const stored = await popup.evaluate(async () => {
      const api = globalThis.browser ?? globalThis.chrome;
      return api.storage.local.get(null);
    });
    assert.deepEqual(Object.keys(stored).sort(), ["readela.marks", "readela.preferences"], "only preferences and saved places are stored");
    assert.deepEqual(Object.keys(stored["readela.preferences"]).sort(), [
      "direction", "enabled", "font", "size", "spacing", "theme", "version",
    ]);
    assert.deepEqual(stored["readela.marks"], { version: 2, items: [] });
  });

  report.fixtureRequests = [...new Set(requests)].map((url) => (url.startsWith("data:") ? `${url.slice(0, 24)}…` : url));
  if (ui !== popup) await ui.close();
  await claude.close();
  await page.close();
  await popup.close();
  return steps;
}

// ---------------------------------------------------------------------------
// Live start page (signed out, nothing sent)

async function runLive(name, browser, address, label) {
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
  const outcome = { url: address };
  try {
    await page.goto(address, { waitUntil: "domcontentloaded", timeout: 45000 });
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
          // The text size was set to 110% beforehand; the root mark shows that
          // the content script ran here and read the stored preferences.
          contentScriptRan: document.documentElement.getAttribute("data-readela-size") === "110",
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
    await page.screenshot({ path: path.join(results, `${name}-live-${label}.png`) });
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
// A saved place across a restart of the browser
//
// The browser is started twice on one profile directory made for this check
// and removed after it. The place is saved in the first run and found in the
// second, from what the browser itself kept in the extension's local storage.

async function checkRestart(name) {
  const profile = mkdtempSync(path.join(os.tmpdir(), `readela-${name}-restart-`));
  let browser = null;
  const session = async () => {
    const started = await start(name, "light", profile);
    browser = started.browser;
    const page = await openFixture(browser, []);
    await waitForMark(page, "#p-en-start", "rtl");
    const popup = await openPopup(browser, started.popupUrl);
    const tab = await popup.evaluate(async () => {
      const extension = globalThis.browser ?? globalThis.chrome;
      for (const candidate of await extension.tabs.query({})) {
        try {
          if ((await extension.tabs.sendMessage(candidate.id, { readelaMark: "status" }))?.site === "ChatGPT") return candidate.id;
        } catch {
          // Not a page this extension runs on.
        }
      }
      return null;
    });
    await loadPopup(popup, `${started.popupUrl}?tab=${tab}`);
    await popup.waitForFunction(() => !document.querySelector("#place-save").disabled, { polling: 200 });
    const click = async (button) => {
      await popup.$eval(`#place-${button}`, (element) => element.click());
      await front(page);
    };
    const note = (text) =>
      popup.waitForFunction((t) => document.querySelector("#place-note").textContent.startsWith(t), { timeout: 15000, polling: 200 }, text);
    const stored = () =>
      popup.evaluate(async () => {
        const extension = globalThis.browser ?? globalThis.chrome;
        return (await extension.storage.local.get("readela.marks"))["readela.marks"] ?? null;
      });
    return { page, popup, click, note, stored };
  };

  try {
    const first = await session();
    assert.deepEqual((await first.stored())?.items ?? [], [], "the profile starts with no saved place");
    await first.page.evaluate(() => {
      const paragraph = document.querySelector("#p-twin-again");
      paragraph.scrollIntoView({ block: "center" });
      getSelection().selectAllChildren(paragraph);
    });
    await first.click("save");
    await first.note("Place saved.");
    const saved = await first.stored();
    assert.equal(saved.items.length, 1);
    await browser.close();
    browser = null;

    const second = await session();
    assert.deepEqual(await second.stored(), saved, "the browser kept the place over the restart");
    await second.page.waitForFunction(
      () => document.querySelector("#p-twin-again")?.getAttribute("data-readela-mark") === "exact" && document.querySelectorAll("[data-readela-mark]").length === 1,
      { timeout: 8000, polling: 200 },
    );
    await second.note("A place is saved in this conversation.");
    await second.page.$eval("#scroller", (element) => {
      element.scrollTop = 0;
    });
    await second.click("return");
    await second.note("Returned to your saved place.");
    const arrived = await second.page.evaluate(() => {
      const frame = document.querySelector("#scroller").getBoundingClientRect();
      const box = document.querySelector("#p-twin-again").getBoundingClientRect();
      return box.top >= frame.top && box.bottom <= frame.bottom;
    });
    assert.equal(arrived, true, "the place is in view");
    await second.click("clear");
    await second.note("Saved place cleared.");
  } finally {
    await browser?.close().catch(() => {});
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
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
      const popup = await openPopup(browser, popupUrl);
      await popup.$eval('input[name="size"][value="110"]', (element) => element.click());
      report.live = {};
      for (const [label, address] of [["chatgpt", "https://chatgpt.com/"], ["claude", "https://claude.ai/"]]) {
        report.live[label] = await runLive(name, browser, address, label);
        console.log(`  live ${label}: ${JSON.stringify(report.live[label])}`);
      }
      await popup.$eval('input[name="size"][value="page"]', (element) => element.click());
      await popup.close();
    }
  } finally {
    await browser.close();
  }

  {
    const title = "a saved place survives a restart of the browser and is returned to afterwards";
    try {
      await checkRestart(name);
      report.steps.push({ title, ok: true });
      console.log(`  ok    ${title}`);
    } catch (error) {
      failed = true;
      const detail = String(error?.message ?? error).split("\n").slice(0, 12).join("\n");
      report.steps.push({ title, ok: false, error: detail });
      console.log(`  FAIL  ${title}\n        ${detail}`);
    }
  }

  if (!started.input) {
    // Second launch for the dark theme, which cannot be switched at runtime here.
    const dark = await start(name, "dark");
    try {
      const page = await openFixture(dark.browser, []);
      await waitForMark(page, "#p-en-start", "rtl");
      const ui = await openStandInPopup(dark.browser, name);
      const popup = await openPopup(dark.browser, dark.popupUrl);
      const choose = (group, value) =>
        popup.$eval(`input[name="${group}"][value="${value}"]`, (element) => element.click());
      const title = "dark theme: popup contrast and 320px fit; Paper and Night at 10:1 on the reading surface only";
      try {
        await checkTheme({ name, ui, page, scheme: "dark", emulate: false, report, choose });
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
