// Direction decisions for a block of text.
//
// Portable: plain data in, plain data out.

import { measureScripts } from "./script.js";

export const DIRECTION = Object.freeze({ RTL: "rtl", LTR: "ltr", NEUTRAL: "neutral" });

/**
 * Share of right-to-left words at or above which a block reads right-to-left.
 *
 * The first strong character is deliberately not used: a right-to-left
 * sentence often starts with a left-to-right name or term. The threshold sits
 * below one half because such sentences also tend to carry several
 * left-to-right terms, while a left-to-right sentence that merely quotes a few
 * right-to-left words stays well under it.
 */
export const RTL_SHARE_THRESHOLD = 0.4;

/**
 * Decide the base direction for measured text.
 *
 * @param {{ rtl: number, ltr: number }} counts
 * @returns {"rtl" | "ltr" | "neutral"} `neutral` when the text has no words
 *   (numbers, punctuation or symbols only); the caller then uses its context.
 */
export function decideDirection(counts) {
  const total = counts.rtl + counts.ltr;
  if (total === 0) return DIRECTION.NEUTRAL;
  return counts.rtl / total >= RTL_SHARE_THRESHOLD ? DIRECTION.RTL : DIRECTION.LTR;
}

/**
 * Resolve the direction to present for a block.
 *
 * @param {object} input
 * @param {{ rtl: number, ltr: number }} input.counts measurement of the block's own text
 * @param {"auto" | "rtl" | "ltr"} input.mode the reader's direction preference
 * @param {"rtl" | "ltr" | null} [input.context] direction of the enclosing content,
 *   used when the block itself is neutral
 * @returns {"rtl" | "ltr" | null} `null` leaves the page's own presentation alone
 */
export function resolveDirection({ counts, mode, context = null }) {
  if (mode === DIRECTION.RTL || mode === DIRECTION.LTR) return mode;
  const own = decideDirection(counts);
  if (own !== DIRECTION.NEUTRAL) return own;
  return context;
}

/**
 * Convenience for callers that hold a string rather than a measurement.
 *
 * @param {string} text
 * @returns {"rtl" | "ltr" | "neutral"}
 */
export function directionOfText(text) {
  return decideDirection(measureScripts(text));
}

/**
 * Whether a text is, as a whole, a web address. Such text keeps left-to-right
 * order even inside a right-to-left sentence.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isAddressText(text) {
  return typeof text === "string" && /^\s*(?:https?:\/\/|www\.)\S+\s*$/iu.test(text);
}
