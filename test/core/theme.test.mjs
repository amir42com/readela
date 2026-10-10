import assert from "node:assert/strict";
import { test } from "node:test";

import { PAGE_MARK, THEMES, THEME_CHOICES, contrastRatio } from "../../src/core/index.js";

test("the contrast calculation matches the WCAG reference values", () => {
  assert.equal(contrastRatio("#000000", "#FFFFFF"), 21);
  assert.equal(contrastRatio("#FFFFFF", "#FFFFFF"), 1);
  assert.equal(Math.round(contrastRatio("#767676", "#FFFFFF") * 100) / 100, 4.54);
});

test("there is a palette for every theme that changes the page", () => {
  assert.deepEqual(Object.keys(THEMES), THEME_CHOICES.filter((choice) => choice !== "page"));
});

for (const [name, theme] of Object.entries(THEMES)) {
  test(`${name}: primary reading text is at least 10:1 on every surface it can sit on`, () => {
    for (const surface of ["surface", "code", "head", "markTint"]) {
      const ratio = contrastRatio(theme.text, theme[surface]);
      assert.ok(ratio >= 10, `text on ${surface}: ${ratio.toFixed(2)}`);
    }
  });

  test(`${name}: links, selected text and the reading mark stay clearly perceivable`, () => {
    const pairs = [
      ["link", "surface", 7],
      ["link", "markTint", 4.5],
      ["link", "head", 7],
      ["selectionText", "selection", 7],
      // Non-text parts: the bar of the reading mark against what it sits beside.
      ["mark", "surface", 3],
      ["mark", "markTint", 3],
    ];
    for (const [foreground, background, minimum] of pairs) {
      const ratio = contrastRatio(theme[foreground], theme[background]);
      assert.ok(ratio >= minimum, `${foreground} on ${background}: ${ratio.toFixed(2)} < ${minimum}`);
    }
  });

  test(`${name}: the surface is neither pure white nor pure black`, () => {
    assert.ok(!["#FFFFFF", "#000000"].includes(theme.surface.toUpperCase()));
    assert.ok(!["#FFFFFF", "#000000"].includes(theme.text.toUpperCase()));
  });
}

test("the reading mark's bar is at least 3:1 on light and dark pages that Readela does not colour", () => {
  for (const page of ["#FFFFFF", "#FAF9F5", "#000000", "#151515", "#212121", "#262624"]) {
    const ratio = contrastRatio(PAGE_MARK.mark, page);
    assert.ok(ratio >= 3, `${page}: ${ratio.toFixed(2)}`);
  }
});
