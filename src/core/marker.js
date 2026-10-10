// The saved place: where a reader stopped in one conversation.
//
// Portable: plain data in, plain data out. A saved place never holds readable
// text or an address. It holds local matching metadata: one-way fingerprints
// of the conversation, of the response the place is in, of the saved block and
// of the blocks beside it, plus a few small numbers. That is enough to find
// the place again on the same device; it is neither anonymisation nor
// encryption, and it is described as neither.
//
// A place is trusted only inside the response it was saved in. Where the site
// identifies that response, identity comes from the site's identifier; where
// it does not, the whole response has to be unchanged. Text alone never
// decides between identical paragraphs, and a position is only ever a hint
// for where to look.

/** Storage key under which the saved places are kept. */
export const MARKS_KEY = "readela.marks";
export const MARKS_VERSION = 2;

/**
 * Conversations that can have a saved place at one time. The bound keeps the
 * stored object small; it is far above ordinary use. At the bound a place for
 * a further conversation is refused. No place is ever dropped to make room.
 */
export const MARK_LIMIT = 1000;

/** Kinds of readable block. */
export const BLOCK_KINDS = Object.freeze(["p", "li", "h", "c", "o"]);

/** Finest step of the coarse position hint: thousandths of the conversation's length. */
export const POSITION_STEPS = 1000;

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
 * The identifier of the conversation an address path shows, or null when the
 * path shows no conversation. The identifier is the part every route to the
 * same conversation shares, so a conversation opened directly and the same
 * conversation opened inside a project agree.
 *
 * @param {RegExp[]} patterns the site's conversation routes, each capturing the identifier
 * @param {string} path the address path
 * @returns {string | null}
 */
export function conversationId(patterns, path) {
  for (const [index, pattern] of patterns.entries()) {
    const found = typeof path === "string" ? path.match(pattern) : null;
    if (found?.[1]) return `${index}:${found[1].toLowerCase()}`;
  }
  return null;
}

/**
 * Identity of a conversation as it is stored: a fingerprint of the site and of
 * the conversation's identifier.
 *
 * @param {string} site the site adapter's id
 * @param {string} id from `conversationId`
 */
export function conversationKey(site, id) {
  return hash(`${site}\n${id}`);
}

/**
 * Fingerprint of the identifier a site gives one response, or null when it
 * gives none.
 *
 * @param {string | null | undefined} identifier
 */
export function messageKey(identifier) {
  return typeof identifier === "string" && identifier.trim() !== "" ? hash(`message\n${identifier.trim()}`) : null;
}

/** The kind of a readable block, from its element name. */
export function blockKind(name) {
  const tag = String(name).toLowerCase();
  if (tag === "p" || tag === "li") return tag;
  if (/^h[1-6]$/.test(tag)) return "h";
  return ["th", "td", "caption", "dt", "dd"].includes(tag) ? "c" : "o";
}

// Fingerprint of a whole response: of its blocks' fingerprints, in order.
const signatureOf = (blocks) => hash(`blocks\n${blocks.map((block) => block.f).join(" ")}`);

const before = (blocks, index) => (index > 0 ? blocks[index - 1].f : null);
const after = (blocks, index) => (index < blocks.length - 1 ? blocks[index + 1].f : null);

/**
 * Describe the block at `index` of one response.
 *
 * @param {{ key: string | null, ordinal: number | null, blocks: { f: string, t: string }[] }} message
 *   the response: its key (from `messageKey`), its row number in the
 *   conversation where the site numbers rows, and its readable blocks
 * @param {number} index
 * @param {number} position where the block is along the conversation, 0 to 1
 */
export function createPlace(message, index, position) {
  const { blocks } = message;
  return {
    m: message.key,
    // Without the site's identifier the response is recognised by being unchanged.
    s: message.key === null ? signatureOf(blocks) : null,
    t: blocks[index].t,
    f: blocks[index].f,
    i: index,
    b: before(blocks, index),
    a: after(blocks, index),
    n: Number.isInteger(message.ordinal) ? message.ordinal : null,
    p: Math.round(Math.min(1, Math.max(0, Number(position) || 0)) * POSITION_STEPS),
  };
}

/**
 * Find a saved place among the responses now on the page.
 *
 * - `exact`: the saved block is there, in the response it was saved in, and
 *   it is the only block that can be it. Where the response has several
 *   blocks with the same text, the one whose two neighbours also agree is
 *   taken, and only when exactly one does.
 * - `approximate`: the response is identified by the site, the saved block's
 *   text is gone, and exactly one block stands between the two unchanged
 *   neighbours it was saved with.
 * - `absent`: the response is not on the page (not loaded, or gone).
 * - `ambiguous`: identical candidates that cannot be told apart.
 * - `changed`: the response is there but the place in it is not.
 *
 * Only `exact` and `approximate` name a block. A position alone is never used.
 *
 * @param {ReturnType<typeof createPlace>} place
 * @param {{ key: string | null, ordinal: number | null, blocks: { f: string, t: string }[] }[]} messages
 *   `blocks` is read only for a response that can hold the place
 * @returns {{ status: "exact" | "approximate", message: number, block: number } | { status: "absent" | "ambiguous" | "changed" }}
 */
export function locatePlace(place, messages) {
  const identified = place.m !== null;
  const candidates = [];
  for (const [index, message] of messages.entries()) {
    if (identified ? message.key !== place.m : message.key !== null) continue;
    if (!identified) {
      // A row number can rule a response out; it never rules one in.
      if (place.n !== null && Number.isInteger(message.ordinal) && message.ordinal !== place.n) continue;
      if (signatureOf(message.blocks) !== place.s) continue;
    }
    candidates.push(index);
  }
  if (candidates.length === 0) return { status: "absent" };
  if (candidates.length > 1) return { status: "ambiguous" };

  const [message] = candidates;
  const { blocks } = messages[message];
  const positions = blocks.map((_, index) => index);
  const between = (index) => before(blocks, index) === place.b && after(blocks, index) === place.a;

  const same = positions.filter((index) => blocks[index].f === place.f && blocks[index].t === place.t);
  if (same.length === 1) return { status: "exact", message, block: same[0] };
  if (same.length > 1) {
    const agreeing = same.filter(between);
    return agreeing.length === 1 ? { status: "exact", message, block: agreeing[0] } : { status: "ambiguous" };
  }

  // The text is gone. Its place is trusted only in a response the site
  // identifies, between two neighbours that are both still there.
  if (identified && place.b !== null && place.a !== null) {
    const held = positions.filter(between);
    if (held.length === 1) return { status: "approximate", message, block: held[0] };
    if (held.length > 1) return { status: "ambiguous" };
  }
  return { status: "changed" };
}

const isFingerprint = (value) => typeof value === "string" && FINGERPRINT.test(value);
const isOptionalFingerprint = (value) => value === null || isFingerprint(value);
const isCount = (value) => Number.isInteger(value) && value >= 0;

// The fields of a stored place, and nothing else.
function validPlace(item) {
  if (item === null || typeof item !== "object") return null;
  const { k, m, s, t, f, i, b, a, n, p } = item;
  if (!isFingerprint(k) || !isFingerprint(f) || !isCount(i) || !BLOCK_KINDS.includes(t)) return null;
  if (!isOptionalFingerprint(m) || !isOptionalFingerprint(s) || (m === null) === (s === null)) return null;
  if (!isOptionalFingerprint(b) || !isOptionalFingerprint(a)) return null;
  if (!(n === null || isCount(n)) || !isCount(p) || p > POSITION_STEPS) return null;
  return { k, m, s, t, f, i, b, a, n, p };
}

/**
 * Return a valid places object for any input; malformed entries are dropped,
 * and so is every field that is not part of a place. Entries written in an
 * earlier format cannot be trusted under these rules and are dropped as well.
 * An object that holds more places than the bound, which this code never
 * writes, is read up to the bound.
 *
 * @param {unknown} raw
 * @returns {{ version: number, items: (ReturnType<typeof createPlace> & { k: string })[] }}
 */
export function normalizeMarks(raw) {
  const current = raw !== null && typeof raw === "object" && raw.version === MARKS_VERSION && Array.isArray(raw.items);
  const seen = new Set();
  const valid = [];
  for (const item of current ? raw.items : []) {
    const place = validPlace(item);
    if (place === null || seen.has(place.k)) continue;
    seen.add(place.k);
    valid.push(place);
  }
  return { version: MARKS_VERSION, items: valid.slice(0, MARK_LIMIT) };
}

/** The place saved for a conversation, or null. */
export function findMark(marks, key) {
  return normalizeMarks(marks).items.find((item) => item.k === key) ?? null;
}

/**
 * Whether a place can be saved for the conversation `key`: it has one already,
 * which would be replaced, or there is room for one more.
 */
export function canSave(marks, key) {
  const { items } = normalizeMarks(marks);
  return items.length < MARK_LIMIT || items.some((item) => item.k === key);
}

/**
 * Save `place` as the one place of the conversation `key`, as the newest
 * entry. Where there is no room (see `canSave`) nothing changes: no other
 * place is given up for it.
 */
export function saveMark(marks, key, place) {
  const current = normalizeMarks(marks);
  if (!canSave(current, key)) return current;
  const others = current.items.filter((item) => item.k !== key);
  return normalizeMarks({ version: MARKS_VERSION, items: [...others, { ...place, k: key }] });
}

/** Remove the place of the conversation `key`. */
export function removeMark(marks, key) {
  const others = normalizeMarks(marks).items.filter((item) => item.k !== key);
  return normalizeMarks({ version: MARKS_VERSION, items: others });
}

/** Whether two places are the same record. */
export function samePlace(first, second) {
  if (first === null || second === null) return first === second;
  return ["k", "m", "s", "t", "f", "i", "b", "a", "n", "p"].every((field) => (first[field] ?? null) === (second[field] ?? null));
}
