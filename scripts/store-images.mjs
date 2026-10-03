// Produces the store listing images from the real built extension.
//
//   node scripts/store-images.mjs            writes docs/store-images/
//
// The built Chrome extension (dist/chrome) is installed into a fresh temporary
// Chrome profile, the synthetic test conversations from test/e2e/fixtures are
// served at the real matched addresses, and the pages, the popup and the
// promotional tile are captured as the browser renders them. Nothing is drawn
// by hand; the only composed image places two real captures side by side.
// The fixtures contain no real conversation. Run `npm run build` first.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "store-images");
const fixtures = {
  "https://chatgpt.com/c/readela-fixture": readFileSync(path.join(root, "test/e2e/fixtures/conversation.html"), "utf8"),
  "https://claude.ai/chat/readela-fixture": readFileSync(path.join(root, "test/e2e/fixtures/claude-conversation.html"), "utf8"),
};
const icon = readFileSync(path.join(root, "src/icons/icon-128.png")).toString("base64");

const SCREENSHOT = { width: 1280, height: 800 }; // Chrome Web Store screenshot size
const TILE = { width: 440, height: 280 }; // Chrome Web Store small promotional tile

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
const executablePath = chromeExecutable();
if (!executablePath) throw new Error("no Chrome executable found (set READELA_CHROME)");
mkdirSync(output, { recursive: true });

const browser = await puppeteer.launch({ browser: "chrome", executablePath, headless: true, pipe: true, enableExtensions: true });
const id = await browser.installExtension(extensionPath);
const popupUrl = `chrome-extension://${id}/popup/popup.html`;

// Serves only the fixtures; every other request is refused.
async function openPage(url, viewport, html) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const body = html ?? fixtures[request.url()];
    if (body !== undefined && (html ? request.url() === url : true)) {
      request.respond({ status: 200, contentType: "text/html; charset=utf-8", body });
    } else {
      request.abort();
    }
  });
  await page.goto(url, { waitUntil: "load" });
  return page;
}

const popup = await browser.newPage();
await popup.setViewport({ width: 320, height: 600, deviceScaleFactor: 2 });
await popup.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await popup.goto(popupUrl, { waitUntil: "domcontentloaded" });
await popup.waitForFunction(() => document.querySelector('input[name="direction"]:checked') !== null);

const setPreferences = (change) =>
  popup.evaluate(async (partial) => {
    const key = "readela.preferences";
    const current = (await chrome.storage.local.get(key))[key] ?? {};
    await chrome.storage.local.set({ [key]: { ...current, ...partial } });
  }, change);

const waitForMarks = (page, present) =>
  page.waitForFunction((expected) => (document.querySelector("[data-readela-dir]") !== null) === expected, {}, present);

const save = async (name, buffer) => {
  writeFileSync(path.join(output, name), buffer);
  console.log(`wrote docs/store-images/${name}`);
};

// 1 and 2: the ChatGPT test conversation with Readela on, then off.
await setPreferences({ enabled: true, direction: "auto", font: "page", size: "page", spacing: "page" });
const chatgpt = await openPage("https://chatgpt.com/c/readela-fixture", SCREENSHOT);
await waitForMarks(chatgpt, true);
const chatgptOn = await chatgpt.screenshot({ type: "png" });
await save("01-chatgpt-readela-on.png", chatgptOn);
await setPreferences({ enabled: false });
await waitForMarks(chatgpt, false);
await save("02-chatgpt-readela-off.png", await chatgpt.screenshot({ type: "png" }));
await setPreferences({ enabled: true });
await waitForMarks(chatgpt, true);
await chatgpt.close();

// 3: the Claude test conversation with Readela on.
const claude = await openPage("https://claude.ai/chat/readela-fixture", SCREENSHOT);
await waitForMarks(claude, true);
await save("03-claude-readela-on.png", await claude.screenshot({ type: "png" }));
await claude.close();

// 4: the real popup beside the page it controls.
await popup.reload({ waitUntil: "domcontentloaded" });
await popup.waitForFunction(() => document.querySelector('input[name="direction"]:checked') !== null);
const popupShot = await popup.screenshot({ type: "png", fullPage: true });
const composition = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${SCREENSHOT.width}px;height:${SCREENSHOT.height}px;background:#eef1f5;overflow:hidden;font:16px system-ui,"Segoe UI",sans-serif;color:#1b1f24}
  .page{position:absolute;left:48px;top:64px;width:840px;height:672px;overflow:hidden;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.18);background:#fff}
  .page img{display:block;width:1050px;transform-origin:top left;transform:scale(.8)}
  .popup{position:absolute;right:72px;top:64px;width:320px;border-radius:12px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.22);background:#fff}
  .popup img{display:block;width:320px}
</style>
<div class="page"><img src="data:image/png;base64,${chatgptOn.toString("base64")}" alt=""></div>
<div class="popup"><img src="data:image/png;base64,${popupShot.toString("base64")}" alt=""></div>`;
const composed = await openPage("https://composition.readela.test/popup", SCREENSHOT, composition);
await save("04-popup-and-page.png", await composed.screenshot({ type: "png" }));
await composed.close();

// 5: the small promotional tile: the icon and the name, nothing else.
const tile = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${TILE.width}px;height:${TILE.height}px;background:#0b5cad;overflow:hidden;color:#fff;font-family:system-ui,"Segoe UI",sans-serif}
  .row{display:flex;align-items:center;gap:28px;position:absolute;left:44px;top:70px}
  img{width:128px;height:128px;display:block;border-radius:26px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
  h1{margin:0;font-size:44px;font-weight:600;letter-spacing:.5px}
  p{margin:6px 0 0;font-size:20px;opacity:.85}
</style>
<div class="row"><img src="data:image/png;base64,${icon}" alt=""><div><h1>Readela</h1><p>by Amir42</p></div></div>`;
const promo = await openPage("https://composition.readela.test/tile", TILE, tile);
await save("promo-small-440x280.png", await promo.screenshot({ type: "png" }));
await promo.close();

await popup.close();
await browser.close();
