import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MARK_LIMIT,
  blockKind,
  canSave,
  conversationId,
  conversationKey,
  createPlace,
  findMark,
  fingerprint,
  locatePlace,
  messageKey,
  normalizeMarks,
  removeMark,
  saveMark,
  samePlace,
} from "../../src/core/index.js";
import { chatgpt } from "../../src/page/sites/chatgpt.js";
import { claude } from "../../src/page/sites/claude.js";

const blocks = (texts) => texts.map((text) => ({ f: fingerprint(text), t: "p" }));
// A response the site identifies, and one it does not.
const known = (id, texts, ordinal = null) => ({ key: messageKey(id), ordinal, blocks: blocks(texts) });
const unknown = (texts, ordinal = null) => ({ key: null, ordinal, blocks: blocks(texts) });

const TEXTS = ["Introduction", "First point about hooks", "Second point about state", "A closing remark", "Thanks"];
const OTHER = ["Something else", "entirely", "different"];

test("a fingerprint is stable across re-rendering, hides the text and ignores white space", () => {
  assert.match(fingerprint("React یک کتابخانه است."), /^[0-9a-f]{16}$/);
  assert.equal(fingerprint("  one \n two\tthree "), fingerprint("one two three"));
  assert.notEqual(fingerprint("one two three"), fingerprint("one two four"));
  assert.equal(fingerprint(""), null);
  assert.equal(fingerprint("   \n"), null);
  assert.equal(fingerprint(undefined), null);
});

test("equivalent routes of one conversation give one identity; different conversations stay apart", () => {
  const id = "6ac5fbf2-36a8-83ec-ba6c-000000000001";
  const direct = conversationId(chatgpt.conversation, `/c/${id}`);
  assert.notEqual(direct, null);
  // The same conversation opened inside a project, a custom assistant, with a
  // trailing slash, and with the identifier in upper case.
  for (const path of [`/g/g-p-0123456789abcdef-my-project/c/${id}`, `/g/g-abc123/c/${id}`, `/c/${id}/`, `/c/${id.toUpperCase()}`]) {
    assert.equal(conversationId(chatgpt.conversation, path), direct, path);
  }
  // Another conversation, in the same project or outside it.
  const other = "6ac5fbf2-36a8-83ec-ba6c-000000000002";
  assert.notEqual(conversationId(chatgpt.conversation, `/c/${other}`), direct);
  assert.notEqual(conversationId(chatgpt.conversation, `/g/g-p-0123456789abcdef-my-project/c/${other}`), direct);
  // Pages that show no conversation have no identity, so nothing can be saved on them.
  for (const path of ["/", "/g/g-p-0123456789abcdef-my-project/project", "/gpts", "/c/", "/library/c"]) {
    assert.equal(conversationId(chatgpt.conversation, path), null, path);
  }

  const chat = "636b8c14-1246-4e34-b1d9-000000000003";
  assert.notEqual(conversationId(claude.conversation, `/chat/${chat}`), null);
  assert.equal(conversationId(claude.conversation, `/chat/${chat}/`), conversationId(claude.conversation, `/chat/${chat}`));
  for (const path of ["/", "/new", "/recents", "/project/abc", "/chat/"]) {
    assert.equal(conversationId(claude.conversation, path), null, path);
  }

  // The stored key holds neither the address nor the identifier, and keeps the sites apart.
  const key = conversationKey("chatgpt", direct);
  assert.match(key, /^[0-9a-f]{16}$/);
  assert.equal(key, conversationKey("chatgpt", conversationId(chatgpt.conversation, `/g/g-abc123/c/${id}`)));
  assert.notEqual(key, conversationKey("claude", direct));
  assert.notEqual(key, conversationKey("chatgpt", conversationId(chatgpt.conversation, `/c/${other}`)));
});

test("a response is identified by the site's key, never by a missing or empty one", () => {
  assert.match(messageKey("turn-1"), /^[0-9a-f]{16}$/);
  assert.equal(messageKey("turn-1"), messageKey(" turn-1 "));
  assert.notEqual(messageKey("turn-1"), messageKey("turn-2"));
  for (const missing of [null, undefined, "", "   ", 3]) assert.equal(messageKey(missing), null);
});

test("blocks are sorted into a few kinds", () => {
  assert.deepEqual(["P", "li", "h3", "td", "figcaption"].map(blockKind), ["p", "li", "h", "c", "o"]);
});

test("a place holds fingerprints and small numbers, never text", () => {
  const place = createPlace(known("turn-7", TEXTS, 13), 2, 0.4217);
  assert.deepEqual(Object.keys(place).sort(), ["a", "b", "f", "i", "m", "n", "p", "s", "t"]);
  assert.deepEqual(
    { m: place.m, s: place.s, t: place.t, f: place.f, i: place.i, b: place.b, a: place.a, n: place.n, p: place.p },
    {
      m: messageKey("turn-7"),
      s: null,
      t: "p",
      f: fingerprint(TEXTS[2]),
      i: 2,
      b: fingerprint(TEXTS[1]),
      a: fingerprint(TEXTS[3]),
      n: 13,
      p: 422,
    },
  );
  assert.equal(createPlace(known("turn-7", TEXTS), 0, 0).b, null);
  assert.equal(createPlace(known("turn-7", TEXTS), 4, 2).a, null);
  assert.equal(createPlace(known("turn-7", TEXTS), 4, 2).p, 1000, "the position is kept within the conversation");
  // Where the site gives no key, the response is recognised by a fingerprint of all of it.
  const keyless = createPlace(unknown(TEXTS), 2, 0.5);
  assert.equal(keyless.m, null);
  assert.match(keyless.s, /^[0-9a-f]{16}$/);
  for (const text of [...TEXTS, "turn-7"]) assert.ok(!JSON.stringify([place, keyless]).includes(text));
});

test("an unchanged block is found exactly in the response it was saved in, wherever that response now is", () => {
  const place = createPlace(known("turn-2", TEXTS), 2, 0.5);
  assert.deepEqual(locatePlace(place, [known("turn-2", TEXTS)]), { status: "exact", message: 0, block: 2 });
  // Other responses came before and after it.
  const page = [known("turn-1", OTHER), known("turn-2", TEXTS), known("turn-3", OTHER)];
  assert.deepEqual(locatePlace(place, page), { status: "exact", message: 1, block: 2 });
  // More was written into the response; the block is still the only one with its text.
  assert.deepEqual(locatePlace(place, [known("turn-2", ["Preface", ...TEXTS, "Postscript"])]), {
    status: "exact",
    message: 0,
    block: 3,
  });
});

test("identical text in another response is never the place: a duplicate cannot win", () => {
  const place = createPlace(known("turn-2", TEXTS), 2, 0.5);
  // The same paragraphs, word for word, in a different response; the response
  // the place was saved in is not on the page.
  assert.deepEqual(locatePlace(place, [known("turn-1", TEXTS), known("turn-3", TEXTS)]), { status: "absent" });
  // With the right response on the page too, it is the one found.
  assert.deepEqual(locatePlace(place, [known("turn-1", TEXTS), known("turn-2", TEXTS)]), {
    status: "exact",
    message: 1,
    block: 2,
  });
  // A response the site does not identify is no candidate for a place saved in one it does.
  assert.deepEqual(locatePlace(place, [unknown(TEXTS)]), { status: "absent" });
});

test("among identical blocks of one response the neighbours decide, and only when exactly one agrees", () => {
  const texts = ["Yes.", "Why?", "Yes.", "Because.", "Yes."];
  const place = createPlace(known("turn-2", texts), 2, 0.5);
  assert.deepEqual(locatePlace(place, [known("turn-2", texts)]), { status: "exact", message: 0, block: 2 });
  assert.deepEqual(locatePlace(place, [known("turn-2", ["Intro", ...texts])]), { status: "exact", message: 0, block: 3 });

  // Its neighbours are gone: three identical blocks, none of them provably the one saved.
  assert.deepEqual(locatePlace(place, [known("turn-2", ["Yes.", "x", "Yes.", "y", "Yes."])]), { status: "ambiguous" });
  // Two blocks with the same text and the same neighbours.
  const repeated = ["Why?", "Yes.", "Because.", "Why?", "Yes.", "Because."];
  const twin = createPlace(known("turn-2", repeated), 4, 0.5);
  assert.deepEqual(locatePlace(twin, [known("turn-2", repeated)]), { status: "ambiguous" });
  // A run of identical blocks: the position alone never decides.
  const run = ["Same.", "Same.", "Same.", "Same."];
  assert.deepEqual(locatePlace(createPlace(known("turn-2", run), 1, 0.5), [known("turn-2", run)]), { status: "ambiguous" });
});

test("a changed block is an approximate place only in an identified response, between both unchanged neighbours", () => {
  const place = createPlace(known("turn-2", TEXTS), 2, 0.5);
  const changed = [...TEXTS];
  changed[2] = "Second point, rewritten";
  assert.deepEqual(locatePlace(place, [known("turn-2", changed)]), { status: "approximate", message: 0, block: 2 });
  assert.deepEqual(locatePlace(place, [known("turn-1", TEXTS), known("turn-2", ["Preface", ...changed])]), {
    status: "approximate",
    message: 1,
    block: 3,
  });

  // Only one of the two neighbours is still there.
  assert.deepEqual(locatePlace(place, [known("turn-2", [TEXTS[0], TEXTS[1], "changed", "also changed"])]), { status: "changed" });
  // The neighbours are there but no longer exactly one block apart.
  assert.deepEqual(locatePlace(place, [known("turn-2", [TEXTS[1], "inserted", "changed", TEXTS[3]])]), { status: "changed" });
  // Two places fit between such neighbours.
  const twice = [TEXTS[1], "one", TEXTS[3], TEXTS[1], "two", TEXTS[3]];
  assert.deepEqual(locatePlace(place, [known("turn-2", twice)]), { status: "ambiguous" });
  // A block at the edge of its response has one neighbour only, which is not enough.
  const last = createPlace(known("turn-2", TEXTS), 4, 0.9);
  assert.deepEqual(locatePlace(last, [known("turn-2", [...TEXTS.slice(0, 4), "Thank you"])]), { status: "changed" });
  // Everything changed.
  assert.deepEqual(locatePlace(place, [known("turn-2", ["a", "b", "c", "d", "e"])]), { status: "changed" });
  assert.deepEqual(locatePlace(place, [known("turn-2", [])]), { status: "changed" });
  assert.deepEqual(locatePlace(place, []), { status: "absent" });
});

test("without the site's key the whole response must be unchanged, and a twin makes it ambiguous", () => {
  const place = createPlace(unknown(TEXTS, 3), 2, 0.5);
  assert.deepEqual(locatePlace(place, [unknown(OTHER, 1), unknown(TEXTS, 3)]), { status: "exact", message: 1, block: 2 });
  // The same response twice on the page: nothing tells them apart.
  assert.deepEqual(locatePlace(place, [unknown(TEXTS), unknown(TEXTS)]), { status: "ambiguous" });
  // A row number rules the twin at another row out; it is never what rules a response in.
  assert.deepEqual(locatePlace(place, [unknown(TEXTS, 1), unknown(TEXTS, 3)]), { status: "exact", message: 1, block: 2 });
  assert.deepEqual(locatePlace(place, [unknown(TEXTS, 1)]), { status: "absent" });
  assert.deepEqual(locatePlace(place, [unknown(OTHER, 3)]), { status: "absent" });
  // Any change to the response, and it is no longer recognised: no approximate place here.
  const changed = [...TEXTS];
  changed[2] = "Second point, rewritten";
  assert.deepEqual(locatePlace(place, [unknown(changed, 3)]), { status: "absent" });
  assert.deepEqual(locatePlace(place, [unknown([...TEXTS, "More"], 3)]), { status: "absent" });
  // A response the site does identify is no candidate for it.
  assert.deepEqual(locatePlace(place, [known("turn-2", TEXTS, 3)]), { status: "absent" });
});

test("a block of another kind with the same text is not the saved block", () => {
  const message = { key: messageKey("turn-2"), ordinal: null, blocks: [{ f: fingerprint("Title"), t: "h" }, { f: fingerprint("Body"), t: "p" }] };
  const place = createPlace(message, 0, 0);
  const retyped = { ...message, blocks: [{ f: fingerprint("Title"), t: "p" }, { f: fingerprint("Body"), t: "p" }] };
  assert.deepEqual(locatePlace(place, [retyped]), { status: "changed" });
});

test("one place per conversation; saving again replaces it", () => {
  const first = createPlace(known("turn-1", TEXTS), 1, 0.2);
  const second = createPlace(known("turn-1", TEXTS), 3, 0.6);
  let marks = saveMark(undefined, "a".repeat(16), first);
  marks = saveMark(marks, "b".repeat(16), first);
  marks = saveMark(marks, "a".repeat(16), second);
  assert.deepEqual(marks.items.map((item) => item.k), ["b".repeat(16), "a".repeat(16)]);
  assert.equal(findMark(marks, "a".repeat(16)).i, 3);
  assert.equal(findMark(marks, "c".repeat(16)), null);
  assert.ok(samePlace(findMark(marks, "a".repeat(16)), { ...second, k: "a".repeat(16) }));
  assert.ok(!samePlace(findMark(marks, "a".repeat(16)), { ...first, k: "a".repeat(16) }));
  assert.ok(!samePlace(findMark(marks, "c".repeat(16)), { ...first, k: "c".repeat(16) }));
  assert.deepEqual(removeMark(marks, "a".repeat(16)).items.map((item) => item.k), ["b".repeat(16)]);
  // Removing a place that is not there changes nothing: a lookup never deletes.
  assert.deepEqual(removeMark(marks, "c".repeat(16)), marks);
});

test("a thousand conversations can have a place; at the limit a new one is refused and none is given up", () => {
  assert.equal(MARK_LIMIT, 1000);
  const place = createPlace(known("turn-1", TEXTS), 1, 0.2);
  const other = createPlace(known("turn-1", TEXTS), 3, 0.6);
  const key = (index) => index.toString(16).padStart(16, "0");

  let marks;
  for (let index = 0; index < 999; index += 1) marks = saveMark(marks, key(index), place);
  assert.equal(marks.items.length, 999);
  // 999 saved: one more conversation fits.
  assert.equal(canSave(marks, key(999)), true);
  marks = saveMark(marks, key(999), place);
  assert.equal(marks.items.length, 1000);

  // 1000 saved: a further conversation is refused, and every place is as it was.
  const full = JSON.stringify(marks);
  assert.equal(canSave(marks, "f".repeat(16)), false);
  const refused = saveMark(marks, "f".repeat(16), place);
  assert.equal(JSON.stringify(refused), full, "nothing was dropped to make room");
  assert.equal(findMark(refused, "f".repeat(16)), null);
  assert.ok(findMark(refused, key(0)) !== null, "the oldest place is still there");

  // A conversation that has a place can still update it; the count stays.
  assert.equal(canSave(marks, key(0)), true);
  marks = saveMark(marks, key(0), other);
  assert.equal(marks.items.length, 1000);
  assert.equal(findMark(marks, key(0)).i, 3);
  for (let index = 1; index < 1000; index += 1) assert.ok(findMark(marks, key(index)) !== null, key(index));

  // Clearing one makes room for one.
  marks = removeMark(marks, key(500));
  assert.equal(marks.items.length, 999);
  assert.equal(canSave(marks, "f".repeat(16)), true);
  marks = saveMark(marks, "f".repeat(16), place);
  assert.equal(marks.items.length, 1000);
  assert.ok(findMark(marks, "f".repeat(16)) !== null);

  // An object holding more than this code ever writes is read up to the limit.
  const over = { version: 2, items: [...marks.items, { ...place, k: "e".repeat(16) }] };
  assert.equal(normalizeMarks(over).items.length, 1000);
});

test("malformed stored places are dropped, and so is anything that is not part of a place", () => {
  const print = "fedcba9876543210";
  const good = { k: "0123456789abcdef", m: "00000000000000aa", s: null, t: "p", f: print, i: 4, b: null, a: "00000000000000ff", n: 7, p: 250 };
  const keyless = { ...good, k: "1".repeat(16), m: null, s: "00000000000000bb", n: null };
  const marks = normalizeMarks({
    version: 2,
    items: [
      { ...good, text: "private text", url: "https://chatgpt.com/c/1", title: "A title" },
      { ...good },
      keyless,
      { ...good, k: "not a key" },
      { ...good, k: "2".repeat(16), f: 12 },
      { ...good, k: "3".repeat(16), i: -1 },
      { ...good, k: "4".repeat(16), b: "text" },
      { ...good, k: "5".repeat(16), t: "paragraph" },
      { ...good, k: "6".repeat(16), m: null },
      { ...good, k: "7".repeat(16), s: "00000000000000bb" },
      { ...good, k: "8".repeat(16), p: 1001 },
      { ...good, k: "9".repeat(16), n: 1.5 },
      null,
      "x",
    ],
  });
  assert.deepEqual(marks, { version: 2, items: [good, keyless] });
  for (const raw of [null, undefined, 3, "x", [], { items: "x" }, { version: 2, items: "x" }]) {
    assert.deepEqual(normalizeMarks(raw), { version: 2, items: [] });
  }
  // Places written in the first format cannot be trusted under these rules.
  const first = { version: 1, items: [{ k: good.k, f: print, i: 4, b: null, a: null }] };
  assert.deepEqual(normalizeMarks(first), { version: 2, items: [] });
  assert.deepEqual(normalizeMarks({ items: [good] }), { version: 2, items: [] });
});
