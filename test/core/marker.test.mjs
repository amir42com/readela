import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MARK_LIMIT,
  conversationKey,
  createMark,
  findMark,
  fingerprint,
  locateMark,
  normalizeMarks,
  removeMark,
  saveMark,
} from "../../src/core/index.js";

const prints = (texts) => texts.map((text) => fingerprint(text));
const TEXTS = ["Introduction", "First point about hooks", "Second point about state", "A closing remark", "Thanks"];

test("a fingerprint is stable across re-rendering, hides the text and ignores white space", () => {
  assert.match(fingerprint("React یک کتابخانه است."), /^[0-9a-f]{16}$/);
  assert.equal(fingerprint("  one \n two\tthree "), fingerprint("one two three"));
  assert.notEqual(fingerprint("one two three"), fingerprint("one two four"));
  assert.equal(fingerprint(""), null);
  assert.equal(fingerprint("   \n"), null);
  assert.equal(fingerprint(undefined), null);
});

test("a conversation key separates sites and conversations without holding the address", () => {
  const key = conversationKey("chatgpt.com", "/c/1234");
  assert.match(key, /^[0-9a-f]{16}$/);
  assert.notEqual(key, conversationKey("claude.ai", "/c/1234"));
  assert.notEqual(key, conversationKey("chatgpt.com", "/c/1235"));
  assert.equal(key, conversationKey("chatgpt.com", "/c/1234"));
});

test("a mark holds fingerprints and a position, never text", () => {
  const mark = createMark(prints(TEXTS), 2);
  assert.deepEqual(Object.keys(mark).sort(), ["a", "b", "f", "i"]);
  assert.equal(mark.i, 2);
  assert.equal(mark.f, fingerprint(TEXTS[2]));
  assert.equal(mark.b, fingerprint(TEXTS[1]));
  assert.equal(mark.a, fingerprint(TEXTS[3]));
  assert.deepEqual(createMark(prints(TEXTS), 0).b, null);
  assert.deepEqual(createMark(prints(TEXTS), 4).a, null);
  for (const text of TEXTS) assert.ok(!JSON.stringify(mark).includes(text));
});

test("an unchanged block is found exactly, wherever it has moved to", () => {
  const mark = createMark(prints(TEXTS), 2);
  assert.deepEqual(locateMark(mark, prints(TEXTS)), { index: 2, quality: "exact" });
  // Earlier content was added and later content removed.
  assert.deepEqual(locateMark(mark, prints(["New", "Newer", ...TEXTS.slice(0, 3)])), { index: 4, quality: "exact" });
});

test("among identical blocks the one with the same neighbours wins, then the nearest", () => {
  const texts = ["Yes.", "Why?", "Yes.", "Because.", "Yes."];
  const mark = createMark(prints(texts), 2);
  assert.deepEqual(locateMark(mark, prints(texts)), { index: 2, quality: "exact" });
  assert.deepEqual(locateMark(mark, prints(["Intro", ...texts])), { index: 3, quality: "exact" });
  // The neighbours are gone: the nearest identical block to the old position.
  assert.deepEqual(locateMark(mark, prints(["Yes.", "x", "y", "z", "Yes."])), { index: 0, quality: "exact" });
});

test("a changed block between its two unchanged neighbours is found approximately", () => {
  const mark = createMark(prints(TEXTS), 2);
  const changed = [...TEXTS];
  changed[2] = "Second point, rewritten";
  assert.deepEqual(locateMark(mark, prints(changed)), { index: 2, quality: "approximate" });
  assert.deepEqual(locateMark(mark, prints(["Preface", ...changed])), { index: 3, quality: "approximate" });
});

test("a changed block at the end of a conversation needs its one neighbour at that end", () => {
  const last = createMark(prints(TEXTS), 4);
  assert.deepEqual(locateMark(last, prints([...TEXTS.slice(0, 4), "Thank you"])), { index: 4, quality: "approximate" });
  // More was written after it: the changed block is no longer the last one.
  assert.equal(locateMark(last, prints([...TEXTS.slice(0, 4), "Thank you", "More"])), null);
});

test("no trustworthy place gives nothing: a position alone is never used", () => {
  const mark = createMark(prints(TEXTS), 2);
  assert.equal(locateMark(mark, prints(["a", "b", "c", "d", "e"])), null);
  assert.equal(locateMark(mark, []), null);
  // Only one of the two neighbours is still there.
  assert.equal(locateMark(mark, prints(["Introduction", "First point about hooks", "changed", "also changed"])), null);
  // The neighbours are there but no longer exactly one block apart.
  assert.equal(
    locateMark(mark, prints(["First point about hooks", "inserted", "changed", "A closing remark"])),
    null,
  );
  // A single-block conversation whose only block changed.
  assert.equal(locateMark(createMark(prints(["only"]), 0), prints(["other"])), null);
});

test("one mark per conversation; saving again replaces it; the oldest is dropped at the limit", () => {
  const first = createMark(prints(TEXTS), 1);
  const second = createMark(prints(TEXTS), 3);
  let marks = saveMark(undefined, "a".repeat(16), first);
  marks = saveMark(marks, "b".repeat(16), first);
  marks = saveMark(marks, "a".repeat(16), second);
  assert.deepEqual(marks.items.map((item) => item.k), ["b".repeat(16), "a".repeat(16)]);
  assert.equal(findMark(marks, "a".repeat(16)).i, 3);
  assert.equal(findMark(marks, "c".repeat(16)), null);
  assert.deepEqual(removeMark(marks, "a".repeat(16)).items.map((item) => item.k), ["b".repeat(16)]);

  for (let index = 0; index < MARK_LIMIT + 5; index += 1) {
    marks = saveMark(marks, index.toString(16).padStart(16, "0"), first);
  }
  assert.equal(marks.items.length, MARK_LIMIT);
  assert.equal(findMark(marks, "b".repeat(16)), null, "the oldest marks were dropped");
});

test("malformed stored marks are dropped, and so is anything that is not part of a mark", () => {
  const good = { k: "0123456789abcdef", f: "fedcba9876543210", i: 4, b: null, a: "00000000000000ff" };
  const marks = normalizeMarks({
    version: 9,
    items: [
      { ...good, text: "private text", url: "https://chatgpt.com/c/1" },
      { ...good },
      { ...good, k: "not a key" },
      { ...good, k: "1".repeat(16), f: 12 },
      { ...good, k: "2".repeat(16), i: -1 },
      { ...good, k: "3".repeat(16), b: "text" },
      null,
      "x",
    ],
  });
  assert.deepEqual(marks, { version: 1, items: [good] });
  for (const raw of [null, undefined, 3, "x", [], { items: "x" }]) {
    assert.deepEqual(normalizeMarks(raw), { version: 1, items: [] });
  }
});
