import assert from "node:assert/strict";
import { test } from "node:test";

import { FONT_CHOICES, SIZE_CHOICES, SPACING_CHOICES } from "../../src/core/index.js";
import { buildCss } from "../../src/page/style.js";

test("the stylesheet has a rule for every non-default choice and none for a remote resource", () => {
  const css = buildCss();
  for (const font of FONT_CHOICES.filter((choice) => choice !== "page")) {
    assert.ok(css.includes(`[data-readela-font="${font}"]`), font);
  }
  for (const size of SIZE_CHOICES.filter((choice) => choice !== "page")) {
    assert.ok(css.includes(`[data-readela-size="${size}"]`), size);
  }
  for (const spacing of SPACING_CHOICES.filter((choice) => choice !== "page")) {
    assert.ok(css.includes(`[data-readela-spacing="${spacing}"]`), spacing);
  }
  assert.doesNotMatch(css, /url\(|@import|@font-face|https?:/);
});
