// The reading mark: where a reader stopped in one conversation.
//
// Portable: plain data in, plain data out. A mark never holds readable text or
// an address. It holds one-way fingerprints of the marked block and of the
// blocks on either side, and the block's position among the reading blocks.

/** Storage key under which the reading marks are kept. */
export const MARKS_KEY = "readela.marks";
export const MARKS_VERSION = 1;

/** Marks kept at most; the oldest is dropped when another conversation is marked. */
export const MARK_LIMIT = 100;

const FINGERPRINT = /^[0-9a-f]{16}$/;

// A 64-bit non-cryptographic hash, as 16 hexadecimal digits. It cannot be
// turned back into the text it was computed from.
function hash(text) {
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    high = Math.imul(high ^ code, 2654435761);
    low = Math.imul(low ^ code, 1597334677);
  }
  high = Math.imul(high ^ (high >>> 16), 2246822507) ^ Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507) ^ Math.imul(high ^ (high >>> 13), 3266489909);
  const part = (value) => (value >>> 0).toString(16).padStart(8, "0");
  return part(low) + part(high);
}

/**
 * Fingerprint of a block's text, or null when the block has no text. White
 * space is collapsed first, so re-rendering the same words gives the same
 * fingerprint.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function fingerprint(text) {
  const normalized = typeof text === "string" ? text.replace(/\s+/gu, " ").trim() : "";
  return normalized === "" ? null : hash(normalized);
}

/**
 * Identity of a conversation: a fingerprint of its host and path.
 *
 * @param {string} host
 * @param {string} path
 */
export function conversationKey(host, path) {
  return hash(`${host}\n${path}`);
}

/**
 * Describe the block at `index` among the fingerprints of a conversation's
 * reading blocks.
 *
 * @param {string[]} fingerprints
 * @param {number} index
 * @returns {{ f: string, i: number, b: string | null, a: string | null }}
 */
export function createMark(fingerprints, index) {
  return {
    f: fingerprints[index],
    i: index,
    b: fingerprints[index - 1] ?? null,
    a: fingerprints[index + 1] ?? null,
  };
}

/**
 * Find a mark among the fingerprints of the blocks now on the page.
 *
 * - `exact`: the marked block itself is there. Among identical blocks the one
 *   whose neighbours also agree wins, then the one nearest the old position.
 * - `approximate`: the marked block's text is gone, but the blocks that stood
 *   on either side of it are both there with exactly one block between them
 *   (or, for a mark at an end of the conversation, the one neighbour is there
 *   at that end). The block now in that place is returned.
 * - `null`: nothing trustworthy. A position alone is never used.
 *
 * @param {{ f: string, i: number, b: string | null, a: string | null }} mark
 * @param {(string | null)[]} fingerprints
 * @returns {{ index: number, quality: "exact" | "approximate" } | null}
 */
export function locateMark(mark, fingerprints) {
  const last = fingerprints.length - 1;
  const before = (index) => (mark.b === null ? index === 0 : fingerprints[index - 1] === mark.b);
  const after = (index) => (mark.a === null ? index === last : fingerprints[index + 1] === mark.a);
  const nearest = (candidates) =>
    candidates.reduce((best, index) => (Math.abs(index - mark.i) < Math.abs(best - mark.i) ? index : best));
  const positions = fingerprints.map((_, index) => index);

  const same = positions.filter((index) => fingerprints[index] === mark.f);
  if (same.length > 0) {
    const agreeing = same.filter((index) => before(index) && after(index));
    return { index: nearest(agreeing.length > 0 ? agreeing : same), quality: "exact" };
  }

  if (mark.b === null && mark.a === null) return null;
  const between = positions.filter((index) => before(index) && after(index));
  return between.length > 0 ? { index: nearest(between), quality: "approximate" } : null;
}

const isFingerprint = (value) => typeof value === "string" && FINGERPRINT.test(value);
const isNeighbour = (value) => value === null || isFingerprint(value);

/**
 * Return a valid marks object for any input; malformed entries are dropped,
 * and so is every field that is not part of a mark.
 *
 * @param {unknown} raw
 * @returns {{ version: number, items: { k: string, f: string, i: number, b: string | null, a: string | null }[] }}
 */
export function normalizeMarks(raw) {
  const items = raw !== null && typeof raw === "object" && Array.isArray(raw.items) ? raw.items : [];
  const seen = new Set();
  const valid = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const { k, f, i, b, a } = item;
    if (!isFingerprint(k) || !isFingerprint(f) || !Number.isInteger(i) || i < 0) continue;
    if (!isNeighbour(b) || !isNeighbour(a) || seen.has(k)) continue;
    seen.add(k);
    valid.push({ k, f, i, b, a });
  }
  return { version: MARKS_VERSION, items: valid.slice(-MARK_LIMIT) };
}

/** The mark saved for a conversation, or null. */
export function findMark(marks, key) {
  return normalizeMarks(marks).items.find((item) => item.k === key) ?? null;
}

/** Save `mark` as the one mark of the conversation `key`, as the newest entry. */
export function saveMark(marks, key, mark) {
  const others = normalizeMarks(marks).items.filter((item) => item.k !== key);
  return normalizeMarks({ items: [...others, { k: key, ...mark }] });
}

/** Remove the mark of the conversation `key`. */
export function removeMark(marks, key) {
  return normalizeMarks({ items: normalizeMarks(marks).items.filter((item) => item.k !== key) });
}
