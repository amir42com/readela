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
  FONT_CHOICES,
  SIZE_CHOICES,
  SPACING_CHOICES,
  DEFAULT_PREFERENCES,
  normalizePreferences,
  resetPreferences,
  resolveTypography,
} from "./preferences.js";
