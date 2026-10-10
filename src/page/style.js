// The complete Readela stylesheet, as text.
//
// It is static: every rule is keyed on a `data-readela-*` attribute, so the
// sheet does nothing until the reader marks elements and nothing again once
// the marks are removed. The build writes this text to `content.css`.

import {
  BUNDLED_FONTS,
  FONT_CHOICES,
  PAGE_MARK,
  SIZE_CHOICES,
  SPACING_CHOICES,
  THEMES,
  resolveTypography,
} from "../core/index.js";

/** Attribute names: with the custom properties below, the whole footprint Readela leaves in a page. */
export const MARK = Object.freeze({
  dir: "data-readela-dir",
  top: "data-readela-top",
  ltr: "data-readela-ltr",
  align: "data-readela-align",
  mirror: "data-readela-mirror",
  sheet: "data-readela-sheet",
  island: "data-readela-island",
  unit: "data-readela-unit",
  saved: "data-readela-saved",
  place: "data-readela-mark",
  flash: "data-readela-flash",
  font: "data-readela-font",
  size: "data-readela-size",
  spacing: "data-readela-spacing",
  theme: "data-readela-theme",
});

export const ELEMENT_MARKS = Object.freeze([
  MARK.dir,
  MARK.top,
  MARK.ltr,
  MARK.align,
  MARK.mirror,
  MARK.sheet,
  MARK.island,
  MARK.unit,
  MARK.place,
  MARK.flash,
]);
/** Marks on the root element, keyed by the preference each one carries. */
export const ROOT_MARKS = Object.freeze({
  font: MARK.font,
  size: MARK.size,
  spacing: MARK.spacing,
  theme: MARK.theme,
});

/** Custom properties set on a mirrored container; see `mirrorFor` in the reader. */
export const MIRROR_PROPERTIES = Object.freeze([
  "--readela-padding-start",
  "--readela-padding-end",
  "--readela-margin-start",
  "--readela-margin-end",
  "--readela-border-start",
  "--readela-border-end",
]);

/**
 * Custom properties set on the root element, as measured from the site, for
 * the parts of a response that keep the site's presentation: its own
 * background and text colour while a reading theme is on, and its own font
 * while Readela Sans is on.
 */
export const SITE_PROPERTIES = Object.freeze({
  surface: "--readela-site-surface",
  text: "--readela-site-text",
  font: "--readela-site-font",
});

/**
 * Custom property set on a part of a response that keeps the site's
 * presentation and whose own shape is rounded: the corner radii of the unit
 * inside it, so the site's background behind the unit has the unit's shape.
 */
export const ISLAND_RADIUS = "--readela-island-radius";

/** Paragraph-like elements: the blocks a reader reads and can save a place at. */
export const TEXT_BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, dt, dd, th, td, caption, summary, figcaption";

/** Code, keyboard input and mathematics keep their own order, font and direction. */
export const PROTECTED = "pre, code, kbd, samp, var, math, .katex, mjx-container";

const CONTAINERS = "ul, ol, table, blockquote";

// Direct children of a reading surface that are part of the text flow without
// being reading blocks; they follow the surface instead of becoming islands.
export const FLOWING = "hr, br, math, .katex, .katex-display, mjx-container";

function themeRules() {
  const themed = `html[${MARK.theme}]`;
  const sheet = `${themed} [${MARK.sheet}]`;
  const island = `[${MARK.island}]`;
  // Reading text: the reading blocks that sit directly on a surface.
  const prose = `${sheet} > [${MARK.top}]:not(pre, ${island})`;
  const within = `:is(${prose}, ${prose} *)`;
  // Inside reading text these keep the site's own colours: a code block is a
  // unit with its own background and syntax colours, and a drawing has its
  // own fills.
  const kept = `${island}, ${island} *, pre, pre *, svg *`;
  const unmarked = `:not([${MARK.place}])`;
  const rules = [];

  for (const [name, theme] of Object.entries(THEMES)) {
    rules.push(
      `html[${MARK.theme}="${name}"] {`,
      `  --readela-surface: ${theme.surface};`,
      `  --readela-text: ${theme.text};`,
      `  --readela-muted: ${theme.muted};`,
      `  --readela-link: ${theme.link};`,
      `  --readela-rule: ${theme.rule};`,
      `  --readela-quote: ${theme.quote};`,
      `  --readela-code: ${theme.code};`,
      `  --readela-code-text: ${theme.codeText};`,
      `  --readela-code-line: ${theme.codeLine};`,
      `  --readela-head: ${theme.head};`,
      `  --readela-selection: ${theme.selection};`,
      `  --readela-selection-text: ${theme.selectionText};`,
      `}`,
      // The saved place takes the theme's colours only on a themed surface.
      `html[${MARK.theme}="${name}"] [${MARK.sheet}] { --readela-mark: ${theme.mark}; --readela-mark-tint: ${theme.markTint}; }`,
    );
  }

  rules.push(
    // The reading surface: the root of a response's text. The spread shadow
    // gives it a margin of its own colour without moving anything.
    `${sheet} { background-color: var(--readela-surface) !important; color: var(--readela-text) !important; }`,
    `${sheet}:not([${MARK.sheet}="inner"]) { box-shadow: 0 0 0 0.625rem var(--readela-surface) !important; border-radius: 0.25rem !important; }`,
    // A wrapper that holds reading blocks (around a table) is part of the
    // surface at whatever width the site gives it. Where it is wider than the
    // text, it carries the surface with it: the same margin to its sides and
    // the same corners, so no strip or square corner shows beyond the text.
    // Only the outermost wrapper paints; nothing is clipped, and it scrolls
    // as the site made it.
    `${themed} [${MARK.sheet}=""] > [${MARK.sheet}="inner"] { box-shadow: 0.625rem 0 0 var(--readela-surface), -0.625rem 0 0 var(--readela-surface) !important; border-radius: 0.25rem !important; }`,
    `${themed} [${MARK.sheet}="inner"] [${MARK.sheet}="inner"] { background-color: transparent !important; }`,

    // Reading text takes the theme's colours whatever the site gave it, and
    // gives up backgrounds made for the site's own theme. What a part of the
    // text means stays visible: each kind has a token of its own.
    `:is(${prose}, ${prose} :not(${kept}, a, a *)) { color: var(--readela-text) !important; }`,
    `:is(${prose}, ${prose} :not(${kept}, code, kbd, samp, th, mark))${unmarked} { background-color: transparent !important; }`,
    `${prose} :is(a, a *):not(${kept}) { color: var(--readela-link) !important; }`,
    `${prose} a:not(${kept}) { text-decoration-line: underline !important; }`,
    // Inline code, keyboard and sample text: a colour, a ground and a line of
    // their own, so a name or a version stands out from the sentence at a
    // glance. The line is drawn inside the box, so nothing moves.
    `${prose} :is(code, kbd, samp):not(${kept})${unmarked} { background-color: var(--readela-code) !important; }`,
    `${prose} :is(code, kbd, samp, code *, kbd *, samp *):not(${kept}) { color: var(--readela-code-text) !important; }`,
    `${prose} :is(code, kbd, samp):not(${kept}) { border-color: transparent !important; box-shadow: inset 0 0 0 1px var(--readela-code-line) !important; }`,
    `${within}:is(table, thead, tbody, tfoot, tr, th, td):not(${kept}) { border-color: var(--readela-rule) !important; }`,
    `${within}:is(th):not(${kept})${unmarked} { background-color: var(--readela-head) !important; }`,
    `${within}:is(blockquote):not(${kept}) { border-color: var(--readela-quote) !important; }`,
    `${within}:is(small, del, s, caption, figcaption):not(${kept}) { color: var(--readela-muted) !important; }`,
    `${within}:is(li):not(${kept})::marker { color: var(--readela-muted) !important; }`,
    `${prose} mark:not(${kept}) { background-color: var(--readela-selection) !important; color: var(--readela-selection-text) !important; }`,
    `${sheet} > hr { color: var(--readela-rule) !important; border-color: var(--readela-rule) !important; background-color: var(--readela-rule) !important; }`,
    `${sheet} ::selection { background-color: var(--readela-selection) !important; color: var(--readela-selection-text) !important; }`,

    // Everything else in a response (a code block, a widget, an image) is a
    // unit that stays as the site made it. The reader notes on the unit what
    // it needs for that. Where its text takes its colour from around it, it
    // keeps the site's text colour. Unless it brings an opaque background of
    // its own, it sits on the site's own background, in the unit's own shape
    // where that is rounded, so it stays readable whichever theme the site
    // itself is in and no corner of another colour shows around it.
    `${sheet} [${MARK.island}~="text"] { color: var(${SITE_PROPERTIES.text}) !important; }`,
    `${sheet} [${MARK.island}~="surface"] { background-color: var(${SITE_PROPERTIES.surface}) !important; }`,
    `${sheet} [${MARK.island}~="round"] { border-radius: var(${ISLAND_RADIUS}) !important; }`,
  );
  return rules;
}

// A conversation that has a saved place, in the site's own lists: a small
// filled bookmark at the start of its row. The shape says it, not the colour
// alone. It is drawn from the link without taking part in the row's layout
// and takes no pointer input, so the row behaves as the site made it.
function rowRules() {
  const saved = `[${MARK.saved}]::after`;
  return [
    `${saved} {`,
    `  content: "" !important; position: absolute !important; display: block !important;`,
    `  inset-inline-start: 0 !important; inset-block-start: 50% !important;`,
    `  inline-size: 0.375rem !important; block-size: 0.6875rem !important; margin: -0.34375rem 0 0 !important;`,
    `  padding: 0 !important; border: 0 !important; border-radius: 1px !important; opacity: 1 !important;`,
    `  background: ${PAGE_MARK.mark} !important; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 68%, 0 100%) !important;`,
    `  transform: none !important; pointer-events: none !important;`,
    `}`,
    `@media (forced-colors: active) { ${saved} { forced-color-adjust: none !important; background: Highlight !important; } }`,
  ];
}

function markRules() {
  const place = `[${MARK.place}]`;
  const bar = `var(--readela-mark, ${PAGE_MARK.mark})`;
  const tint = `var(--readela-mark-tint, ${PAGE_MARK.markTint})`;
  return [
    // The saved place: a tinted block with a bar on its leading edge. Both
    // are drawn outside the text box, so nothing moves.
    `${place} { position: relative !important; background-color: ${tint} !important; box-shadow: 0 0 0 0.375rem ${tint} !important; border-radius: 0.125rem !important; }`,
    `${place}::before {`,
    `  content: "" !important; position: absolute !important; display: block !important;`,
    `  inset-block: -0.375rem !important; inset-inline: -0.875rem auto !important;`,
    `  inline-size: 0.3125rem !important; block-size: auto !important;`,
    `  margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0.1875rem !important;`,
    `  background: ${bar} !important; opacity: 1 !important; transform: none !important; pointer-events: none !important;`,
    `}`,
    // An approximate place has a broken bar.
    `[${MARK.place}="approximate"]::before { background: repeating-linear-gradient(to bottom, ${bar} 0 0.5rem, transparent 0.5rem 0.8125rem) !important; }`,

    // Shown briefly after Return so the eye finds the place.
    `[${MARK.flash}] { outline: 0.1875rem solid ${bar} !important; outline-offset: 0.5rem !important; animation: readela-flash 1.4s ease-out 1 !important; }`,
    `@keyframes readela-flash { from { outline-offset: 1.5rem; outline-color: transparent; } 35% { outline-color: ${bar}; } to { outline-offset: 0.5rem; } }`,
    `@media (prefers-reduced-motion: reduce) { [${MARK.flash}] { animation: none !important; } }`,
    `@media (forced-colors: active) { ${place} { outline: 2px solid Highlight !important; } ${place}::before { forced-color-adjust: none !important; background: Highlight !important; } }`,
  ];
}

/**
 * @param {object} [options]
 * @param {(file: string) => string} [options.fontUrl] gives the address of a
 *   packaged font as the stylesheet must name it; it differs between
 *   browsers, see the build.
 */
export function buildCss({ fontUrl = (file) => file } = {}) {
  const rules = [];
  // The packaged fonts, each for the characters of its own script only. A
  // file is fetched from the extension itself, and only when such text is
  // shown in Readela Sans.
  for (const font of BUNDLED_FONTS) {
    rules.push(
      `@font-face {`,
      `  font-family: "${font.family}";`,
      `  src: url("${fontUrl(font.file)}") format("woff2");`,
      `  font-weight: ${font.weight};`,
      `  font-style: ${font.style};`,
      `  font-display: swap;`,
      `  unicode-range: ${font.unicodeRange};`,
      `}`,
    );
  }

  rules.push(
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
  );

  // Readela Sans is for reading text. Code, keyboard input and mathematics
  // keep their fonts, and so does a unit the site presents as a whole.
  const own = `${PROTECTED}, svg, [${MARK.unit}]`;
  for (const font of FONT_CHOICES) {
    const { fontFamily } = resolveTypography({ font });
    if (fontFamily === null) continue;
    const scope = `html[${MARK.font}="${font}"] [${MARK.top}]:not(pre)`;
    rules.push(
      `${scope}:not([${MARK.unit}]), ${scope}:not([${MARK.unit}]) :not(:is(${own}), :is(${own}) *) { font-family: ${fontFamily} !important; }`,
      // A unit inside reading text would take the reading font from the text
      // around it; it is given the site's own font back.
      `html[${MARK.font}="${font}"] [${MARK.top}] [${MARK.unit}] { font-family: var(${SITE_PROPERTIES.font}) !important; }`,
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
    const scope = `html[${MARK.spacing}="${spacing}"] [${MARK.top}]`;
    rules.push(
      `${scope}:not(${CONTAINERS}, pre), ${scope}:not(pre) :is(${TEXT_BLOCKS}) { line-height: ${lineHeight} !important; }`,
    );
  }

  rules.push(...themeRules(), ...markRules(), ...rowRules());
  return `${rules.join("\n")}\n`;
}
