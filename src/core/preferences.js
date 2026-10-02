// Reading preferences: the one settings contract shared by every surface.
//
// Portable: plain data only. Storage, messaging and UI live elsewhere.

export const PREFERENCES_VERSION = 1;

/** Storage key under which the preferences object is kept. */
export const PREFERENCES_KEY = "readela.preferences";

export const DIRECTION_MODES = Object.freeze(["auto", "rtl", "ltr"]);
export const FONT_CHOICES = Object.freeze(["page", "sans", "serif"]);
export const SIZE_CHOICES = Object.freeze(["page", "110", "125", "140"]);
export const SPACING_CHOICES = Object.freeze(["page", "1.6", "1.9", "2.2"]);

/**
 * Defaults: Readela is on, direction is decided per paragraph, and typography
 * is left exactly as the page presents it.
 */
export const DEFAULT_PREFERENCES = Object.freeze({
  version: PREFERENCES_VERSION,
  enabled: true,
  direction: "auto",
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
 * @param {unknown} raw
 * @returns {{ version: number, enabled: boolean, direction: string, font: string, size: string, spacing: string }}
 */
export function normalizePreferences(raw) {
  const source = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    version: PREFERENCES_VERSION,
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_PREFERENCES.enabled,
    direction: pick(source.direction, DIRECTION_MODES, DEFAULT_PREFERENCES.direction),
    font: pick(source.font, FONT_CHOICES, DEFAULT_PREFERENCES.font),
    size: pick(source.size, SIZE_CHOICES, DEFAULT_PREFERENCES.size),
    spacing: pick(source.spacing, SPACING_CHOICES, DEFAULT_PREFERENCES.spacing),
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

// Font stacks name fonts already installed on the reader's device. Nothing is
// bundled or downloaded; a stack falls through to the next family when one is
// missing. Families with spaces are quoted for direct use in CSS.
const FONT_STACKS = Object.freeze({
  sans: '"Vazirmatn", "Segoe UI", "Noto Sans Arabic", "Noto Sans Hebrew", Tahoma, "Geeza Pro", "Arial Hebrew", Arial, sans-serif',
  serif: '"Noto Naskh Arabic", "Sakkal Majalla", "Traditional Arabic", "Times New Roman", "Geeza Pro", "David", serif',
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
