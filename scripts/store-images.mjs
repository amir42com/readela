// Produces the store listing images from the real built extension.
//
//   node scripts/store-images.mjs            writes docs/store-images/
//                                            and dist/store-images/ (checks)
//
// The built Chrome extension (dist/chrome) is installed into a fresh temporary
// Chrome profile, the synthetic pages of scripts/lib/store-pages.mjs are
// served at addresses the extension matches, the settings are stored as the
// popup stores them, and the pages and the popup are captured as the browser
// renders them. A bookmark is saved by the popup's own button. Nothing the
// extension shows is drawn by hand.
//
// Each listing image is a frame around such captures: a line that says what
// is shown, a label over a capture where two are compared, and a note that
// the text is an example on a test page. The frame is a page too, rendered
// by the same browser; it adds nothing inside a capture.
//
// Every capture is checked against the page before it is used (the settings
// the extension applied, the direction it gave, the place it saved), and
// every image against the size and form the stores ask for. For checking how
// the images read when a store shows them smaller, dist/store-images/ gets
// each at half size and one sheet of all of them. Run `npm run build` first.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

import { PAGES } from "./lib/store-pages.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "store-images");
const checks = path.join(root, "dist", "store-images");
const read = (file) => readFileSync(path.join(root, file));
const { version } = JSON.parse(read("package.json").toString("utf8"));
const icon = read("src/icons/icon-128.png").toString("base64");
// The frames are set in the font the extension itself ships.
const inter = read("src/fonts/InterVariable.woff2").toString("base64");

const SCREENSHOT = { width: 1280, height: 800 }; // Chrome Web Store screenshot size
const TILE = { width: 440, height: 280 }; // Chrome Web Store small promotional tile

// The frame: a margin, a heading, and under it the room for the captures.
const MARGIN = 40;
const ROOM = { top: 134, width: SCREENSHOT.width - 2 * MARGIN, height: 618 };
const GAP = 24;
const LABEL = 36; // a label over a capture, with the space under it
// A capture is taken at one and a half device pixels to a CSS pixel, so the
// 16-pixel text of a page is 24 pixels in the image and stays readable when a
// store shows the image at half size. The popup is taken a little smaller so
// that it fits the room whole.
const SCALE = 1.5;
const POPUP_SCALE = 1.3;
const POPUP_WIDTH = 360;

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

const extensionPath = path.join(root, "dist", "chrome");
if (!existsSync(path.join(extensionPath, "manifest.json"))) throw new Error('dist/chrome is missing; run "npm run build" first');
const built = JSON.parse(readFileSync(path.join(extensionPath, "manifest.json"), "utf8"));
assert.equal(built.version, version, "dist/chrome is not the build of this version; run npm run build");
const executablePath = chromeExecutable();
if (!executablePath) throw new Error("no Chrome executable found (set READELA_CHROME)");
mkdirSync(output, { recursive: true });
mkdirSync(checks, { recursive: true });

const browser = await puppeteer.launch({ browser: "chrome", executablePath, headless: true, pipe: true, enableExtensions: true });
const id = await browser.installExtension(extensionPath);
const popupUrl = `chrome-extension://${id}/popup/popup.html`;
const served = Object.fromEntries(Object.values(PAGES).map(({ url, html }) => [url, html]));
const refused = [];

// Serves the listing pages and lets a page take the extension's own files
// (the packaged fonts); every other request is refused and noted.
async function open(url, { width, height, scale = 1, scheme = "light", html }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const address = request.url();
    const body = html !== undefined && address === url ? html : served[address];
    if (body !== undefined) request.respond({ status: 200, contentType: "text/html; charset=utf-8", body });
    else if (address.startsWith(`chrome-extension://${id}/`) || address.startsWith("data:")) request.continue();
    else {
      refused.push(address);
      request.abort();
    }
  });
  await page.goto(url, { waitUntil: "load" });
  return page;
}

// A tab that is not in front is given no animation frames, so every wait asks
// again by timer.
const until = (target, test, ...values) => target.waitForFunction(test, { polling: 100 }, ...values);

const popup = await browser.newPage();
await popup.setViewport({ width: POPUP_WIDTH, height: 600, deviceScaleFactor: POPUP_SCALE });
const loadPopup = async (scheme, tab) => {
  await popup.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await popup.goto(tab === undefined ? popupUrl : `${popupUrl}?tab=${tab}`, { waitUntil: "domcontentloaded" });
  await until(popup, () => document.querySelector('input[name="direction"]:checked') !== null && document.querySelector("#place-total").textContent !== "");
};
await loadPopup("light");

// The settings, stored as the popup stores them.
const PREFERENCES = "readela.preferences";
const ORIGINAL = { enabled: true, direction: "page", theme: "page", font: "page", size: "page", spacing: "page" };
const choose = (change) =>
  popup.evaluate(
    async (key, next) => {
      const current = (await chrome.storage.local.get(key))[key] ?? {};
      await chrome.storage.local.set({ [key]: { ...current, ...next } });
    },
    PREFERENCES,
    { ...ORIGINAL, ...change },
  );

// What the extension has made of a page: read from the page, to hold each
// capture to what its label says.
const facts = (page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    const root = document.documentElement;
    const text = document.querySelector('[data-markdown-text-style="assistant-message"], .standard-markdown');
    const first = text.querySelector("p, li");
    return {
      theme: root.getAttribute("data-readela-theme"),
      font: root.getAttribute("data-readela-font"),
      size: root.getAttribute("data-readela-size"),
      spacing: root.getAttribute("data-readela-spacing"),
      marked: document.querySelectorAll("[data-readela-dir]").length,
      rtl: document.querySelectorAll('[data-readela-dir="rtl"]').length,
      sheet: text.hasAttribute("data-readela-sheet"),
      family: getComputedStyle(first).fontFamily.split(",")[0].trim(),
      packagedFontsShown: [...document.fonts].filter((face) => face.status === "loaded" && face.family.includes("Readela Sans")).length,
      saved: document.querySelectorAll("[data-readela-mark]").length,
      savedRows: document.querySelectorAll("[data-readela-saved]").length,
      overflows: root.scrollWidth > innerWidth,
    };
  });

// Open a listing page under the given settings and wait until the extension
// has done with it what those settings ask.
async function show(name, { width, height, scheme = "light", settings }) {
  await choose(settings);
  const page = await open(PAGES[name].url, { width, height, scale: SCALE, scheme });
  const wanted = { ...ORIGINAL, ...settings };
  const off = wanted.enabled === false;
  await until(
    page,
    (theme, font, marks) => {
      const html = document.documentElement;
      const mark = (attribute, value) => html.getAttribute(attribute) === (value === "page" ? null : value);
      return mark("data-readela-theme", theme) && mark("data-readela-font", font) && (document.querySelector("[data-readela-dir]") !== null) === marks;
    },
    off ? "page" : wanted.theme,
    off ? "page" : wanted.font,
    !off && wanted.direction !== "page",
  );
  // The packaged fonts are fetched when text first needs them.
  await page.evaluate(() => document.fonts.ready);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await page.evaluate(() => document.fonts.ready);
  const seen = await facts(page);
  assert.equal(seen.overflows, false, `${name}: the page is wider than its window`);
  if (!off && wanted.font === "sans") assert.ok(seen.packagedFontsShown > 0 && seen.family.includes("Readela Sans"), `${name}: Readela Sans is shown`);
  if (!off && wanted.theme !== "page") assert.ok(seen.sheet, `${name}: the reply is a reading surface`);
  return { page, seen };
}

const png = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), depth: buffer[24], colourType: buffer[25] });
const data = (buffer) => `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
const capture = async (page, expected) => {
  const shot = Buffer.from(await page.screenshot({ type: "png" }));
  const { width, height } = png(shot);
  assert.deepEqual({ width, height }, expected, "a capture has the size of its place in the frame");
  return shot;
};

// The popup as it stands, whole, for the conversation in one tab.
async function capturePopup(scheme, tab, expected) {
  await loadPopup(scheme, tab);
  await until(popup, () => document.querySelector("#place-note").textContent !== "");
  const state = await popup.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    chosen: Object.fromEntries([...document.querySelectorAll("#settings input:checked")].map((input) => [input.name, input.value])),
    save: document.querySelector("#place-save").textContent,
    note: document.querySelector("#place-note").textContent,
    total: document.querySelector("#place-total").textContent,
    height: Math.ceil(document.body.getBoundingClientRect().height),
    scrolls: document.documentElement.scrollHeight > innerHeight,
  }));
  for (const [name, value] of Object.entries(expected)) assert.equal(state.chosen[name], value, `the popup shows ${name} as stored`);
  assert.equal(state.scrolls, false, "the popup is shown whole");
  const shot = Buffer.from(await popup.screenshot({ type: "png", clip: { x: 0, y: 0, width: POPUP_WIDTH, height: state.height } }));
  return { shot, state, size: png(shot) };
}

// The one tab that runs the extension's content script. The popup can ask
// without the tabs permission; it learns no address.
const tabOfPage = () =>
  popup.evaluate(async () => {
    const answers = [];
    for (const tab of await chrome.tabs.query({})) {
      try {
        const answer = await chrome.tabs.sendMessage(tab.id, { readelaMark: "status" });
        if (typeof answer?.status === "string") answers.push(tab.id);
      } catch {
        // Not a page this extension runs on.
      }
    }
    return answers.length === 1 ? answers[0] : null;
  });

// Bookmark the paragraph marked for it, as a reader does: select text in it
// and press the popup's Save place.
async function savePlace(page, scheme) {
  const tab = await tabOfPage();
  assert.ok(Number.isInteger(tab), "one listing page is open");
  await page.evaluate(() => getSelection().selectAllChildren(document.querySelector("#saved")));
  await loadPopup(scheme, tab);
  await until(popup, () => !document.querySelector("#place-save").disabled);
  const before = await popup.$eval("#place-note", (note) => note.textContent);
  await popup.$eval("#place-save", (button) => button.click());
  await until(popup, (was) => document.querySelector("#place-note").textContent !== was, before);
  assert.equal(await popup.$eval("#place-note", (note) => note.textContent), "Bookmark saved.");
  await page.evaluate(() => getSelection().removeAllRanges());
  // The emphasis that follows a save lasts a moment; the picture is taken after it.
  await until(page, () => document.querySelector("#saved").hasAttribute("data-readela-mark") && document.querySelector("[data-readela-flash]") === null);
  return tab;
}

// ---------------------------------------------------------------------------
// The frame.

const HEAD = '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">';
const FRAME_STYLE = `
  @font-face { font-family: "Frame"; src: url(data:font/woff2;base64,${inter}) format("woff2"); font-weight: 100 900; }
  html, body { margin: 0; width: ${SCREENSHOT.width}px; height: ${SCREENSHOT.height}px; overflow: hidden; }
  body { background: #e6edf6; color: #10233b; font-family: "Frame", system-ui, sans-serif; }
  body.dark { background: #0f1b2d; color: #f1f5fb; }
  header { position: absolute; left: ${MARGIN}px; right: ${MARGIN}px; top: 26px; height: 88px; display: flex; align-items: center; gap: 20px; }
  header img { flex: none; width: 64px; height: 64px; }
  h1 { margin: 0; font-size: 42px; line-height: 50px; font-weight: 650; letter-spacing: -0.012em; white-space: nowrap; }
  header p { margin: 2px 0 0; font-size: 22px; line-height: 30px; color: #40546e; white-space: nowrap; }
  .dark header p { color: #b3c2d6; }
  .room { position: absolute; left: ${MARGIN}px; top: ${ROOM.top}px; width: ${ROOM.width}px; height: ${ROOM.height}px; display: flex; gap: ${GAP}px; align-items: flex-start; }
  .part { flex: none; }
  .label { display: block; width: fit-content; height: 26px; margin: 0 0 ${LABEL - 26}px; padding: 0 12px; border-radius: 13px; font-size: 16px; line-height: 26px; font-weight: 600; background: #cfd9e6; color: #23364f; }
  .label.readela { background: #0b5cad; color: #fff; }
  .shot { display: block; border-radius: 14px; box-shadow: 0 10px 28px rgb(16 35 59 / 0.2), 0 0 0 1px rgb(16 35 59 / 0.1); }
  .dark .shot { box-shadow: 0 10px 28px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.14); }
  footer { position: absolute; left: ${MARGIN}px; right: ${MARGIN}px; bottom: 14px; font-size: 14px; line-height: 20px; color: #55687f; }
  .dark footer { color: #93a5bd; }
`;

/**
 * @param {object} frame
 * @param {string} frame.heading what the image shows
 * @param {string} frame.line one line more
 * @param {boolean} [frame.dark]
 * @param {{ shot: Buffer, label?: string, readela?: boolean }[]} frame.parts the captures, left to right
 */
async function frame({ heading, line, dark = false, parts }) {
  const body = parts
    .map(({ shot, label, readela }) => {
      const { width, height } = png(shot);
      const over = label === undefined ? "" : `<span class="label${readela ? " readela" : ""}">${label}</span>`;
      return `<div class="part">${over}<img class="shot" src="${data(shot)}" width="${width}" height="${height}" alt=""></div>`;
    })
    .join("");
  const html = `${HEAD}<style>${FRAME_STYLE}</style>
<body${dark ? ' class="dark"' : ""}>
<header><img src="data:image/png;base64,${icon}" alt=""><div><h1>${heading}</h1><p>${line}</p></div></header>
<div class="room">${body}</div>
<footer>Example text on a test page shaped like the supported sites, as the Readela ${version} extension shows it.</footer>`;
  const page = await open("https://frame.readela.test/", { ...SCREENSHOT, html });
  await page.evaluate(() => document.fonts.ready);
  const fits = await page.evaluate(() => {
    const room = document.querySelector(".room").getBoundingClientRect();
    const inside = (element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    };
    return {
      words: [...document.querySelectorAll("h1, header p, footer")].every(inside),
      parts: [...document.querySelectorAll(".part")].every((part) => {
        const box = part.getBoundingClientRect();
        return box.right <= room.right + 0.5 && box.bottom <= room.bottom + 0.5;
      }),
    };
  });
  assert.deepEqual(fits, { words: true, parts: true }, `"${heading}": everything is inside the frame`);
  const shot = Buffer.from(await page.screenshot({ type: "png" }));
  await page.close();
  return shot;
}

const record = [];
async function save(name, buffer, size, about) {
  const form = png(buffer);
  assert.deepEqual({ width: form.width, height: form.height }, size, `${name} has the size the stores ask for`);
  // 24-bit colour without transparency, which the Chrome Web Store asks for.
  assert.deepEqual({ depth: form.depth, colourType: form.colourType }, { depth: 8, colourType: 2 }, `${name} is an opaque 24-bit image`);
  writeFileSync(path.join(output, name), buffer);
  record.push({ file: `docs/store-images/${name}`, ...size, sha256: createHash("sha256").update(buffer).digest("hex"), ...about });
  console.log(`wrote docs/store-images/${name}`);
}

const whole = { width: Math.round(ROOM.width / SCALE), height: Math.round(ROOM.height / SCALE) };
const half = { width: Math.round((ROOM.width - GAP) / 2 / SCALE), height: Math.round((ROOM.height - LABEL) / SCALE) };
const beside = { width: Math.round((ROOM.width - GAP - POPUP_WIDTH * POPUP_SCALE) / SCALE), height: whole.height };
const pixels = ({ width, height }) => ({ width: width * SCALE, height: height * SCALE });
for (const size of [whole, half, beside]) assert.ok(Number.isInteger(size.width * SCALE) && Number.isInteger(size.height * SCALE), "a capture fills its place to the pixel");

const READING = { theme: "paper", font: "sans", direction: "auto", size: "110", spacing: "1.75" };

// 1. What Readela is: a reply in Paper and Readela Sans beside the popup.
{
  const settings = READING;
  const { page, seen } = await show("comfort", { ...beside, settings });
  const shot = await capture(page, pixels(beside));
  const { shot: popupShot, state } = await capturePopup("light", await tabOfPage(), settings);
  await page.close();
  await save(
    "01-comfortable-reading.png",
    await frame({
      heading: "Comfortable reading on ChatGPT and Claude",
      line: "Paper and Night colours, a clear font, larger text, text direction and a bookmark.",
      parts: [{ shot }, { shot: popupShot }],
    }),
    SCREENSHOT,
    { page: PAGES.comfort.url, settings, seen, popup: state },
  );
}

// 2. The same reply as the page shows it and in Paper with Readela Sans.
{
  const before = await show("typeface", { ...half, settings: { enabled: false } });
  const original = await capture(before.page, pixels(half));
  await before.page.close();
  const settings = { theme: "paper", font: "sans", direction: "auto" };
  const after = await show("typeface", { ...half, settings });
  const reading = await capture(after.page, pixels(half));
  await after.page.close();
  await save(
    "02-paper-and-readela-sans.png",
    await frame({
      heading: "A warm page and a clear font",
      line: "Left: the page as it is. Right: Paper with Readela Sans, for Latin, Persian and Arabic.",
      parts: [
        { shot: original, label: "Original" },
        { shot: reading, label: "Paper · Readela Sans", readela: true },
      ],
    }),
    SCREENSHOT,
    { page: PAGES.typeface.url, left: { settings: { enabled: false }, seen: before.seen }, right: { settings, seen: after.seen } },
  );
}

// 3. Night, on a page whose own theme is dark, in three languages.
{
  const settings = { ...READING, theme: "night" };
  const { page, seen } = await show("night", { ...whole, scheme: "dark", settings });
  assert.equal(seen.rtl, 2, "the Persian and the Arabic paragraph read right-to-left");
  const shot = await capture(page, pixels(whole));
  await page.close();
  await save(
    "03-night.png",
    await frame({
      heading: "Night for reading after dark",
      line: "Warm light text on a dark page. Your own messages and the site’s controls stay as they are.",
      dark: true,
      parts: [{ shot }],
    }),
    SCREENSHOT,
    { page: PAGES.night.url, scheme: "dark", settings, seen },
  );
}

// 4. Direction as the page gives it and as Auto gives it; nothing else differs.
{
  const kept = { theme: "paper", font: "sans" };
  const before = await show("direction", { ...half, settings: { ...kept, direction: "page" } });
  assert.equal(before.seen.marked, 0, "under Original no direction is given");
  const original = await capture(before.page, pixels(half));
  await before.page.close();
  const after = await show("direction", { ...half, settings: { ...kept, direction: "auto" } });
  // The Persian paragraph, the list with its two items and the Arabic paragraph.
  assert.ok(after.seen.rtl >= 4, "the Persian and Arabic blocks read right-to-left");
  const auto = await capture(after.page, pixels(half));
  await after.page.close();
  await save(
    "04-text-direction.png",
    await frame({
      heading: "Every paragraph in its own direction",
      line: "Persian and Arabic read right-to-left, English left-to-right; code and numbers stay in order.",
      parts: [
        { shot: original, label: "Direction: Original" },
        { shot: auto, label: "Direction: Auto", readela: true },
      ],
    }),
    SCREENSHOT,
    { page: PAGES.direction.url, left: { settings: { ...kept, direction: "page" }, seen: before.seen }, right: { settings: { ...kept, direction: "auto" }, seen: after.seen } },
  );
}

// 5. The bookmark: three conversations get one, by the popup's button; the
// picture is of the third, with the popup beside it.
{
  const settings = { theme: "night", font: "sans", direction: "auto" };
  for (const name of ["notes", "week"]) {
    const { page } = await show(name, { ...beside, scheme: "dark", settings });
    await savePlace(page, "dark");
    await page.close();
  }
  const { page } = await show("bookmark", { ...beside, scheme: "dark", settings });
  const tab = await savePlace(page, "dark");
  await until(page, () => document.querySelectorAll("[data-readela-saved]").length === 3);
  const seen = await facts(page);
  assert.deepEqual({ saved: seen.saved, savedRows: seen.savedRows }, { saved: 1, savedRows: 3 }, "one place is marked and three rows have a bookmark");
  const shot = await capture(page, pixels(beside));
  const { shot: popupShot, state } = await capturePopup("dark", tab, settings);
  assert.deepEqual({ save: state.save, note: state.note, total: state.total }, { save: "Update", note: "A bookmark is saved in this conversation.", total: "3 total" });
  const stored = await popup.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)));
  assert.ok(!/Return brings|paragraph of|readela-listing/.test(stored), "what is stored holds no text and no address");
  await page.close();
  await save(
    "05-bookmark.png",
    await frame({
      heading: "Save your place and return to it",
      line: "One bookmark per conversation, kept on this device as fingerprints, never as your text.",
      dark: true,
      parts: [{ shot }, { shot: popupShot }],
    }),
    SCREENSHOT,
    { page: PAGES.bookmark.url, scheme: "dark", settings, seen, popup: state, storedKeys: Object.keys(JSON.parse(stored)).sort() },
  );
}

// The small promotional tile: the icon and the name, nothing else.
{
  const tile = `${HEAD}<style>
  html,body{margin:0;width:${TILE.width}px;height:${TILE.height}px;background:#0b5cad;overflow:hidden;color:#fff;font-family:system-ui,"Segoe UI",sans-serif}
  .row{display:flex;align-items:center;gap:28px;position:absolute;left:44px;top:70px}
  img{width:128px;height:128px;display:block;border-radius:26px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
  h1{margin:0;font-size:44px;font-weight:600;letter-spacing:.5px}
  p{margin:6px 0 0;font-size:20px;opacity:.85}
</style>
<div class="row"><img src="data:image/png;base64,${icon}" alt=""><div><h1>Readela</h1><p>by Amir42</p></div></div>`;
  const page = await open("https://frame.readela.test/tile", { ...TILE, html: tile });
  await save("promo-small-440x280.png", Buffer.from(await page.screenshot({ type: "png" })), TILE, {});
  await page.close();
}

// ---------------------------------------------------------------------------
// For checking: each screenshot as a store shows it, at half size, and one
// sheet of everything.

const screenshots = record.filter((entry) => entry.width === SCREENSHOT.width);
for (const entry of screenshots) {
  const name = path.basename(entry.file, ".png");
  const html = `${HEAD}<style>html,body{margin:0;overflow:hidden}img{display:block}</style><img src="${data(read(entry.file))}" width="640" height="400" alt="">`;
  const page = await open("https://frame.readela.test/small", { width: 640, height: 400, html });
  writeFileSync(path.join(checks, `${name}-640x400.png`), Buffer.from(await page.screenshot({ type: "png" })));
  await page.close();
}
{
  const cell = (entry, index) =>
    `<figure><img src="${data(read(entry.file))}" width="640" height="400" alt=""><figcaption>${index + 1}. ${path.basename(entry.file)}</figcaption></figure>`;
  const tile = record.find((entry) => entry.width === TILE.width);
  const html = `${HEAD}<style>
  html,body{margin:0;background:#fff;font:15px/22px system-ui,"Segoe UI",sans-serif;color:#1b1f24}
  main{display:grid;grid-template-columns:repeat(3,640px);gap:20px 24px;padding:24px;width:max-content}
  figure{margin:0} img{display:block;box-shadow:0 0 0 1px #0003} figcaption{margin-top:6px}
</style><main>${screenshots.map(cell).join("")}<figure><img src="${data(read(tile.file))}" width="${TILE.width}" height="${TILE.height}" alt=""><figcaption>${path.basename(tile.file)} (full size); the screenshots are at half size</figcaption></figure></main>`;
  const page = await open("https://frame.readela.test/sheet", { width: 2016, height: 916, html });
  writeFileSync(path.join(checks, "contact-sheet.png"), Buffer.from(await page.screenshot({ type: "png", fullPage: true })));
  await page.close();
}

assert.deepEqual(refused, [], "no page asked for anything but itself and the extension's own files");
writeFileSync(
  path.join(checks, "store-images.json"),
  `${JSON.stringify({ version, extension: "dist/chrome", browser: await browser.version(), scale: SCALE, popupScale: POPUP_SCALE, images: record }, null, 2)}\n`,
);
console.log("wrote dist/store-images/ (half-size copies, contact-sheet.png, store-images.json)");

await popup.close();
await browser.close();
