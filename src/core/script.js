// Script measurement for direction decisions.
//
// Portable: plain strings in, plain data out. No DOM, browser-extension API or
// UI dependency, so other clients can reuse it or reimplement the same contract.

// A word is a run of letters and combining marks. The zero-width non-joiner and
// joiner stay inside a word because Persian and Arabic orthography uses them
// between the parts of one word.
const WORD = /[\p{L}\p{M}‌‍]+/gu;

// Letters of right-to-left scripts. Persian and Arabic share the Arabic script.
// Only Persian, Arabic and Hebrew text has been checked; the other scripts are
// listed so their letters are not counted as left-to-right.
const RTL_LETTER =
  /(?=\p{L})[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}]/u;

const LETTER = /\p{L}/u;

// Web addresses and e-mail addresses are Latin by syntax, not by language, so
// they would otherwise make a right-to-left sentence look left-to-right.
const ADDRESS = /(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/giu;

/**
 * Count the words of a text by writing direction.
 *
 * A word counts as right-to-left when it contains at least one right-to-left
 * letter, and as left-to-right when it contains letters of other scripts only.
 * Digits, punctuation, symbols and addresses are not counted.
 *
 * @param {string} text
 * @returns {{ rtl: number, ltr: number }}
 */
export function measureScripts(text) {
  const counts = { rtl: 0, ltr: 0 };
  if (typeof text !== "string" || text.length === 0) return counts;

  for (const word of text.replace(ADDRESS, " ").match(WORD) ?? []) {
    if (RTL_LETTER.test(word)) counts.rtl += 1;
    else if (LETTER.test(word)) counts.ltr += 1;
  }
  return counts;
}

/**
 * Add two measurements.
 *
 * @param {{ rtl: number, ltr: number }} a
 * @param {{ rtl: number, ltr: number }} b
 * @returns {{ rtl: number, ltr: number }}
 */
export function addCounts(a, b) {
  return { rtl: a.rtl + b.rtl, ltr: a.ltr + b.ltr };
}
