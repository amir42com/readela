import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { BUNDLED_FONTS, FONT_LICENCES } from "../../src/core/index.js";
import { SITES, matchPatterns, siteFor } from "../../src/page/sites/index.js";

const manifest = JSON.parse(readFileSync(new URL("../../src/manifest/base.json", import.meta.url), "utf8"));
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
    for (const optional of ["within", "extraBlocks", "scroller", "turn", "order", "rows"]) {
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
    ],
  };
  for (const site of SITES) {
    for (const hook of hooks[site.id]) assert.ok(pages[site.id].includes(hook), `${site.name} fixture has ${hook}`);
    // The hook each adapter relies on is one the fixture was checked for above.
    const named = [site.user, site.prose, site.capsule, site.scroller, site.turn, site.order, site.rows].filter(Boolean).join(" ");
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
  for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions", "background"]) {
    assert.equal(key in manifest, false, key);
  }
});

test("the web-accessible resources are the packaged fonts and nothing else, for the supported hosts only", () => {
  const fonts = BUNDLED_FONTS.map((font) => font.file);
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
    assert.match(site.rows, /^a\[data-[a-z-]+\]\[href\]$/, site.name);
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
