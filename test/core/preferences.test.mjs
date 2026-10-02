import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  resetPreferences,
  resolveTypography,
} from "../../src/core/index.js";

test("defaults leave typography to the page and decide direction automatically", () => {
  assert.deepEqual(normalizePreferences(undefined), { ...DEFAULT_PREFERENCES });
  assert.deepEqual(resolveTypography(DEFAULT_PREFERENCES), { fontFamily: null, scale: null, lineHeight: null });
  assert.equal(DEFAULT_PREFERENCES.direction, "auto");
});

test("malformed stored data falls back to defaults field by field", () => {
  for (const raw of [null, "on", 7, [], { enabled: "yes", direction: "up", font: 3, size: 125, spacing: null }]) {
    assert.deepEqual(normalizePreferences(raw), { ...DEFAULT_PREFERENCES }, JSON.stringify(raw));
  }
  assert.deepEqual(normalizePreferences({ enabled: false, direction: "rtl", font: "comic", size: "125" }), {
    ...DEFAULT_PREFERENCES,
    enabled: false,
    direction: "rtl",
    size: "125",
  });
});

test("unknown fields are dropped, so only preferences are ever stored", () => {
  const normalized = normalizePreferences({ enabled: true, message: "private text", history: ["a"] });
  assert.deepEqual(Object.keys(normalized).sort(), Object.keys(DEFAULT_PREFERENCES).sort());
});

test("reset restores reading choices and keeps the on/off state", () => {
  const custom = { enabled: false, direction: "ltr", font: "serif", size: "140", spacing: "2.2" };
  assert.deepEqual(resetPreferences(custom), { ...DEFAULT_PREFERENCES, enabled: false });
  assert.deepEqual(resetPreferences({ ...custom, enabled: true }), { ...DEFAULT_PREFERENCES });
});

test("typography choices resolve to presentation values", () => {
  assert.deepEqual(resolveTypography({ font: "page", size: "125", spacing: "1.9" }), {
    fontFamily: null,
    scale: 1.25,
    lineHeight: 1.9,
  });
  assert.match(resolveTypography({ font: "sans" }).fontFamily, /sans-serif$/);
  assert.match(resolveTypography({ font: "serif" }).fontFamily, /serif$/);
});
