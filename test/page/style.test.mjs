import assert from "node:assert/strict";
import { test } from "node:test";

import { BUNDLED_FONT, FONT_CHOICES, SIZE_CHOICES, SPACING_CHOICES, THEMES } from "../../src/core/index.js";
import { buildCss } from "../../src/page/style.js";

test("the stylesheet has a rule for every non-default choice", () => {
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
  for (const [name, theme] of Object.entries(THEMES)) {
    assert.ok(css.includes(`html[data-readela-theme="${name}"]`), name);
    assert.ok(css.includes(`--readela-surface: ${theme.surface};`), `${name} surface`);
    assert.ok(css.includes(`--readela-text: ${theme.text};`), `${name} text`);
  }
});

test("the only resource the stylesheet names is the packaged font, and nothing remote", () => {
  for (const fontUrl of [undefined, `chrome-extension://__MSG_@@extension_id__/${BUNDLED_FONT.file}`]) {
    const css = buildCss({ fontUrl });
    assert.equal(css.match(/@font-face/g).length, 1);
    const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((match) => match[1]);
    assert.deepEqual(urls, [`"${fontUrl ?? BUNDLED_FONT.file}"`]);
    assert.doesNotMatch(css, /@import|https?:|local\(/);
  }
  // The face is limited to Arabic-script characters, so other text never uses it.
  assert.ok(buildCss().includes(`unicode-range: ${BUNDLED_FONT.unicodeRange};`));
});

test("every rule is keyed on a Readela mark, so the sheet is inert on an unmarked page", () => {
  const css = buildCss();
  const bodies = css.replace(/@font-face \{[^}]*\}/, "").replace(/@keyframes [^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const selectors = [...bodies.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((match) => match[2].trim()).filter(Boolean);
  assert.ok(selectors.length > 10);
  for (const selector of selectors) assert.match(selector, /data-readela-/, selector);
});

test("reading themes colour the reading surface and its text, and nothing outside it", () => {
  const css = buildCss();
  const themed = css.split("\n").filter((line) => /--readela-(surface|text|link|rule|code|head|selection|site)/.test(line) && line.includes("{"));
  for (const line of themed) {
    const selector = line.slice(0, line.indexOf("{"));
    // Either the declaration of the palette on the root, or a rule inside a reading surface.
    assert.ok(/^html\[data-readela-theme="\w+"\] $/.test(selector) || selector.includes("[data-readela-sheet]"), selector);
  }
});
