import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideDirection,
  directionOfText,
  isAddressText,
  measureScripts,
  resolveDirection,
} from "../../src/core/index.js";

test("right-to-left sentences that begin with a left-to-right word read right-to-left", () => {
  const cases = [
    "React یک کتابخانه جاوااسکریپت برای ساخت رابط کاربری است.", // Persian
    "Docker Compose و Kubernetes هر دو container orchestration انجام می‌دهند", // Persian, half Latin terms
    "Python هي لغة برمجة سهلة التعلم.", // Arabic
    "JavaScript היא שפת תכנות נפוצה מאוד.", // Hebrew
    "API چیست؟",
  ];
  for (const text of cases) assert.equal(directionOfText(text), "rtl", text);
});

test("plain right-to-left text reads right-to-left", () => {
  assert.equal(directionOfText("این یک جملهٔ فارسی است."), "rtl");
  assert.equal(directionOfText("هذه جملة باللغة العربية."), "rtl");
  assert.equal(directionOfText("זהו משפט בעברית."), "rtl");
});

test("left-to-right text stays left-to-right, also when it quotes right-to-left words", () => {
  assert.equal(directionOfText("This is an English sentence."), "ltr");
  assert.equal(directionOfText("The word کتاب means book in Persian."), "ltr");
  assert.equal(directionOfText("سلام is how you say hello to someone in Persian."), "ltr");
  assert.equal(directionOfText("In Hebrew, שלום means peace, hello and goodbye."), "ltr");
});

test("numbers, punctuation and symbols alone are neutral", () => {
  for (const text of ["", "   ", "12,500.75", "(1) — 2/3 … !?", "۱۲۳۴", "١٢٣", "→ ✓ 😀"]) {
    assert.equal(directionOfText(text), "neutral", JSON.stringify(text));
  }
});

test("numbers and punctuation do not change a decision", () => {
  assert.equal(directionOfText("قیمت 25 دلار است (تقریباً 1,050,000 تومان)!"), "rtl");
  assert.equal(directionOfText("Version 2.0 costs $25 (about 1,050,000 units)!"), "ltr");
});

test("web and e-mail addresses are not counted as left-to-right words", () => {
  const text = "مستندات: https://developer.mozilla.org/en-US/docs/Web/CSS/direction و docs@example.org";
  assert.deepEqual(measureScripts(text), { rtl: 2, ltr: 0 });
  assert.equal(directionOfText(text), "rtl");
});

test("a word joined by a zero-width non-joiner is one word", () => {
  assert.deepEqual(measureScripts("می‌خواهم کتاب‌ها را بخوانم"), { rtl: 4, ltr: 0 });
});

test("a mixed-script word counts as right-to-left", () => {
  assert.deepEqual(measureScripts("PDFها"), { rtl: 1, ltr: 0 });
});

test("the decision uses the share of words, not the first strong character", () => {
  assert.equal(decideDirection({ rtl: 4, ltr: 6 }), "rtl");
  assert.equal(decideDirection({ rtl: 3, ltr: 7 }), "ltr");
  assert.equal(decideDirection({ rtl: 0, ltr: 0 }), "neutral");
});

test("an explicit direction overrides the automatic decision", () => {
  const english = measureScripts("Only English here.");
  const persian = measureScripts("فقط فارسی");
  assert.equal(resolveDirection({ counts: english, mode: "rtl" }), "rtl");
  assert.equal(resolveDirection({ counts: persian, mode: "ltr" }), "ltr");
  assert.equal(resolveDirection({ counts: persian, mode: "auto" }), "rtl");
});

test("a neutral block takes its context, or nothing when there is none", () => {
  const neutral = measureScripts("1,234");
  assert.equal(resolveDirection({ counts: neutral, mode: "auto", context: "rtl" }), "rtl");
  assert.equal(resolveDirection({ counts: neutral, mode: "auto", context: "ltr" }), "ltr");
  assert.equal(resolveDirection({ counts: neutral, mode: "auto" }), null);
});

test("address detection covers whole-text addresses only", () => {
  assert.equal(isAddressText("https://example.org/a/b?c=d"), true);
  assert.equal(isAddressText(" www.example.org "), true);
  assert.equal(isAddressText("see https://example.org"), false);
  assert.equal(isAddressText("example"), false);
});

test("non-string input is measured as empty", () => {
  assert.deepEqual(measureScripts(undefined), { rtl: 0, ltr: 0 });
  assert.deepEqual(measureScripts(null), { rtl: 0, ltr: 0 });
});
