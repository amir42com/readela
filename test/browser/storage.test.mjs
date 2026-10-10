import assert from "node:assert/strict";
import { test } from "node:test";

import { changeMarks } from "../../src/browser/storage.js";
import { MARKS_KEY, createPlace, findMark, fingerprint, messageKey, removeMark, saveMark } from "../../src/core/index.js";

// A stand-in for the browser's local extension storage, shared by every "tab"
// that is given it. Values are copied in and out, as the browser does.
function storageArea() {
  const data = {};
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  return {
    data,
    failWrites: false,
    failReads: false,
    async get(key) {
      if (this.failReads) throw new Error("read failed");
      return key in data ? { [key]: copy(data[key]) } : {};
    },
    async set(values) {
      if (this.failWrites) throw new Error("write failed");
      for (const [key, value] of Object.entries(values)) data[key] = copy(value);
    },
  };
}

const place = (turn, index) =>
  createPlace(
    { key: messageKey(turn), ordinal: null, blocks: ["one", "two", "three"].map((text) => ({ f: fingerprint(text), t: "p" })) },
    index,
    0.5,
  );
const A = "a".repeat(16);
const B = "b".repeat(16);
const C = "c".repeat(16);

test("a change answers with what is really stored afterwards", async () => {
  const area = storageArea();
  const stored = await changeMarks((marks) => saveMark(marks, A, place("turn-1", 1)), area);
  assert.equal(stored.items.length, 1);
  assert.deepEqual(stored, area.data[MARKS_KEY]);
  assert.equal(findMark(stored, A).i, 1);
});

test("a failed write rejects and stores nothing, so nothing can be reported as saved or cleared", async () => {
  const area = storageArea();
  await changeMarks((marks) => saveMark(marks, A, place("turn-1", 1)), area);
  const before = JSON.stringify(area.data);

  area.failWrites = true;
  await assert.rejects(changeMarks((marks) => saveMark(marks, B, place("turn-2", 2)), area), /write failed/);
  await assert.rejects(changeMarks((marks) => removeMark(marks, A), area), /write failed/);
  assert.equal(JSON.stringify(area.data), before, "the stored places are as they were");

  area.failWrites = false;
  area.failReads = true;
  await assert.rejects(changeMarks((marks) => saveMark(marks, B, place("turn-2", 2)), area), /read failed/);
  assert.equal(JSON.stringify(area.data), before);
});

test("a tab that has been open for a while does not write back what it read earlier", async () => {
  const area = storageArea();
  // Two tabs start with the same stored places.
  await changeMarks((marks) => saveMark(marks, A, place("turn-1", 0)), area);
  // The first tab saves a place in its conversation, then another one.
  await changeMarks((marks) => saveMark(marks, B, place("turn-2", 1)), area);
  // The second tab, which never heard of that, now saves one of its own...
  const afterSave = await changeMarks((marks) => saveMark(marks, C, place("turn-3", 2)), area);
  assert.deepEqual(afterSave.items.map((item) => item.k), [A, B, C], "the other tab's place is carried along");
  // ...and clears it again: only its own place goes.
  const afterClear = await changeMarks((marks) => removeMark(marks, C), area);
  assert.deepEqual(afterClear.items.map((item) => item.k), [A, B]);
  // The first tab clears one of its places; the rest stay.
  const last = await changeMarks((marks) => removeMark(marks, A), area);
  assert.deepEqual(last.items.map((item) => item.k), [B]);
});

test("what is stored is always a valid places object, whatever was there before", async () => {
  const area = storageArea();
  area.data[MARKS_KEY] = { version: 1, items: [{ k: A, f: fingerprint("x"), i: 0, b: null, a: null, text: "private" }] };
  const stored = await changeMarks((marks) => saveMark(marks, B, place("turn-2", 1)), area);
  assert.deepEqual(stored.items.map((item) => item.k), [B]);
  assert.ok(!JSON.stringify(area.data).includes("private"));
});
