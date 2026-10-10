// Reading preferences: the one settings contract shared by every surface.
//
// Portable: plain data only. Storage, messaging and UI live elsewhere.

export const PREFERENCES_VERSION = 2;

/** Storage key under which the preferences object is kept. */
export const PREFERENCES_KEY = "readela.preferences";

// "page" is the unchanged state of every reading aspect: Readela leaves that
// aspect exactly as the site presents it. The popup calls it "Original".
export const DIRECTION_MODES = Object.freeze(["page", "auto", "rtl", "ltr"]);
export const THEME_CHOICES = Object.freeze(["page", "paper", "night"]);
export const FONT_CHOICES = Object.freeze(["page", "sans"]);
export const SIZE_CHOICES = Object.freeze(["page", "110", "125", "140"]);
export const SPACING_CHOICES = Object.freeze(["page", "1.5", "1.75", "2.0"]);

// Line spacing as earlier builds of this version stored it, and what each
// value is read as now.
const EARLIER_SPACING = Object.freeze({ "1.6": "1.5", "1.9": "1.75", "2.2": "2.0" });

/**
 * Defaults: Readela is on, direction is decided per paragraph, and colours and
 * typography are left exactly as the page presents them.
 */
export const DEFAULT_PREFERENCES = Object.freeze({
  version: PREFERENCES_VERSION,
  enabled: true,
  direction: "auto",
  theme: "page",
  font: "page",
  size: "page",
  spacing: "page",
});

const pick = (value, choices, fallback) => (choices.includes(value) ? value : fallback);

/**
 * Return valid preferences for any input. Unknown, missing or malformed fields
 * fall back to their defaults, so stored data from another version can never
 * put a surface into an undefined state.
 *
 * This is also the migration from version 1: its fields are read one by one,
 * so every choice that still exists is kept, the removed serif font falls back
 * to the page's own font, and the new theme starts unchanged.
 *
 * @param {unknown} raw
 * @returns {{ version: number, enabled: boolean, direction: string, theme: string, font: string, size: string, spacing: string }}
 */
export function normalizePreferences(raw) {
  const source = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    version: PREFERENCES_VERSION,
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_PREFERENCES.enabled,
    direction: pick(source.direction, DIRECTION_MODES, DEFAULT_PREFERENCES.direction),
    theme: pick(source.theme, THEME_CHOICES, DEFAULT_PREFERENCES.theme),
    font: pick(source.font, FONT_CHOICES, DEFAULT_PREFERENCES.font),
    size: pick(source.size, SIZE_CHOICES, DEFAULT_PREFERENCES.size),
    spacing: pick(EARLIER_SPACING[source.spacing] ?? source.spacing, SPACING_CHOICES, DEFAULT_PREFERENCES.spacing),
  };
}

/**
 * Reset every reading choice to its default while keeping the on/off state.
 *
 * @param {{ enabled: boolean }} current
 */
export function resetPreferences(current) {
  return { ...DEFAULT_PREFERENCES, enabled: normalizePreferences(current).enabled };
}

/**
 * Whether any reading aspect asks for a change to the page. When none does,
 * the page needs no reading and no marks.
 *
 * @param {ReturnType<typeof normalizePreferences>} preferences
 */
export function changesPage(preferences) {
  const { direction, theme, font, size, spacing } = normalizePreferences(preferences);
  return [direction, theme, font, size, spacing].some((choice) => choice !== "page");
}

// Latin and Latin Extended, with the punctuation, currency signs and few
// symbols that go with them.
const LATIN =
  "U+0000-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1EFF, U+2000-206F, U+20A0-20C0, U+2113, U+2122, U+2190-2193, U+2212, U+2215, U+2C60-2C7F, U+A720-A7FF, U+FEFF, U+FFFD";

// Arabic script: Arabic, Persian and the other languages written in it.
const ARABIC =
  "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC";

/**
 * The fonts packaged with the extension: what Readela Sans is made of. Each
 * face is declared for the characters of its own script only, so a script is
 * never shown in the other's font, text in neither script falls through to
 * the device's fonts, and reading never depends on a font installed on the
 * device.
 *
 * - Latin: Inter, upright and italic, every weight.
 * - Arabic script: Vazirmatn, every weight. It has no italic of its own.
 */
export const BUNDLED_FONTS = Object.freeze([
  Object.freeze({
    family: "Readela Sans Arabic",
    file: "fonts/Vazirmatn-NL-wght.woff2",
    style: "normal",
    weight: "100 900",
    unicodeRange: ARABIC,
  }),
  Object.freeze({
    family: "Readela Sans Latin",
    file: "fonts/InterVariable.woff2",
    style: "normal",
    weight: "100 900",
    unicodeRange: LATIN,
  }),
  Object.freeze({
    family: "Readela Sans Latin",
    file: "fonts/InterVariable-Italic.woff2",
    style: "italic",
    weight: "100 900",
    unicodeRange: LATIN,
  }),
]);

/** The licence of each packaged font, shipped beside the fonts. */
export const FONT_LICENCES = Object.freeze(["fonts/OFL.txt", "fonts/Inter-LICENSE.txt"]);

// After the packaged faces the stack names system fonts only. Families with
// spaces are quoted for direct use in CSS.
const FONT_STACKS = Object.freeze({
  sans: `${[...new Set(BUNDLED_FONTS.map((font) => `"${font.family}"`))].join(", ")}, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif`,
});

/**
 * Resolve preferences into presentation values.
 *
 * @param {ReturnType<typeof normalizePreferences>} preferences
 * @returns {{ fontFamily: string | null, scale: number | null, lineHeight: number | null }}
 *   `null` means "leave the page's own value".
 */
export function resolveTypography(preferences) {
  const { font, size, spacing } = normalizePreferences(preferences);
  return {
    fontFamily: font === "page" ? null : FONT_STACKS[font],
    scale: size === "page" ? null : Number(size) / 100,
    lineHeight: spacing === "page" ? null : Number(spacing),
  };
}
