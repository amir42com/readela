import assert from "node:assert/strict";
import { test } from "node:test";

import { BUNDLED_FONTS, FONT_CHOICES, PAGE_MARK, SIZE_CHOICES, SPACING_CHOICES, THEMES } from "../../src/core/index.js";
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

test("the only resources the stylesheet names are the packaged fonts, and nothing remote", () => {
  const chrome = (file) => `chrome-extension://__MSG_@@extension_id__/${file}`;
  for (const fontUrl of [undefined, chrome]) {
    const css = buildCss(fontUrl ? { fontUrl } : undefined);
    assert.equal(css.match(/@font-face/g).length, BUNDLED_FONTS.length);
    const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((match) => match[1]);
    assert.deepEqual(urls, BUNDLED_FONTS.map((font) => `"${fontUrl ? fontUrl(font.file) : font.file}"`));
    assert.doesNotMatch(css, /@import|https?:|local\(/);
  }
  // Each face is limited to the characters of its own script, and Latin text
  // has an italic of its own.
  const faces = buildCss().match(/@font-face \{[^}]*\}/g);
  assert.equal(faces.length, 3);
  for (const [index, font] of BUNDLED_FONTS.entries()) {
    assert.ok(faces[index].includes(`font-family: "${font.family}";`));
    assert.ok(faces[index].includes(`font-style: ${font.style};`));
    assert.ok(faces[index].includes(`unicode-range: ${font.unicodeRange};`));
  }
});

test("Readela Sans leaves code, mathematics and units of the site's to their own fonts", () => {
  const rule = buildCss().split("\n").find((line) => line.startsWith('html[data-readela-font="sans"]'));
  assert.ok(rule.includes('"Readela Sans Arabic", "Readela Sans Latin", system-ui'));
  for (const kept of ["pre", "code", "kbd", "samp", "math", ".katex", "mjx-container", "svg", "[data-readela-unit]"]) {
    assert.ok(rule.includes(kept), kept);
  }
  assert.ok(rule.includes("[data-readela-top]:not(pre):not([data-readela-unit])"));
});

test("a saved conversation's row gets a small bookmark that takes no part in the row's layout or input", () => {
  const css = buildCss();
  const start = css.indexOf("[data-readela-saved]::after {");
  assert.notEqual(start, -1);
  const rule = css.slice(start, css.indexOf("}", start));
  for (const part of ["position: absolute", "pointer-events: none", "clip-path: polygon(", `background: ${PAGE_MARK.mark}`, 'content: ""']) {
    assert.ok(rule.includes(part), part);
  }
  // Nothing else is said about a row: no colour, size or position of the row itself.
  const rows = css.split("\n").filter((line) => line.includes("data-readela-saved"));
  assert.ok(rows.every((line) => line.includes("[data-readela-saved]::after")), "only the bookmark is styled");
});

test("every rule is keyed on a Readela mark, so the sheet is inert on an unmarked page", () => {
  const css = buildCss();
  const bodies = css.replace(/@font-face \{[^}]*\}/g, "").replace(/@keyframes [^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const selectors = [...bodies.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((match) => match[2].trim()).filter(Boolean);
  assert.ok(selectors.length > 10);
  for (const selector of selectors) assert.match(selector, /data-readela-/, selector);
});

test("reading themes colour the reading surface and its text, and nothing outside it", () => {
  const css = buildCss();
  const themed = css
    .split("\n")
    .filter((line) => /--readela-(surface|text|muted|link|rule|quote|code|code-text|code-line|head|selection|site-surface|site-text|island)/.test(line) && line.includes("{"));
  assert.ok(themed.length > 12);
  for (const line of themed) {
    const selector = line.slice(0, line.indexOf("{"));
    // Either the declaration of the palette on the root, or a rule inside a reading surface.
    assert.ok(/^html\[data-readela-theme="\w+"\] $/.test(selector) || selector.includes("[data-readela-sheet"), selector);
  }
});

test("what a part of the text means keeps a token of its own, and a unit that stays the site's is never recoloured", () => {
  const css = buildCss();
  const rule = (needle) => css.split("\n").filter((line) => line.includes(needle));
  // Links, inline code, table lines and headers, quotation bars, secondary text,
  // list markers and highlighted text each have their rule.
  for (const [needle, token] of [
    [":is(a, a *)", "--readela-link"],
    [":is(code, kbd, samp):not([data-readela-island], [data-readela-island] *, pre, pre *, svg *):not([data-readela-mark])", "--readela-code"],
    [":is(code, kbd, samp, code *, kbd *, samp *)", "--readela-code-text"],
    ["box-shadow: inset 0 0 0 1px", "--readela-code-line"],
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
  // Borders are touched only on tables, quotations and inline code, so the
  // lines a formula is drawn with keep the text's colour.
  const borders = css.split("\n").filter((line) => line.includes("border-color") && line.includes("data-readela-top"));
  assert.deepEqual(
    borders.map((line) => line.match(/:is\(([^)]*)\):not\(/)?.[1]),
    ["code, kbd, samp", "table, thead, tbody, tfoot, tr, th, td", "blockquote"],
  );
  // A table wider than the text carries the surface with it, to its sides
  // only, and only its outermost wrapper paints. Nothing is clipped.
  assert.ok(css.includes('[data-readela-sheet=""] > [data-readela-sheet="inner"] { box-shadow: 0.625rem 0 0 var(--readela-surface), -0.625rem 0 0 var(--readela-surface) !important; border-radius: 0.25rem !important; }'));
  assert.ok(css.includes('[data-readela-sheet="inner"] [data-readela-sheet="inner"] { background-color: transparent !important; }'));
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
