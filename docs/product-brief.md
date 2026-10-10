# Readela Product Brief

First prepared on 2026-10-02 for the first release and reconciled the same day
with the owner's accepted decisions (DEC-100, DEC-102, DEC-103, DEC-104).
Revised on 2026-10-10 for version 0.3.0 under DEC-116 and DEC-136 and the
owner's instruction of that day. Approval of this brief and the project's
managerial status are tracked in the managerial system, not in this file.

## Purpose

Readela is a small reading-comfort extension: it makes long and multilingual
text easier to read within the original page. The motivating case: an AI
assistant's answer that mixes Persian and English can come out with the wrong
paragraph direction, misplaced list markers and misplaced punctuation, and the
reader ends up copying it into a word processor just to read it. Readela
removes that step, and adds a few bounded reading aids around it. Text
direction is one of its core capabilities, not the whole product.

## Identity

| | |
| --- | --- |
| Product name | Readela |
| Store and installed-extension name | Readela (DEC-115); the publisher is shown separately. "Readela by Amir42" remains usable as descriptive prose. |
| Publisher / developer | Amir42 |
| Author | Amir |
| Website | amir42.com |
| License | MIT |
| Firefox add-on ID | `readela@amir42.com` |

## Users and first use case

A reader of long answers from AI assistants in a desktop browser, in
particular a reader of languages written right-to-left. Two sites are
supported: **ChatGPT** (`chatgpt.com`) and **Claude** (`claude.ai`). Chrome and
Firefox builds come from one shared codebase.

## Scope (version 0.3.0)

1. **On/off.** One clear switch. Off returns the page exactly to the
   presentation the site gives it, and keeps the reader's settings and reading
   marks.
2. **Independent reading aspects.** While Readela is on, each aspect below is
   set on its own. Every aspect has an unchanged state, shown as **Original**,
   in which Readela leaves that part of the page as the site presents it; there
   are no separate per-aspect switches.
3. **Direction:** Original, Auto, RTL or LTR.
4. **Reading appearance:** Original, Paper or Night.
5. **Font:** Original or Readela Sans.
6. **Text size and line spacing:** Original or one of three bounded choices
   each.
7. **Reading mark.** Mark here, Go to mark and Clear, one mark per
   conversation.
8. **Local persistence.** Choices and marks are remembered on the device and
   shared by both supported sites.

### Defaults

Readela is on after installation, **direction is Auto**, and every other
aspect is Original. With the defaults, the only visible change is the
direction and alignment of blocks whose text calls for it.

### Behaviour details

- **Auto direction.** A block reads right-to-left when at least 40% of its
  words are written in a right-to-left script; otherwise left-to-right. The
  first character is not decisive. Code, mathematics and web addresses are not
  counted. A block with no words (numbers or symbols only) follows its
  surroundings. Lists and tables are decided as a unit, so markers,
  indentation, column order and text agree; a nested list is decided
  separately.
- **RTL and LTR** apply to all prose in the conversation. Code and mathematics
  stay left-to-right under every setting. **Original** direction decides
  nothing and leaves every block to the site.
- **Reading appearance.** Paper is a warm, light reading surface; Night is a
  warm, dark one. Either can be chosen whatever theme the site itself is in.
  They colour the reading surface of responses only: the container of a
  response's text, its text, links, inline code and tables. The site's
  navigation, composer, message controls and the reader's own messages are not
  recoloured. A code block, and any other part of a response that is not text,
  keeps the site's own colours on the site's own background, so it stays
  readable under either theme. Primary reading text on Paper and Night has a
  contrast ratio of at least 10:1 against every surface it sits on; links are
  underlined as well as coloured. The themes are described as warm, comfortable
  reading colours and make no health claim. Readela is not a general
  dark-mode or site-recolouring tool.
- **Readela Sans.** Persian and Arabic script is shown in Vazirmatn, which is
  packaged with the extension, so it does not depend on fonts installed on the
  device. Latin, Hebrew and every other script use the device's own sans-serif
  fonts. Code keeps its monospaced font and mathematics its own.
- **Text size** scales reading blocks to 110%, 125% or 140%. **Line spacing**
  is 1.6, 1.9 or 2.2.
- **Reading mark.** Mark here saves the paragraph that holds a selection in
  view, otherwise the first paragraph whose beginning can be seen. The marked
  paragraph gets a bar on its leading edge and a tinted background. Go to mark
  scrolls it into view and emphasises it briefly; with reduced motion the jump
  is immediate and nothing is animated. A mark survives re-rendering, reloads,
  leaving the conversation and restarting the browser. If the marked paragraph
  has changed but the paragraphs on either side of it are unchanged, the place
  is shown and reported as approximate. If no trustworthy place exists,
  nothing moves, the popup says "Saved place not found", and the saved mark is
  kept until the reader replaces or clears it. Readela never scrolls by itself.
- **Reset** returns every reading aspect to its default, keeps the on/off
  state and keeps the reading marks.
- **One preference set.** The same choices apply on both sites; there are no
  per-site preferences.

### Preserved

- Underlying text, character order and copyable content.
- English-only text; inline and block code; web addresses; mathematics.
- Links, selection, page controls and normal conversation interactions.
- The message composer and every other editable field.
- The site's own theme setting and every other site preference.

Readela follows newly streamed answers and navigation between conversations.
Turning it on repeatedly stacks nothing; turning it off removes everything it
added and stops observing the page. When every aspect is Original and no
reading mark is saved, the page is not read at all.

## Languages, sites and browsers

Persian, Arabic, Hebrew, English and mixed-script text are in scope, on
ChatGPT and Claude, in Chrome and Firefox. Support is claimed only for what
was checked; the dated evidence under `docs/evidence/` states exactly which
browser versions, sites and cases were exercised and how.

## Privacy and permissions

Readela works locally: no backend, no telemetry, no remote code, no upload of
conversation content and no network request. It stores the preferences and the
reading marks, and a mark holds one-way fingerprints, never readable text or an
address. It requests access to `chatgpt.com` and `claude.ai` and to extension
storage, and nothing else. One font file is packaged with the extension and
made available to those two sites. Details and the reason for each entry are
in [privacy-and-permissions.md](privacy-and-permissions.md).

## Distribution

Public distribution is through the **Chrome Web Store** and **Firefox Add-ons
(AMO)**. Store submission, signing and publication of any version are separate
steps with their own authorization; the dated evidence records what was
submitted and what each store reported.

## Out of scope

- Custom fonts chosen by the reader, serif or Naskh font choices.
- Notes, durable highlighting, read aloud, focus modes.
- Per-site preferences, other websites.
- Safari and Microsoft Edge. Safari is an accepted planned public platform
  (DEC-104) and Edge a planned later one (DEC-116); nothing here implements
  either.
- A general dark mode or recolouring of whole sites.
- Voice transcription, AI services, translation, accounts, cloud sync,
  analytics and native applications.

## Acceptance criteria

A version is acceptable for owner evaluation when, in real Chrome and Firefox
builds, on both supported sites:

1. Right-to-left paragraphs that begin with a left-to-right word, and
   paragraphs with mixed punctuation and numbers, read right-to-left with
   correct visual order.
2. Nested lists, headings, quotations, tables, and paragraphs with inline
   links and code present correctly.
3. English-only text, code and mathematics are unchanged in direction and font.
4. Streamed additions and conversation navigation are followed.
5. Repeated on/off, reset and reload behave as described; off leaves no trace
   and keeps changes the page itself made in the meantime.
6. Text content and selection are unchanged; the composer is untouched.
7. The popup is operable by keyboard with a visible focus indicator and meets
   text contrast in light and dark themes.
8. The extension makes no network request and stores only the preferences and
   the reading marks.
9. Paper and Night colour the reading surface only, hold primary reading text
   at 10:1 or better with the site in a light and in a dark theme, and leave
   code blocks readable.
10. Persian and Arabic text in Readela Sans is rendered with the packaged
    font; Latin and Hebrew text is not.
11. The reading mark is saved, shown, found again after a reload and a
    re-render, reported as approximate or not found when that is the truth,
    and never moves the page to an untrusted place.

## Accepted owner decisions reflected here

- DEC-100: product name and public repository.
- DEC-102: ChatGPT and Claude in the first release; Amir42 branding. Its
  deferral of the reading-position marker ended with DEC-136.
- DEC-103: Automatic default direction; MIT license; Firefox add-on ID;
  Chrome Web Store and Firefox AMO distribution.
- DEC-104: Safari as a planned future platform.
- DEC-115: Readela as the store and installed-extension name.
- DEC-116: Readela as a minimal reading-comfort product.
- DEC-136: the 0.3.0 scope: independent reading aspects, reading themes, the
  reading mark, simplified typography with bundled Vazirmatn, a minimal popup.

## Still separate from this brief

- Name clearance: a release-readiness check; a preliminary search is not
  trademark clearance.
- Store listing content, submission and the release process for each store.
