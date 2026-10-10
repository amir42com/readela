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
  const themed = css
    .split("\n")
    .filter((line) => /--readela-(surface|text|muted|link|rule|quote|code|head|selection|site|island)/.test(line) && line.includes("{"));
  assert.ok(themed.length > 12);
  for (const line of themed) {
    const selector = line.slice(0, line.indexOf("{"));
    // Either the declaration of the palette on the root, or a rule inside a reading surface.
    assert.ok(/^html\[data-readela-theme="\w+"\] $/.test(selector) || selector.includes("[data-readela-sheet]"), selector);
  }
});

test("what a part of the text means keeps a token of its own, and a unit that stays the site's is never recoloured", () => {
  const css = buildCss();
  const rule = (needle) => css.split("\n").filter((line) => line.includes(needle));
  // Links, inline code, table lines and headers, quotation bars, secondary text,
  // list markers and highlighted text each have their rule.
  for (const [needle, token] of [
    [":is(a, a *)", "--readela-link"],
    [":is(code, kbd, samp)", "--readela-code"],
    [":is(table, thead, tbody, tfoot, tr, th, td)", "--readela-rule"],
    [":is(th)", "--readela-head"],
    [":is(blockquote)", "--readela-quote"],
    [":is(small, del, s, caption, figcaption)", "--readela-muted"],
    ["::marker", "--readela-muted"],
    [" mark:not(", "--readela-selection"],
  ]) {
    const lines = rule(needle);
    assert.equal(lines.length, 1, needle);
    assert.ok(lines[0].includes(`var(${token})`), `${needle} uses ${token}`);
  }
  // Borders are recoloured only on tables and quotations, so the lines a
  // formula is drawn with keep the text's colour.
  const borders = css.split("\n").filter((line) => line.includes("border-color") && line.includes("data-readela-top"));
  assert.equal(borders.length, 2);
  // Every rule for reading text leaves a kept unit and everything in it alone.
  const prose = css.split("\n").filter((line) => line.includes("[data-readela-sheet] > [data-readela-top]"));
  assert.ok(prose.length >= 10);
  for (const line of prose) {
    assert.ok(line.includes("[data-readela-top]:not(pre, [data-readela-island])"), line);
    if (line.includes(" :not(") || line.includes("):not(")) assert.ok(line.includes("[data-readela-island] *"), line);
  }
  // A kept unit gets only what the reader noted it needs: the site's text
  // colour, the site's background behind it, a rounded shape from its own
  // radii. A bare mark changes nothing, so a unit with an opaque background
  // and a colour of its own stays exactly as the site made it.
  const units = rule("[data-readela-island~=");
  assert.deepEqual(
    units.map((line) => line.slice(line.indexOf("[data-readela-island")).replace(/ !important/, "")),
    [
      '[data-readela-island~="text"] { color: var(--readela-site-text); }',
      '[data-readela-island~="surface"] { background-color: var(--readela-site-surface); }',
      '[data-readela-island~="round"] { border-radius: var(--readela-island-radius); }',
    ],
  );
  assert.ok(!css.includes("[data-readela-island] {"), "the bare mark has no rule of its own");
  // Nothing clips: no rule sets overflow, which would cut a focus ring or a control.
  assert.doesNotMatch(css, /overflow/);
});
