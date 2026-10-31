import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { BUNDLED_FONTS, FONT_LICENCES } from "../../src/core/index.js";
import { COMMANDS } from "../../src/browser/shortcut.js";
import { SITES, matchPatterns, siteFor } from "../../src/page/sites/index.js";

const readJson = (file) => JSON.parse(readFileSync(new URL(`../../src/manifest/${file}`, import.meta.url), "utf8"));
const manifest = readJson("base.json");
const source = (file) => readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8");
const fixture = (name) => readFileSync(new URL(`../e2e/fixtures/${name}`, import.meta.url), "utf8");

test("every site adapter satisfies the site contract", () => {
  assert.deepEqual(SITES.map((site) => site.name), ["ChatGPT", "Claude"]);
  assert.deepEqual(SITES.map((site) => site.id), ["chatgpt", "claude"]);
  for (const site of SITES) {
    assert.ok(site.hosts.length > 0, site.name);
    for (const host of site.hosts) assert.match(host, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, `${site.name}: ${host}`);
    // Every adapter says where the conversation is, whose a message is, and
    // which part of a response is reading text; nothing else is ever coloured.
    for (const required of ["scope", "exclude", "user", "prose", "capsule"]) {
      assert.ok(typeof site[required] === "string" && site[required].length > 0, `${site.name}.${required}`);
    }
    for (const optional of ["within", "extraBlocks", "scroller", "turn", "order", "rows", "rowShown", "rowPlacement", "token"]) {
      if (optional in site) assert.ok(typeof site[optional] === "string" && site[optional].length > 0, `${site.name}.${optional}`);
    }
    assert.ok(site.conversation.length > 0, `${site.name}.conversation`);
    for (const pattern of site.conversation) assert.ok(pattern instanceof RegExp, `${site.name}.conversation`);
    // The composer and every other editable field are excluded on every site.
    for (const editable of ["textarea", "input", "[contenteditable]", '[role="textbox"]', "form", "button"]) {
      assert.ok(site.exclude.includes(editable), `${site.name} excludes ${editable}`);
    }
    // The application shell is the site's.
    for (const shell of ["nav", "aside", "header", "footer", '[role="dialog"]', '[role="navigation"]']) {
      assert.ok(site.exclude.includes(shell), `${site.name} excludes ${shell}`);
    }
    // The reader's own message is never the reading surface.
    assert.notEqual(site.user, site.prose, site.name);
  }
});

test("the test conversations carry the hooks each adapter names, as observed on the sites", () => {
  const pages = { chatgpt: fixture("conversation.html"), claude: fixture("claude-conversation.html") };
  const hooks = {
    chatgpt: [
      'data-markdown-text-style="assistant-message"',
      'data-user-message-bubble="true"',
      'data-markdown-copy="code-block"',
      'data-markdown-copy="inline-code"',
      "data-turn-key=",
      "data-app-action-timeline-scroll",
      "data-interactive-row-link=",
    ],
    claude: [
      'data-testid="assistant-message"',
      'data-testid="user-message"',
      "standard-markdown",
      "data-not-prose",
      "data-turn-key=",
      "data-index=",
      'data-autoscroll-container="true"',
      "data-row-main-button=",
      "data-row-key=",
      'aria-current="page"',
    ],
  };
  for (const site of SITES) {
    for (const hook of hooks[site.id]) assert.ok(pages[site.id].includes(hook), `${site.name} fixture has ${hook}`);
    // The hook each adapter relies on is one the fixture was checked for above.
    const named = [site.user, site.prose, site.capsule, site.token, site.scroller, site.turn, site.order, site.rows, site.rowShown]
      .filter(Boolean)
      .join(" ");
    for (const hook of hooks[site.id]) {
      const word = hook.replace(/=.*$/, "");
      if (word.startsWith("data-") && !/testid/.test(word)) assert.ok(named.includes(word), `${site.name} adapter names ${word}`);
    }
  }
});

test("no host is served by two adapters", () => {
  const hosts = SITES.flatMap((site) => site.hosts);
  assert.equal(new Set(hosts).size, hosts.length);
});

test("the manifest requests exactly the supported hosts and nothing broader", () => {
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, matchPatterns());
  assert.deepEqual(matchPatterns(), ["https://chatgpt.com/*", "https://claude.ai/*"]);
  assert.deepEqual(manifest.permissions, ["storage"]);
  for (const browser of ["chrome.json", "firefox.json"]) {
    const built = { ...manifest, ...readJson(browser) };
    assert.deepEqual(built.permissions, ["storage"], browser);
    for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions"]) {
      assert.equal(key in built, false, `${browser}: ${key}`);
    }
  }
});

test("three commands, with no key of their own, and a background component of one file that passes them on and is the one writer of bookmarks", () => {
  // The reader gives a command a key in the browser's own settings, or none.
  assert.deepEqual(manifest.commands, {
    bookmark: { description: "Save the bookmark at the reading position, or update it" },
    "bookmark-return": { description: "Return to the bookmark" },
    "bookmark-remove": { description: "Remove the bookmark" },
  });
  assert.doesNotMatch(JSON.stringify(manifest.commands), /suggested_key|_execute/);
  // Each command asks the page for what the popup's button of that name asks.
  assert.deepEqual(
    COMMANDS.map(({ name, request, label }) => [name, request, label]),
    [
      ["bookmark", "quick", "Save place / Update"],
      ["bookmark-return", "go", "Return"],
      ["bookmark-remove", "clear", "Remove"],
    ],
  );
  assert.deepEqual(Object.keys(manifest.commands), COMMANDS.map((command) => command.name));
  // A service worker in Chrome, a non-persistent script in Firefox: the same one file.
  assert.equal("background" in manifest, false);
  assert.deepEqual(readJson("chrome.json").background, { service_worker: "background.js" });
  assert.deepEqual(readJson("firefox.json").background, { scripts: ["background.js"] });

  // The component listens for the commands, and for requests to change the
  // stored bookmarks, which it hands to the one writer. It keeps no time,
  // asks for nothing, and holds nothing of its own between two changes.
  const background = source("background/main.js");
  assert.deepEqual(background.match(/\.addListener\(/g), [".addListener("]);
  // Where the browser has no commands (Firefox for Android) it still loads.
  assert.match(background, /api\.commands\?\.onCommand\?\.addListener\(onCommand\)/);
  assert.match(background, /^answerMarkChanges\(createMarkWriter\(\)\);$/m);
  const idle = /setTimeout|setInterval|alarms|fetch\(|XMLHttpRequest|WebSocket|importScripts|onInstalled|onStartup|onConnect|keepAlive/;
  assert.doesNotMatch(background, idle);
  assert.doesNotMatch(background, /api\.storage|new Map|new Set|^(?:let|var) /m);
  // It reaches the page through the one exchange the popup uses.
  assert.match(background, /askTab\(target, request\)/);
  const messages = source("browser/messages.js");
  assert.match(messages, /MARK_REQUESTS = Object\.freeze\(\["status", "set", "go", "clear", "quick"\]\)/);

  // What it runs for a change: nothing that waits or reaches out either, a
  // request from this extension only, and nothing kept by the writer but the
  // order of the changes.
  const storage = source("browser/storage.js");
  for (const part of [messages, storage]) assert.doesNotMatch(part, idle);
  assert.equal(messages.match(/sender\.id !== api\.runtime\.id/g).length, 2);
  const begins = storage.indexOf("export function createMarkWriter");
  const writer = storage.slice(begins, storage.indexOf("\n}\n", begins));
  assert.deepEqual(writer.match(/^ {2}(?:let|const) \w+/gm), ["  let last"]);
  // A page asks the writer and never writes the bookmarks itself; the popup
  // does not write them at all.
  assert.match(source("content/main.js"), /store: askStore/);
  assert.ok(source("content/main.js").includes("askWriter(request).then("), "and waits for the writer's answer only so long");
  for (const file of ["content/main.js", "page/reader.js", "ui/popup.js"]) {
    assert.doesNotMatch(source(file), /changeMarks|createMarkWriter|storage\.local\.set\(\{ \[MARKS_KEY\]/, file);
  }
});

test("the page listens for no key to save with, and the popup records none", () => {
  // The only key event the page code names is among the kinds of input that
  // stop a search for a place; nothing is ever done on a particular key.
  for (const file of ["page/reader.js", "content/main.js", "browser/messages.js", "browser/storage.js"]) {
    const text = source(file);
    assert.doesNotMatch(text, /addEventListener\(\s*["'](keydown|keyup|keypress)/, file);
    assert.doesNotMatch(text, /\bevent\.(key|code)\b|\.(altKey|shiftKey|ctrlKey|metaKey)\b/, file);
  }
  assert.match(source("page/reader.js"), /const TAKEOVER = \["wheel", "touchstart", "pointerdown", "keydown"\];/);
  // The popup shows the key the browser holds and opens the browser's own
  // settings; it has no field or listener that takes one.
  const popup = source("ui/popup.js") + source("ui/popup.html") + source("browser/shortcut.js");
  assert.doesNotMatch(popup, /keydown|keyup|keypress|commands\.update|suggested_key/);
  assert.match(source("browser/shortcut.js"), /chrome:\/\/extensions\/shortcuts/);
});

test("the page code creates no element and writes no markup", () => {
  // Readela's footprint in a page is attributes and custom properties. A
  // control of its own inside a site's interface would be an element.
  for (const file of ["page/reader.js", "page/style.js", "content/main.js", "page/sites/chatgpt.js", "page/sites/claude.js"]) {
    assert.doesNotMatch(
      source(file),
      /createElement|createTextNode|attachShadow|innerHTML|outerHTML|insertAdjacent|\.append\(|\.prepend\(|\.appendChild\(|\.insertBefore\(|document\.write/,
      file,
    );
  }
});

test("the popup calls the feature Bookmark; the first action is Save place, then Update; what it says stands under its buttons", () => {
  const html = source("ui/popup.html");
  const script = source("ui/popup.js");
  assert.match(html, /<h2 id="place-title">Bookmark<\/h2>/);
  assert.match(html, /id="place-save" aria-label="Save place in this conversation"[^>]*>Save place<\/button>/);
  assert.match(script, /saved \? "Update" : "Save place"/);
  assert.match(html, /id="place-return" aria-label="Return to bookmark">Return<\/button>/);
  assert.match(html, /id="place-clear" aria-label="Remove bookmark">Remove<\/button>/);
  // What holds for this conversation, in the sentence as the owner corrected it.
  assert.match(script, /none: "Save your place in this conversation\."/);
  assert.match(script, /saved: "A bookmark is saved in this conversation\."/);
  assert.doesNotMatch(`${html}\n${script}`, /Save place your place/);
  // At the limit the reader is told where a bookmark can be removed, not to press a button that is off.
  assert.match(script, /All \$\{MARK_LIMIT\} bookmarks are in use\. Open a bookmarked conversation and remove its bookmark to save a new one\./);
  // A failed save is not said to have changed nothing: its answer may be what was lost.
  assert.match(script, /failed: "Could not confirm the bookmark was saved\."/);
  // The earlier names of the feature are gone from what the reader sees, and no key is named.
  const visible = `${html}\n${script}`;
  assert.doesNotMatch(visible, /Saved place|Saved here|Not saved here|Clear saved place|Bookmarked here|Not bookmarked|Alt\+Shift/);
  assert.doesNotMatch(html, />\s*Clear\s*</);
  assert.match(script, /\`\$\{total\} total\`/);
  // The spacing choices the popup offers are the ones the preferences know.
  assert.deepEqual([...html.matchAll(/name="spacing" value="([^"]+)"/g)].map((match) => match[1]), ["page", "1.5", "1.75", "2.0"]);
});

test("the popup is five rows of settings in the approved order, Help closed, and a footer that says nothing", () => {
  const html = source("ui/popup.html");
  const script = source("ui/popup.js");
  const styles = source("ui/popup.css");
  // The rows, by the setting each one changes, and the names a reader sees.
  assert.deepEqual([...html.matchAll(/<fieldset class="group">\s*<legend>(.*?)<\/legend>[\s\S]*?name="(\w+)"/g)].map((match) => [match[2], match[1]]), [
    ["theme", "Appearance"],
    ["direction", '<span aria-hidden="true">Direction</span><span class="hidden">Text direction</span>'],
    ["font", "Font"],
    ["size", "Text size"],
    ["spacing", "Line spacing"],
  ]);
  assert.match(html, /aria-label="RTL, right-to-left"/);
  assert.match(html, /aria-label="LTR, left-to-right"/);
  // No line under a choice any more: what a choice means is in Help, which is closed until it is opened.
  assert.doesNotMatch(html, /class="hint"|<details[^>]*\bopen\b/);
  assert.match(html, /<details class="help" id="help">\s*<summary id="help-summary">Help<\/summary>/);
  assert.equal(html.match(/<p(?: id="[\w-]+")?><strong>/g).length, 7);
  assert.match(script, /"Settings apply instantly\.", "Original keeps the site’s setting\."/);
  // The two places where something is said: under the settings and under the bookmark's buttons.
  const live = [...html.matchAll(/<p class="said" id="([\w-]+)" role="status" aria-live="polite" aria-atomic="true"><\/p>/g)].map((match) => match[1]);
  assert.deepEqual(live, ["status", "place-note"]);
  assert.ok(html.indexOf('id="status"') > html.indexOf('name="spacing"') && html.indexOf('id="status"') < html.indexOf('class="place"'));
  assert.ok(html.indexOf('id="place-note"') > html.indexOf('id="place-clear"') && html.indexOf('id="place-note"') < html.indexOf("<footer>"));
  // The footer: Reset settings, who made this, the version. Nothing in it is a place for words to appear.
  const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
  assert.deepEqual([...footer.matchAll(/\bid="([\w-]+)"/g)].map((match) => match[1]), ["reset", "publisher", "version-line", "version"]);
  assert.doesNotMatch(footer, /role="status"|aria-live|class="said"/);
  assert.match(script, /reset: "Settings reset\. Bookmarks kept\."/);
  assert.match(script, /failed: "Could not save your changes\."/);
  // The popup wears the chosen appearance, from the one setting there is: no setting of its own.
  assert.match(script, /if \(preferences\.theme === "page"\) root\.removeAttribute\("data-theme"\);\s*else root\.setAttribute\("data-theme", preferences\.theme\);/);
  assert.match(styles, /:root\[data-theme="paper"\] \{\s*color-scheme: light;/);
  assert.match(styles, /:root\[data-theme="night"\] \{\s*color-scheme: dark;/);
  assert.match(styles, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \{/);
  // It takes the width it is laid out for, never more than it is given, has no fixed height and scrolls only where it must.
  assert.match(styles, /body \{[^}]*\bwidth: 360px;[^}]*\bmax-width: 100%;/);
  assert.match(styles, /html \{\s*overflow-y: auto;\s*\}/);
  assert.doesNotMatch(styles, /(?:^|\n)(?:html|body|main) \{[^}]*[^-]height:/);
  assert.doesNotMatch(styles, /text-overflow|line-clamp/);
});

test("under the bookmark's buttons: the message with the total beside it, then the shortcuts as pairs in two columns; no word of a choice can break", () => {
  const html = source("ui/popup.html");
  const script = source("ui/popup.js");
  const styles = source("ui/popup.css");
  // The total stands with the message, and is no part of the shortcuts.
  assert.match(
    html,
    /<div class="place-said">\s*<p class="said" id="place-note"[^>]*><\/p>\s*<p class="total"><span id="place-total" aria-hidden="true"><\/span><span class="hidden" id="place-total-name"><\/span><\/p>\s*<\/div>/,
  );
  const shortcuts = html.slice(html.indexOf('<div class="shortcuts"'), html.indexOf("</section>"));
  assert.doesNotMatch(shortcuts, /place-total/);
  // The shortcuts: a name, a short state, the way to the browser's settings beside them, and under them a list of pairs.
  assert.match(shortcuts, /<h3 id="shortcuts-title">Shortcuts<\/h3>\s*<span id="shortcut-state"><\/span>\s*<button type="button" id="shortcut-set" class="quiet"/);
  assert.match(shortcuts, /<dl id="shortcut-list" aria-labelledby="shortcuts-title" hidden><\/dl>/);
  // Nothing where the browser tells nothing; two words where no key is assigned; a key exactly as the browser gives it.
  assert.match(script, /shortcuts\.hidden = commands === null;/);
  assert.match(script, /shortcutState\.textContent = set\.length === 0 \? "Not set" : "";/);
  assert.match(script, /keys\.textContent = command\.keys;/);
  assert.doesNotMatch(script, /Shortcuts:|\.join\("\\n"\)/);
  assert.match(styles, /#shortcut-list \{\s*display: grid;\s*grid-template-columns: max-content minmax\(0, 1fr\);/);
  // Choices and actions share a row evenly and are never narrower than a word: nothing lets a word break.
  assert.match(styles, /\.segments \{\s*display: flex;/);
  assert.match(styles, /\.segments label \{[^}]*\bflex: 1 1 0;/);
  assert.match(styles, /\.actions button \{\s*flex: 1 1 0;/);
  assert.doesNotMatch(styles.slice(styles.indexOf(".segments {"), styles.indexOf("/* Something to say")), /overflow-wrap|word-break|hyphens/);
  // The rows are sized from the width the content really has, which a scrollbar makes less than the popup's own.
  assert.match(styles, /main \{\s*padding: 10px clamp\(12px, calc\(13\.333% - 34px\), 14px\) 8px;/);
  // Every rule for little room is kept from the narrow room a browser starts sizing a popup in.
  assert.doesNotMatch(styles, /@media \(max-width/);
  assert.equal(styles.match(/@media \(min-width: 120px\)/g).length, 3);
  assert.match(styles, /@media \(min-width: 120px\) \{\s*\.segments,\s*\.actions \{\s*flex-wrap: wrap;/);
  assert.doesNotMatch(styles, /\n\.(?:segments|actions) \{[^}]*flex-wrap/);
});

test("the web-accessible resources are the packaged fonts and nothing else, for the supported hosts only", () => {
  const fonts = [...new Set(BUNDLED_FONTS.map((font) => font.file))];
  assert.deepEqual(fonts, ["fonts/Vazirmatn-NL-wght.woff2", "fonts/InterVariable.woff2", "fonts/InterVariable-Italic.woff2"]);
  assert.deepEqual(manifest.web_accessible_resources, [{ resources: fonts, matches: matchPatterns() }]);
  for (const file of fonts) assert.ok(existsSync(new URL(`../../src/${file}`, import.meta.url)), `${file} is in the source tree`);
  // Each font travels with its licence, and the notes say where each came from.
  assert.deepEqual(FONT_LICENCES, ["fonts/OFL.txt", "fonts/Inter-LICENSE.txt"]);
  for (const file of FONT_LICENCES) {
    const licence = readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8");
    assert.match(licence, /SIL OPEN FONT LICENSE Version 1\.1/i, file);
  }
  const notes = readFileSync(new URL("../../src/fonts/README.md", import.meta.url), "utf8");
  for (const word of ["Vazirmatn", "v33.003", "Inter", "4.1", "InterVariable.woff2", "InterVariable-Italic.woff2"]) {
    assert.ok(notes.includes(word), `the font notes name ${word}`);
  }
});

test("the sidebar is marked only through the hook each adapter names, on the links of conversations", () => {
  for (const site of SITES) {
    // A link with an address, by a data hook; on a site whose navigation uses
    // the same hook, only under a row of a conversation.
    assert.match(site.rows, /^(\[data-[a-z-]+\] )?a\[data-[a-z-]+\]\[href\]$/, site.name);
    // A row is a link; the application shell stays excluded from everything else.
    assert.ok(site.exclude.includes("nav") && site.exclude.includes("aside"), site.name);
  }
});

test("the popup names one outside address, the publisher's, as a link that asks for nothing until it is followed", () => {
  const popup = readFileSync(new URL("../../src/ui/popup.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../../src/ui/popup.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../src/ui/popup.css", import.meta.url), "utf8");
  assert.deepEqual(popup.match(/https?:\/\/[^"'\s<>)]+/g), ["https://amir42.com"]);
  assert.equal(manifest.homepage_url, "https://amir42.com");
  const link = popup.match(/<a\b[^>]*>/g);
  assert.equal(link.length, 1);
  assert.match(link[0], /href="https:\/\/amir42\.com"/);
  assert.match(link[0], /target="_blank"/);
  assert.match(link[0], /rel="noopener noreferrer"/);
  // Nothing in the popup loads anything from outside the extension.
  assert.doesNotMatch(popup, /<(?:img|iframe|script|link)\b[^>]*(?:src|href)="(?:https?:)?\/\//);
  assert.doesNotMatch(popup, /rel="(?:preconnect|prefetch|preload|dns-prefetch)/);
  assert.doesNotMatch(`${script}\n${styles}`, /https?:\/\/|@import|url\(/);
});

test("site selection matches exact hosts only", () => {
  assert.equal(siteFor("chatgpt.com")?.name, "ChatGPT");
  assert.equal(siteFor("claude.ai")?.name, "Claude");
  for (const host of ["www.claude.ai", "evil-claude.ai", "claude.ai.example.org", "chat.openai.com", "example.org", ""]) {
    assert.equal(siteFor(host), null, host);
  }
});
