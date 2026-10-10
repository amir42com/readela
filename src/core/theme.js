// Reading themes: the colours Readela gives a reading surface.
//
// Portable: plain data and arithmetic. The values were chosen by the contrast
// calculation below and are held to it by the tests: primary reading text is
// at least 10:1 against every surface it can sit on.

/**
 * surface        the reading surface behind a response
 * text           primary reading text
 * link           links in the text (also underlined, never colour alone)
 * rule           table lines, quotation bars and separators
 * code           background of inline code
 * head           background of table header cells
 * selection      background of selected text; selectionText is its text
 * mark           the bar of the reading mark; markTint is the marked block's background
 */
export const THEMES = Object.freeze({
  paper: Object.freeze({
    surface: "#F5EFE2",
    text: "#24201B",
    link: "#1A456F",
    rule: "#B9AE98",
    code: "#EAE2D0",
    head: "#ECE5D5",
    selection: "#F0D49A",
    selectionText: "#24201B",
    mark: "#B24A14",
    markTint: "#F7DFC4",
  }),
  night: Object.freeze({
    surface: "#24211E",
    text: "#ECE5D8",
    link: "#E8BC7C",
    rule: "#5E574D",
    code: "#322E29",
    head: "#2E2A26",
    selection: "#54401E",
    selectionText: "#F6EFE2",
    mark: "#F2914A",
    markTint: "#392C20",
  }),
});

/**
 * The reading mark where Readela controls no surface. The bar is a mid-tone
 * that stays at least 3:1 against light and dark pages alike; the tint is
 * translucent so the text of the page keeps its contrast.
 */
export const PAGE_MARK = Object.freeze({ mark: "#D9642B", markTint: "rgba(217, 100, 43, 0.16)" });

/** Relative luminance of a `#RRGGBB` colour (WCAG 2). */
export function relativeLuminance(colour) {
  const channel = (offset) => {
    const value = parseInt(colour.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contrast ratio of two `#RRGGBB` colours (WCAG 2), from 1 to 21. */
export function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
