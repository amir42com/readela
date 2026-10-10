import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { BUNDLED_FONT } from "../../src/core/index.js";
import { SITES, matchPatterns, siteFor } from "../../src/page/sites/index.js";

const manifest = JSON.parse(readFileSync(new URL("../../src/manifest/base.json", import.meta.url), "utf8"));

test("every site adapter satisfies the site contract", () => {
  assert.deepEqual(SITES.map((site) => site.name), ["ChatGPT", "Claude"]);
  for (const site of SITES) {
    assert.ok(site.hosts.length > 0, site.name);
    for (const host of site.hosts) assert.match(host, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, `${site.name}: ${host}`);
    assert.equal(typeof site.scope, "string", site.name);
    assert.ok(site.scope.length > 0, site.name);
    for (const optional of ["within", "surface", "extraBlocks"]) {
      if (optional in site) assert.ok(typeof site[optional] === "string" && site[optional].length > 0, `${site.name}.${optional}`);
    }
    // The composer and every other editable field are excluded on every site.
    for (const editable of ["textarea", "input", "[contenteditable]", '[role="textbox"]', "form", "button"]) {
      assert.ok(site.exclude.includes(editable), `${site.name} excludes ${editable}`);
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

test("the one web-accessible resource is the packaged font, for the supported hosts only", () => {
  assert.deepEqual(manifest.web_accessible_resources, [{ resources: [BUNDLED_FONT.file], matches: matchPatterns() }]);
  assert.ok(existsSync(new URL(`../../src/${BUNDLED_FONT.file}`, import.meta.url)), "the font is in the source tree");
  assert.ok(existsSync(new URL("../../src/fonts/OFL.txt", import.meta.url)), "its licence travels with it");
});

test("site selection matches exact hosts only", () => {
  assert.equal(siteFor("chatgpt.com")?.name, "ChatGPT");
  assert.equal(siteFor("claude.ai")?.name, "Claude");
  for (const host of ["www.claude.ai", "evil-claude.ai", "claude.ai.example.org", "chat.openai.com", "example.org", ""]) {
    assert.equal(siteFor(host), null, host);
  }
});
