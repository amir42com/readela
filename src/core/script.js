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

// A figure with its unit attached (2M, 103K, 4.5GB, 10x, 3D) is a number, not
// a word: one or two letters directly after digits. A figure alone in a card
// or a table cell then follows what is around it, like any other number.
const FIGURE = /(?<![\p{L}\p{M}])\p{Nd}[\p{Nd}.,٫٬]*\p{L}{1,2}(?![\p{L}\p{M}])/gu;

/**
 * Count the words of a text by writing direction, and note its shape: the
 * direction of its first and of its last word, and in how many separate
 * places right-to-left words stand.
 *
 * A word counts as right-to-left when it contains at least one right-to-left
 * letter, and as left-to-right when it contains letters of other scripts only.
 * Digits, punctuation, symbols, addresses and figures with a unit attached
 * are not counted.
 *
 * @param {string} text
 * @returns {{ rtl: number, ltr: number, first: "rtl" | "ltr" | null, last: "rtl" | "ltr" | null, places: number }}
 */
export function measureScripts(text) {
  const counts = { rtl: 0, ltr: 0, first: null, last: null, places: 0 };
  if (typeof text !== "string" || text.length === 0) return counts;

  for (const word of text.replace(ADDRESS, " ").replace(FIGURE, " ").match(WORD) ?? []) {
    const kind = RTL_LETTER.test(word) ? "rtl" : LETTER.test(word) ? "ltr" : null;
    if (kind === null) continue;
    counts[kind] += 1;
    if (kind === "rtl" && counts.last !== "rtl") counts.places += 1;
    counts.first ??= kind;
    counts.last = kind;
  }
  return counts;
}

/**
 * Add two measurements: the words of both. The sum has no shape.
 *
 * @param {{ rtl: number, ltr: number }} a
 * @param {{ rtl: number, ltr: number }} b
 * @returns {{ rtl: number, ltr: number }}
 */
export function addCounts(a, b) {
  return { rtl: a.rtl + b.rtl, ltr: a.ltr + b.ltr };
}
