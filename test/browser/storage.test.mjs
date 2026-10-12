import assert from "node:assert/strict";
import { test } from "node:test";

import { changeMarks, createMarkWriter } from "../../src/browser/storage.js";
import {
  MARKS_KEY,
  MARK_LIMIT,
  changeFor,
  createPlace,
  findMark,
  fingerprint,
  messageKey,
  removeMark,
  saveMark,
} from "../../src/core/index.js";

// A stand-in for the browser's local extension storage, shared by everyone
// who is given it. Values are copied in and out, as the browser does. Every
// call answers a little later, and `delays` says how much later, call by
// call, so that calls can be made to answer out of order.
function storageArea(delays = []) {
  const data = {};
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const later = () => new Promise((resolve) => setTimeout(resolve, delays.shift() ?? 0));
  return {
    data,
    failWrites: false,
    failReads: false,
    async get(key) {
      await later();
      if (this.failReads) throw new Error("read failed");
      return key in data ? { [key]: copy(data[key]) } : {};
    },
    async set(values) {
      await later();
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
const keys = (marks) => marks.items.map((item) => item.k);

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
  assert.deepEqual(keys(afterSave), [A, B, C], "the other tab's place is carried along");
  // ...and clears it again: only its own place goes.
  const afterClear = await changeMarks((marks) => removeMark(marks, C), area);
  assert.deepEqual(keys(afterClear), [A, B]);
  // The first tab clears one of its places; the rest stay.
  const last = await changeMarks((marks) => removeMark(marks, A), area);
  assert.deepEqual(keys(last), [B]);
});

test("what is stored is always a valid places object, whatever was there before", async () => {
  const area = storageArea();
  area.data[MARKS_KEY] = { version: 1, items: [{ k: A, f: fingerprint("x"), i: 0, b: null, a: null, text: "private" }] };
  const stored = await changeMarks((marks) => saveMark(marks, B, place("turn-2", 1)), area);
  assert.deepEqual(keys(stored), [B]);
  assert.ok(!JSON.stringify(area.data).includes("private"));
});

// The defect the one writer is there for: the browser has no transaction for
// this storage, so two changes that run at the same moment both read what was
// stored before either wrote, and the one that writes last wins.
test("two changes that run at the same moment, each on its own, lose one of them", async () => {
  const area = storageArea();
  await Promise.all([
    changeMarks((marks) => saveMark(marks, A, place("turn-1", 0)), area),
    changeMarks((marks) => saveMark(marks, B, place("turn-2", 1)), area),
  ]);
  assert.equal(area.data[MARKS_KEY].items.length, 1, "this is why a page never makes a change itself");
});

test("the one writer makes changes asked for at the same moment one after another: none is lost", async () => {
  // The storage answers the earlier calls later than the later ones.
  const area = storageArea([30, 20, 10, 0, 25, 5]);
  const write = createMarkWriter(area);
  const [first, second, third] = await Promise.all([
    write({ change: "save", key: A, place: place("turn-1", 0) }),
    write({ change: "save", key: B, place: place("turn-2", 1) }),
    write({ change: "save", key: C, place: place("turn-3", 2) }),
  ]);
  // Each is answered with what was stored when its own change was made.
  assert.deepEqual(keys(first), [A]);
  assert.deepEqual(keys(second), [A, B]);
  assert.deepEqual(keys(third), [A, B, C]);
  assert.deepEqual(keys(area.data[MARKS_KEY]), [A, B, C]);
});

test("changes of one conversation's place are made in the order they were asked for", async () => {
  const area = storageArea([20, 0, 15, 0, 10, 0, 5, 0]);
  const write = createMarkWriter(area);
  const answers = await Promise.all([
    write({ change: "save", key: A, place: place("turn-1", 0) }),
    write({ change: "save", key: A, place: place("turn-1", 2) }),
    write({ change: "remove", key: A }),
    write({ change: "save", key: A, place: place("turn-9", 1) }),
  ]);
  assert.deepEqual(answers.map((marks) => findMark(marks, A)?.i ?? null), [0, 2, null, 1]);
  assert.equal(findMark(area.data[MARKS_KEY], A).m, messageKey("turn-9"));
});

test("a change that fails is answered as failed, changes nothing and does not hold up the next", async () => {
  const area = storageArea();
  const write = createMarkWriter(area);
  await write({ change: "save", key: A, place: place("turn-1", 0) });

  area.failWrites = true;
  const failed = write({ change: "save", key: B, place: place("turn-2", 1) });
  const removal = write({ change: "remove", key: A });
  await assert.rejects(failed, /write failed/);
  await assert.rejects(removal, /write failed/);
  assert.deepEqual(keys(area.data[MARKS_KEY]), [A]);

  area.failWrites = false;
  const stored = await write({ change: "save", key: C, place: place("turn-3", 2) });
  assert.deepEqual(keys(stored), [A, C]);
});

test("the writer makes only the changes it knows, with a valid place and a valid key", async () => {
  const area = storageArea();
  const write = createMarkWriter(area);
  for (const request of [
    null,
    "save",
    {},
    { change: "save", key: A },
    { change: "save", key: "not a key", place: place("turn-1", 0) },
    { change: "save", key: A, place: { ...place("turn-1", 0), f: "text that is not a fingerprint" } },
    { change: "row", key: A, row: "an address" },
    { change: "empty", key: A },
    { change: (marks) => marks, key: A },
  ]) {
    await assert.rejects(write(request), /not a change/);
    assert.equal(changeFor(request), null);
  }
  assert.deepEqual(area.data, {}, "nothing was read into storage or written");
  // A field that is no part of a place never reaches storage.
  await write({ change: "save", key: A, place: { ...place("turn-1", 0), title: "private" } });
  assert.ok(!JSON.stringify(area.data).includes("private"));
});

test("the row of a conversation is noted on the place it has, and nowhere else", async () => {
  const area = storageArea();
  const write = createMarkWriter(area);
  const row = fingerprint("a row");
  // No place yet: nothing to note it on, and none is made for it.
  assert.deepEqual(keys(await write({ change: "row", key: A, row })), []);
  await write({ change: "save", key: A, place: place("turn-1", 1) });
  await write({ change: "save", key: B, place: place("turn-2", 2) });
  const stored = await write({ change: "row", key: A, row });
  assert.equal(findMark(stored, A).r, row);
  assert.equal(findMark(stored, A).i, 1, "the place itself is as it was");
  assert.equal(findMark(stored, B).r, undefined);
  // Asked for at the same moment as a removal of that place, whichever comes
  // second finds what the first left.
  const [, afterRow] = await Promise.all([write({ change: "remove", key: A }), write({ change: "row", key: A, row })]);
  assert.deepEqual(keys(afterRow), [B]);
});

test("at the limit a further conversation is refused and no place is given up, also when asked for at the same moment", async () => {
  const area = storageArea();
  const hex = (value) => value.toString(16).padStart(16, "0");
  area.data[MARKS_KEY] = {
    version: 2,
    items: Array.from({ length: MARK_LIMIT - 1 }, (_, index) => ({ ...place("turn-1", 0), k: hex(0xa000000 + index) })),
  };
  const write = createMarkWriter(area);
  const [first, second] = await Promise.all([
    write({ change: "save", key: A, place: place("turn-1", 0) }),
    write({ change: "save", key: B, place: place("turn-2", 1) }),
  ]);
  assert.equal(first.items.length, MARK_LIMIT);
  assert.notEqual(findMark(first, A), null);
  // The second found no room: what is stored is what the first left.
  assert.equal(second.items.length, MARK_LIMIT);
  assert.equal(findMark(second, B), null);
  // A place that is there can still be changed and removed.
  assert.equal(findMark(await write({ change: "save", key: A, place: place("turn-1", 2) }), A).i, 2);
  assert.equal((await write({ change: "remove", key: A })).items.length, MARK_LIMIT - 1);
});
