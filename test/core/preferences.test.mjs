import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUNDLED_FONTS,
  DEFAULT_PREFERENCES,
  changesPage,
  normalizePreferences,
  resetPreferences,
  resolveDirection,
  resolveTypography,
} from "../../src/core/index.js";

test("defaults leave colours and typography to the page and decide direction automatically", () => {
  assert.deepEqual(normalizePreferences(undefined), { ...DEFAULT_PREFERENCES });
  assert.deepEqual(resolveTypography(DEFAULT_PREFERENCES), { fontFamily: null, scale: null, lineHeight: null });
  assert.equal(DEFAULT_PREFERENCES.direction, "auto");
  assert.equal(DEFAULT_PREFERENCES.theme, "page");
});

test("malformed stored data falls back to defaults field by field", () => {
  for (const raw of [null, "on", 7, [], { enabled: "yes", direction: "up", theme: 1, font: 3, size: 125, spacing: null }]) {
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

test("version 1 preferences migrate: every remaining choice is kept and serif returns to the page's font", () => {
  const v1 = (fields) => ({ version: 1, enabled: true, direction: "auto", font: "page", size: "page", spacing: "page", ...fields });
  const v2 = (fields) => ({ ...DEFAULT_PREFERENCES, ...fields });

  for (const direction of ["auto", "rtl", "ltr"]) {
    assert.deepEqual(normalizePreferences(v1({ direction })), v2({ direction }), direction);
  }
  assert.deepEqual(normalizePreferences(v1({ font: "sans" })), v2({ font: "sans" }));
  assert.deepEqual(normalizePreferences(v1({ font: "serif" })), v2({ font: "page" }));
  assert.deepEqual(
    normalizePreferences(v1({ enabled: false, direction: "rtl", font: "serif", size: "140", spacing: "1.9" })),
    v2({ enabled: false, direction: "rtl", font: "page", size: "140", spacing: "1.9" }),
  );
  // The new aspect starts unchanged, and the stored version moves forward.
  assert.equal(normalizePreferences(v1({})).theme, "page");
  assert.equal(normalizePreferences(v1({})).version, 2);
});

test("reset restores reading choices and keeps the on/off state", () => {
  const custom = { enabled: false, direction: "ltr", theme: "night", font: "sans", size: "140", spacing: "2.2" };
  assert.deepEqual(resetPreferences(custom), { ...DEFAULT_PREFERENCES, enabled: false });
  assert.deepEqual(resetPreferences({ ...custom, enabled: true }), { ...DEFAULT_PREFERENCES });
});

test("the unchanged state of every aspect leaves the page alone", () => {
  const original = { direction: "page", theme: "page", font: "page", size: "page", spacing: "page" };
  assert.equal(changesPage(original), false);
  for (const change of [{ direction: "auto" }, { theme: "paper" }, { font: "sans" }, { size: "110" }, { spacing: "1.6" }]) {
    assert.equal(changesPage({ ...original, ...change }), true, JSON.stringify(change));
  }
  // An unchanged direction decides nothing, even for clearly right-to-left text.
  assert.equal(resolveDirection({ counts: { rtl: 9, ltr: 0 }, mode: "page", context: "rtl" }), null);
});

test("typography choices resolve to presentation values", () => {
  assert.deepEqual(resolveTypography({ font: "page", size: "125", spacing: "1.9" }), {
    fontFamily: null,
    scale: 1.25,
    lineHeight: 1.9,
  });
  const stack = resolveTypography({ font: "sans" }).fontFamily;
  // The packaged face comes first; everything after it is a system font.
  // The packaged faces come first, then system fonts only.
  assert.ok(stack.startsWith(`"Readela Sans Arabic", "Readela Sans Latin", system-ui`));
  // Each face is limited to its own script: Vazirmatn never shows Latin or
  // Hebrew, Inter never shows Arabic script or Hebrew.
  const [arabic, latin, italic] = BUNDLED_FONTS;
  assert.deepEqual(BUNDLED_FONTS.map((font) => `${font.family} ${font.style} ${font.weight}`), [
    "Readela Sans Arabic normal 100 900",
    "Readela Sans Latin normal 100 900",
    "Readela Sans Latin italic 100 900",
  ]);
  assert.match(arabic.unicodeRange, /U\+0600-06FF/);
  assert.doesNotMatch(arabic.unicodeRange, /U\+00|U\+05/);
  assert.match(latin.unicodeRange, /^U\+0000-02FF/);
  assert.doesNotMatch(latin.unicodeRange, /U\+05|U\+06|U\+07|U\+FB|U\+FE7/);
  assert.equal(italic.unicodeRange, latin.unicodeRange);
  // An italic of its own for Latin text; none is claimed for Arabic script.
  assert.equal(BUNDLED_FONTS.filter((font) => font.style === "italic").length, 1);
});
