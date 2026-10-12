import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideDirection,
  directionOfText,
  isAddressText,
  measureScripts,
  resolveDirection,
} from "../../src/core/index.js";

// The words of a text by direction, without its shape.
const words = (text) => {
  const { rtl, ltr } = measureScripts(text);
  return { rtl, ltr };
};

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

test("a figure with its unit attached is a number, not a word", () => {
  for (const text of ["2M", "103K", "4.5GB", "$2M+", "10x", "۲M", "1,200kg", " 3D "]) {
    assert.equal(directionOfText(text), "neutral", JSON.stringify(text));
  }
  // It decides nothing in a sentence either way, and words still do.
  assert.equal(directionOfText("2M کاربر فعال"), "rtl");
  assert.equal(directionOfText("2M active users"), "ltr");
  assert.deepEqual(words("رشد 103K در ماه"), { rtl: 3, ltr: 0 });
  // A word that merely ends or begins with digits is still a word.
  assert.deepEqual(words("COVID19 and v2 and 10 kg"), { rtl: 0, ltr: 5 });
  assert.equal(directionOfText("100Mbps"), "ltr");
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
  assert.deepEqual(words(text), { rtl: 2, ltr: 0 });
  assert.equal(directionOfText(text), "rtl");
});

test("a word joined by a zero-width non-joiner is one word", () => {
  assert.deepEqual(words("می‌خواهم کتاب‌ها را بخوانم"), { rtl: 4, ltr: 0 });
});

test("a mixed-script word counts as right-to-left", () => {
  assert.deepEqual(words("PDFها"), { rtl: 1, ltr: 0 });
});

test("the decision uses the share of words, not the first strong character", () => {
  assert.equal(decideDirection({ rtl: 4, ltr: 6 }), "rtl");
  assert.equal(decideDirection({ rtl: 3, ltr: 7 }), "ltr");
  assert.equal(decideDirection({ rtl: 0, ltr: 0 }), "neutral");
});

test("a measurement notes the shape of a text: its first and last word, and where its right-to-left words stand", () => {
  assert.deepEqual(measureScripts("CTA و View Projects در Hero Section Pass شد"), { rtl: 3, ltr: 6, first: "ltr", last: "rtl", places: 3 });
  assert.deepEqual(measureScripts("بخش Hero Section"), { rtl: 1, ltr: 2, first: "rtl", last: "ltr", places: 1 });
  assert.deepEqual(measureScripts("The word کتاب means book."), { rtl: 1, ltr: 4, first: "ltr", last: "ltr", places: 1 });
});

test("a right-to-left sentence that is mostly terms in Latin letters still reads right-to-left", () => {
  const sentences = [
    // Its own words stand last and in between: a third of the words, or fewer.
    "CTA و View Projects در Hero Section Pass شد",
    "Pass و Fail برای CTA، View Projects، Contact Form، Footer Links و Hero Banner ثبت شد",
    // Its own word stands first: a heading of one word and two terms.
    "بخش Hero Section",
    "مرحله Phase One: Setup",
    // First, and again further on, however many terms follow.
    "تست Pass شد: CTA → View Projects → Contact Form → Thank You Page → Footer Links",
  ];
  for (const text of sentences) {
    const { rtl, ltr } = measureScripts(text);
    assert.ok(rtl / (rtl + ltr) < 0.4, `under the share: ${text}`);
    assert.equal(directionOfText(text), "rtl", text);
  }
});

test("a left-to-right sentence that quotes right-to-left words stays left-to-right, wherever they stand", () => {
  // In one place and not at the end.
  assert.equal(directionOfText("The label View Projects passed (تأیید شد) in every run of the suite."), "ltr");
  // At the end, in one place.
  assert.equal(directionOfText("In Persian the word for book is کتاب"), "ltr");
  // At the beginning, one word among many.
  assert.equal(directionOfText("سلام is how you say hello to someone in Persian."), "ltr");
  // In two places, neither first nor last.
  assert.equal(directionOfText("Use سلام for hello and خداحافظ for goodbye in Persian."), "ltr");
});

test("where a sentence's shape leaves it open, the text around it settles it", () => {
  // One right-to-left word, first: a heading in a right-to-left text, a
  // quoted word in a left-to-right one.
  const heading = measureScripts("بخش Hero Section");
  assert.equal(resolveDirection({ counts: heading, mode: "auto", context: "rtl" }), "rtl");
  assert.equal(resolveDirection({ counts: heading, mode: "auto" }), "rtl");
  assert.equal(resolveDirection({ counts: heading, mode: "auto", context: "ltr" }), "ltr");
  // Right-to-left words last and in between, in a left-to-right text.
  const glossed = measureScripts("Use View for نما and Projects for پروژه‌ها");
  assert.equal(resolveDirection({ counts: glossed, mode: "auto", context: "ltr" }), "ltr");
  // A sentence at or above the share needs no one's word.
  const plain = measureScripts("این جمله فارسی است");
  assert.equal(resolveDirection({ counts: plain, mode: "auto", context: "ltr" }), "rtl");
});

test("a list in doubt is decided by its items, a table or a quotation by its words alone", () => {
  const items = (texts) => texts.map((text) => measureScripts(text));
  const whole = (texts) => {
    const { rtl, ltr } = measureScripts(texts.join(" "));
    return { rtl, ltr };
  };
  // A checklist of right-to-left sentences, each mostly terms.
  const checklist = ["CTA و View Projects در Hero Section Pass شد", "Contact Form و Thank You Page هم Pass شد", "Footer Links: Fail"];
  assert.ok(whole(checklist).rtl / (whole(checklist).rtl + whole(checklist).ltr) < 0.4);
  assert.equal(resolveDirection({ counts: whole(checklist), mode: "auto", parts: items(checklist) }), "rtl");
  // A left-to-right list with one right-to-left item stays as it is.
  const english = ["Install the package first", "Run the build twice", "Read the notes", "این را هم ببینید"];
  assert.equal(resolveDirection({ counts: whole(english), mode: "auto", parts: items(english) }), "ltr");
  // Without its items (a table, a quotation) the same words decide by their share.
  assert.equal(resolveDirection({ counts: whole(checklist), mode: "auto" }), "ltr");
  assert.equal(decideDirection({ rtl: 3, ltr: 6 }), "ltr");
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
  assert.deepEqual(measureScripts(undefined), { rtl: 0, ltr: 0, first: null, last: null, places: 0 });
  assert.deepEqual(words(null), { rtl: 0, ltr: 0 });
});
