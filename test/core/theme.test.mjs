import assert from "node:assert/strict";
import { test } from "node:test";

import { PAGE_MARK, THEMES, THEME_CHOICES, colourAlpha, contrastRatio } from "../../src/core/index.js";

test("the contrast calculation matches the WCAG reference values", () => {
  assert.equal(contrastRatio("#000000", "#FFFFFF"), 21);
  assert.equal(contrastRatio("#FFFFFF", "#FFFFFF"), 1);
  assert.equal(Math.round(contrastRatio("#767676", "#FFFFFF") * 100) / 100, 4.54);
});

// Each colour is written out as a browser reports it, with the opacity a
// person reads from it. Nothing here is computed the way the code computes it.
test("a colour is clear only when its alpha says so: opaque black is opaque", () => {
  const opaque = [
    "rgb(0, 0, 0)",
    "rgb(255, 255, 0)",
    "rgb(10, 20, 0)",
    "rgb(0 0 0)",
    "rgb(33, 33, 33)",
    "rgba(0, 0, 0, 1)",
    "rgb(0 0 0 / 1)",
    "rgb(0 0 0 / 100%)",
    "hsl(0, 0%, 0%)",
    "color(srgb 0 0 0)",
    "oklab(0 0 0)",
    "oklch(0.2 0 0)",
    "black",
    "#000000",
    "Canvas",
  ];
  for (const colour of opaque) assert.equal(colourAlpha(colour), 1, colour);

  const clear = [
    "transparent",
    "rgba(0, 0, 0, 0)",
    "rgba(255, 255, 255, 0)",
    "rgba(0, 0, 0, 0.0)",
    "rgb(0 0 0 / 0)",
    "rgb(255 255 255 / 0%)",
    "color(srgb 1 1 1 / 0)",
    "oklab(0.5 0.1 0.1 / 0)",
    "hsla(120, 50%, 50%, 0)",
    "  RGBA(0, 0, 0, 0)  ",
  ];
  for (const colour of clear) assert.equal(colourAlpha(colour), 0, colour);

  const partial = [
    ["rgba(0, 0, 0, 0.5)", 0.5],
    ["rgba(136, 136, 136, 0.133)", 0.133],
    ["rgb(0 0 0 / 0.25)", 0.25],
    ["rgb(0 0 0 / 50%)", 0.5],
    ["color(srgb 1 1 1 / 0.05)", 0.05],
    ["oklab(0.243143 -0.000520527 0.00179528 / 0.5)", 0.5],
    ["oklab(0.811751 -0.00325388 0.0148452 / 0.05)", 0.05],
    // A zero just before the alpha, and an alpha that ends in zero.
    ["rgba(10, 20, 0, 0.3)", 0.3],
    ["rgba(10, 20, 30, 0.10)", 0.1],
  ];
  for (const [colour, alpha] of partial) assert.equal(colourAlpha(colour), alpha, colour);
});

test("there is a palette for every theme that changes the page", () => {
  assert.deepEqual(Object.keys(THEMES), THEME_CHOICES.filter((choice) => choice !== "page"));
});

for (const [name, theme] of Object.entries(THEMES)) {
  test(`${name}: primary reading text is at least 10:1 on every surface it can sit on`, () => {
    for (const surface of ["surface", "head", "markTint"]) {
      const ratio = contrastRatio(theme.text, theme[surface]);
      assert.ok(ratio >= 10, `text on ${surface}: ${ratio.toFixed(2)}`);
    }
  });

  test(`${name}: secondary text, links, quotation bars, selected text and the saved place stay clearly perceivable`, () => {
    const pairs = [
      // Secondary reading text: list markers, captions, small and struck text.
      ["muted", "surface", 7],
      ["muted", "head", 7],
      ["muted", "markTint", 7],
      // A quotation's bar is how a quotation is recognised.
      ["quote", "surface", 3],
      ["quote", "markTint", 3],
      ["link", "surface", 7],
      ["link", "markTint", 4.5],
      ["link", "head", 7],
      ["selectionText", "selection", 7],
      // Non-text parts: the bar of the saved place against what it sits beside.
      ["mark", "surface", 3],
      ["mark", "markTint", 3],
    ];
    for (const [foreground, background, minimum] of pairs) {
      const ratio = contrastRatio(theme[foreground], theme[background]);
      assert.ok(ratio >= minimum, `${foreground} on ${background}: ${ratio.toFixed(2)} < ${minimum}`);
    }
  });

  // Inline code and tokens: one treatment on every site. Its text never
  // takes the primary colour, so that pair is not asked for.
  test(`${name}: inline code is told from the sentence by its text, its ground and its line`, () => {
    const pairs = [
      ["codeText", "code", 7], // read on its own ground
      ["codeText", "surface", 7], // and still where a ground is missing
      ["codeLine", "surface", 3], // the boundary against the page
      ["codeLine", "code", 2.5], // and against its own ground
    ];
    for (const [foreground, background, minimum] of pairs) {
      const ratio = contrastRatio(theme[foreground], theme[background]);
      assert.ok(ratio >= minimum, `${foreground} on ${background}: ${ratio.toFixed(2)} < ${minimum}`);
    }
    // The ground is not the surface, and the text is neither the sentence's
    // colour nor a link's.
    assert.ok(contrastRatio(theme.code, theme.surface) >= 1.1, "ground against surface");
    const apart = (first, second) =>
      [1, 3, 5].reduce((sum, at) => sum + Math.abs(parseInt(first.slice(at, at + 2), 16) - parseInt(second.slice(at, at + 2), 16)), 0);
    assert.ok(apart(theme.codeText, theme.text) >= 60, "text against the sentence");
    assert.ok(apart(theme.codeText, theme.link) >= 60, "text against a link");
  });

  test(`${name}: the surface is neither pure white nor pure black`, () => {
    assert.ok(!["#FFFFFF", "#000000"].includes(theme.surface.toUpperCase()));
    assert.ok(!["#FFFFFF", "#000000"].includes(theme.text.toUpperCase()));
  });
}

test("the saved place's bar is at least 3:1 on light and dark pages that Readela does not colour", () => {
  for (const page of ["#FFFFFF", "#FAF9F5", "#000000", "#151515", "#212121", "#262624"]) {
    const ratio = contrastRatio(PAGE_MARK.mark, page);
    assert.ok(ratio >= 3, `${page}: ${ratio.toFixed(2)}`);
  }
});
