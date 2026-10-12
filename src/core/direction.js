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
 * Share of right-to-left words from which a sentence that begins with one
 * reads right-to-left, below the threshold above: a heading of one Persian
 * word and two Latin terms does; an English sentence about one Persian word,
 * which happens to stand first, does not.
 */
export const RTL_LEAD_SHARE = 0.2;

// Below the threshold the words alone would say left-to-right. A sentence in
// a right-to-left language that is mostly terms in Latin letters ("CTA و View
// Projects در Hero Section Pass شد") is still that language's sentence, and
// its shape shows it: its own words stand first, or last and in between. A
// left-to-right sentence that quotes right-to-left words has them in one
// place, and rarely at its beginning or its end. The text around the block
// settles the cases the shape leaves open.
function shapeSays(counts, context) {
  const { first, last, places } = counts;
  if (first === DIRECTION.RTL) {
    const share = counts.rtl / (counts.rtl + counts.ltr);
    const more = share >= RTL_LEAD_SHARE || last === DIRECTION.RTL || places >= 2;
    return more && !(context === DIRECTION.LTR && places < 2);
  }
  return last === DIRECTION.RTL && places >= 2 && context !== DIRECTION.LTR;
}

/**
 * Decide the base direction for measured text.
 *
 * @param {{ rtl: number, ltr: number, first?: string | null, last?: string | null, places?: number }} counts
 *   a measurement; one without a shape is decided by its share of words alone
 * @param {object} [around]
 * @param {"rtl" | "ltr" | null} [around.context] direction of the text around the block
 * @param {object[] | null} [around.parts] measurements of the items of a list.
 *   A list is one unit, and where its words leave it in doubt its items
 *   decide: each is a sentence of its own.
 * @returns {"rtl" | "ltr" | "neutral"} `neutral` when the text has no words
 *   (numbers, punctuation or symbols only); the caller then uses its context.
 */
export function decideDirection(counts, { context = null, parts = null } = {}) {
  const total = counts.rtl + counts.ltr;
  if (total === 0) return DIRECTION.NEUTRAL;
  if (counts.rtl / total >= RTL_SHARE_THRESHOLD) return DIRECTION.RTL;
  if (counts.rtl === 0) return DIRECTION.LTR;
  if (parts !== null) {
    const decided = parts.map((part) => decideDirection(part, { context })).filter((own) => own !== DIRECTION.NEUTRAL);
    const rtl = decided.filter((own) => own === DIRECTION.RTL).length;
    return decided.length > 0 && rtl / decided.length >= RTL_SHARE_THRESHOLD ? DIRECTION.RTL : DIRECTION.LTR;
  }
  return shapeSays(counts, context) ? DIRECTION.RTL : DIRECTION.LTR;
}

/**
 * Resolve the direction to present for a block.
 *
 * @param {object} input
 * @param {{ rtl: number, ltr: number }} input.counts measurement of the block's own text
 * @param {"page" | "auto" | "rtl" | "ltr"} input.mode the reader's direction
 *   preference; `page` leaves every block to the page
 * @param {"rtl" | "ltr" | null} [input.context] direction of the enclosing content,
 *   used when the block itself is neutral or in doubt
 * @param {object[] | null} [input.parts] measurements of a list's items
 * @returns {"rtl" | "ltr" | null} `null` leaves the page's own presentation alone
 */
export function resolveDirection({ counts, mode, context = null, parts = null }) {
  if (mode === "page") return null;
  if (mode === DIRECTION.RTL || mode === DIRECTION.LTR) return mode;
  const own = decideDirection(counts, { context, parts });
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
