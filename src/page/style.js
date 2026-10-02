// The complete Readela stylesheet, as text.
//
// It is static: every rule is keyed on a `data-readela-*` attribute, so the
// sheet does nothing until the reader marks elements and nothing again once
// the marks are removed. The build writes this text to `content.css`.

import { FONT_CHOICES, SIZE_CHOICES, SPACING_CHOICES, resolveTypography } from "../core/index.js";

/** Attribute and custom-property names: the whole footprint Readela leaves in a page. */
export const MARK = Object.freeze({
  dir: "data-readela-dir",
  top: "data-readela-top",
  ltr: "data-readela-ltr",
  align: "data-readela-align",
  mirror: "data-readela-mirror",
  font: "data-readela-font",
  size: "data-readela-size",
  spacing: "data-readela-spacing",
});

export const ELEMENT_MARKS = Object.freeze([MARK.dir, MARK.top, MARK.ltr, MARK.align, MARK.mirror]);
/** Marks on the root element, keyed by the preference each one carries. */
export const ROOT_MARKS = Object.freeze({ font: MARK.font, size: MARK.size, spacing: MARK.spacing });

/** Custom properties set on a mirrored container; see `mirrorDeclarations`. */
export const MIRROR_PROPERTIES = Object.freeze([
  "--readela-padding-start",
  "--readela-padding-end",
  "--readela-margin-start",
  "--readela-margin-end",
  "--readela-border-start",
  "--readela-border-end",
]);

/** Code, keyboard input and mathematics keep their own order, font and direction. */
export const PROTECTED = "pre, code, kbd, samp, var, math, .katex, mjx-container";

const CONTAINERS = "ul, ol, table, blockquote";

export function buildCss() {
  const rules = [
    // Base direction per marked block. `isolate` is the browser default for
    // block elements; stating it defeats first-strong (`plaintext`) handling
    // that would otherwise ignore the direction.
    `[${MARK.dir}="rtl"] { direction: rtl !important; unicode-bidi: isolate !important; }`,
    `[${MARK.dir}="ltr"] { direction: ltr !important; unicode-bidi: isolate !important; }`,

    // Only set where the page pinned the text to a physical side.
    `[${MARK.align}] { text-align: start !important; }`,

    // Protected regions and web addresses stay left-to-right as one unit.
    `[${MARK.dir}] :is(${PROTECTED}), [${MARK.ltr}] { direction: ltr !important; unicode-bidi: isolate !important; }`,

    // Only set where the page indents a list or quotation on a physical side.
    `[${MARK.mirror}] {`,
    `  padding-inline-start: var(--readela-padding-start) !important;`,
    `  padding-inline-end: var(--readela-padding-end) !important;`,
    `  margin-inline-start: var(--readela-margin-start) !important;`,
    `  margin-inline-end: var(--readela-margin-end) !important;`,
    `  border-inline-start: var(--readela-border-start) !important;`,
    `  border-inline-end: var(--readela-border-end) !important;`,
    `}`,
  ];

  for (const font of FONT_CHOICES) {
    const { fontFamily } = resolveTypography({ font });
    if (fontFamily === null) continue;
    const scope = `html[${MARK.font}="${font}"] [${MARK.top}]:not(pre)`;
    rules.push(
      `${scope}, ${scope} :not(:is(${PROTECTED}, svg), :is(${PROTECTED}, svg) *) { font-family: ${fontFamily} !important; }`,
    );
  }

  for (const size of SIZE_CHOICES) {
    const { scale } = resolveTypography({ size });
    if (scale === null) continue;
    rules.push(`html[${MARK.size}="${size}"] [${MARK.top}] { zoom: ${scale}; }`);
  }

  for (const spacing of SPACING_CHOICES) {
    const { lineHeight } = resolveTypography({ spacing });
    if (lineHeight === null) continue;
    rules.push(
      `html[${MARK.spacing}="${spacing}"] [${MARK.dir}]:not(${CONTAINERS}) { line-height: ${lineHeight} !important; }`,
    );
  }

  return `${rules.join("\n")}\n`;
}
