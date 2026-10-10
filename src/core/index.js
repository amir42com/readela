// Readela core: portable reading rules with no DOM, browser-extension API or
// UI dependency.

export { measureScripts, addCounts } from "./script.js";
export {
  DIRECTION,
  RTL_SHARE_THRESHOLD,
  decideDirection,
  resolveDirection,
  directionOfText,
  isAddressText,
} from "./direction.js";
export {
  PREFERENCES_VERSION,
  PREFERENCES_KEY,
  DIRECTION_MODES,
  THEME_CHOICES,
  FONT_CHOICES,
  SIZE_CHOICES,
  SPACING_CHOICES,
  DEFAULT_PREFERENCES,
  BUNDLED_FONTS,
  FONT_LICENCES,
  normalizePreferences,
  resetPreferences,
  changesPage,
  resolveTypography,
} from "./preferences.js";
export { THEMES, PAGE_MARK, relativeLuminance, contrastRatio, colourAlpha } from "./theme.js";
export {
  MARKS_KEY,
  MARKS_VERSION,
  MARK_LIMIT,
  BLOCK_KINDS,
  POSITION_STEPS,
  fingerprint,
  conversationId,
  conversationKey,
  messageKey,
  rowFingerprint,
  blockKind,
  createPlace,
  locatePlace,
  normalizeMarks,
  findMark,
  indexMarks,
  canSave,
  saveMark,
  removeMark,
  samePlace,
} from "./marker.js";
