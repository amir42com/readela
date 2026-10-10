# Readela Product Brief

First prepared on 2026-10-02 for the first release and reconciled the same day
with the owner's accepted decisions (DEC-100, DEC-102, DEC-103, DEC-104).
Revised on 2026-10-10 for version 0.3.0 under DEC-116 and DEC-136 and the
owner's instruction of that day, and again the same day under DEC-140 after
the owner's first review of the 0.3.0 build. Approval of this brief and the
project's managerial status are tracked in the managerial system, not in this
file.

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
   presentation the site gives it, and keeps the reader's settings and saved
   places.
2. **Independent reading aspects.** While Readela is on, each aspect below is
   set on its own. Every aspect has an unchanged state, shown as **Original**,
   in which Readela leaves that part of the page as the site presents it; there
   are no separate per-aspect switches.
3. **Appearance:** Original, Paper or Night.
4. **Font:** Original or Readela Sans.
5. **Text size and line spacing:** Original or one of three bounded choices
   each.
6. **Text direction:** Original, Auto, RTL or LTR.
7. **Saved place.** Save place (Update place once one exists), Return and
   Clear, one place per conversation.
8. **Local persistence.** Choices and saved places are remembered on the
   device; choices are shared by both supported sites.

The popup presents them in this order: reading comes first, and direction is
one reading setting among the others.

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
- **Appearance.** Paper is a warm, light reading surface; Night is a warm,
  dark one. Either can be chosen whatever theme the site itself is in.
  Ownership is explicit. Readela owns the text of responses, where the site
  adapter recognises it: that becomes the reading surface. The site owns
  everything else: its navigation, header, composer and controls; the
  reader's own messages, inside and out; and anything the adapter does not
  recognise, which is left unchanged rather than coloured by a general rule.
  Inside a response, what a part of the text means stays visible: links
  (underlined as well as coloured), inline code, list markers, quotations
  with their indentation and bar, tables with their lines, headers and
  sideways scrolling, and highlighted, small and struck text each keep a
  distinct treatment from a small set of theme colours. A code block is one
  unit of the site's: its background, syntax colours, header and controls are
  kept, and nothing of another colour shows around its corners; a dark code
  block on Paper is intended. A formula keeps its renderer's presentation.
  Primary reading text on Paper and Night has a contrast ratio of at least
  10:1 against every surface it sits on, secondary text at least 7:1. The
  themes are described as warm, comfortable reading colours and make no
  health claim. Readela is not a general dark-mode or site-recolouring tool.
- **Readela Sans.** Persian and Arabic script is shown in Vazirmatn, which is
  packaged with the extension, so it does not depend on fonts installed on the
  device. Latin, Hebrew and every other script use the device's own sans-serif
  fonts. Code keeps its monospaced font and mathematics its own.
- **Text size** scales reading blocks to 110%, 125% or 140%. **Line spacing**
  is 1.6, 1.9 or 2.2.
- **Saved place.** One place per conversation, in the text of a response.
  - *Saving.* Save place saves the readable paragraph that holds a selection
    in view, otherwise the first readable paragraph of a response at the top
    of the reading area that is not covered by something the site keeps on
    top; a paragraph that begins above the area counts. Nothing is guessed
    about where the reader is looking. Elements kept only for screen readers,
    controls and the reader's own messages are never saved. The popup says
    "Saves the first paragraph in view. Select text to choose another." A
    paragraph that cannot be told from an identical one beside it is not
    saved, and the popup says so.
  - *Showing.* The saved paragraph gets a bar on its leading edge and a tinted
    background.
  - *Returning.* Return scrolls the place into view and emphasises it briefly;
    with reduced motion the jump is immediate and nothing is animated. A place
    is trusted only inside the response it was saved in, which the site's own
    identifier for that response establishes where the site gives one; the
    same sentence in another response is never taken for it. If the saved
    paragraph has changed but the paragraphs on either side of it are
    unchanged, the place is shown and reported as close to the saved place.
    Where the response is not on the page (the site has not loaded it, or
    keeps only what is near the viewport in the document), Return searches the
    conversation in a bounded number of steps and a bounded time, stops as
    soon as the reader scrolls, clicks or types, when the conversation changes
    or Readela is turned off, and puts the conversation back where it was if
    it finds nothing.
  - *Truthful reports.* "Place saved" is said after the browser has stored it;
    "Returned to your saved place" after the place is seen in view; a place
    that is not found is reported as not found and still saved. A failed
    lookup never removes a place: it is kept until the reader replaces or
    clears it. A wrong place is never shown in order to show something.
  - *Same conversation, any route.* A conversation opened directly and the
    same conversation opened inside a project are one conversation; different
    conversations never share a place.
  - A place survives re-rendering, reloads, leaving the conversation and
    restarting the browser. Readela never scrolls by itself.
- **Reset** returns every reading aspect to its default, keeps the on/off
  state and keeps the saved places. It is a quiet button and asks for no
  confirmation.
- **Popup.** A selected choice is shown by its own outline, fill and heavier
  text, without an underline; the keyboard focus is a separate ring. The
  footer reads "By Amir42" with a link to amir42.com that opens in a new tab,
  and the version.
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
place is saved, the page is not read at all.

## Languages, sites and browsers

Persian, Arabic, Hebrew, English and mixed-script text are in scope, on
ChatGPT and Claude, in Chrome and Firefox. Support is claimed only for what
was checked; the dated evidence under `docs/evidence/` states exactly which
browser versions, sites and cases were exercised and how.

## Privacy and permissions

Readela works locally: no backend, no telemetry, no remote code, no upload of
conversation content and no network request. It stores the preferences and the
saved places, and a saved place holds one-way fingerprints and a few small
numbers, never readable text, a title or an address. These are matching
information kept on the device, not anonymisation or encryption. It requests
access to `chatgpt.com` and `claude.ai` and to extension storage, and
nothing else. One font file is packaged with the extension and
made available to those two sites. Details and the reason for each entry are
in [privacy-and-permissions.md](privacy-and-permissions.md).

## Distribution

Public distribution is through the **Chrome Web Store** and **Firefox Add-ons
(AMO)**. Store submission, signing and publication of any version are separate
steps with their own authorization; the dated evidence records what was
submitted and what each store reported.

## Out of scope

- Custom fonts chosen by the reader, serif or Naskh font choices.
- Notes, durable highlighting, read aloud, focus modes, translation.
- Saved places in the reader's own messages; a sign in the site's sidebar or
  history that a conversation has a saved place.
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
   the saved places.
9. Paper and Night colour the text of responses only, hold primary reading text
   at 10:1 or better with the site in a light and in a dark theme, leave the
   reader's own messages and unrecognised layouts unchanged, keep a code block
   whole with nothing of another colour around its corners, and keep links,
   inline code, list markers, quotations and tables distinct.
10. Persian and Arabic text in Readela Sans is rendered with the packaged
    font; Latin and Hebrew text is not.
11. The saved place is saved, shown, found again after a reload, a re-render
    and a restart of the browser, and under every route to its conversation;
    it is never confused with an identical paragraph elsewhere; it is found by
    a bounded search when its response is not on the page; it is reported as
    saved, reached, close or not found only when that is the truth; and a
    place that is not found is kept.

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
  reading-position marker, simplified typography with bundled Vazirmatn, a
  minimal popup.
- DEC-140: the correction of 0.3.0 before integration: a saved place that is
  trusted only where it is certain, explicit ownership of reading surfaces,
  coherent code and semantic content, and a reading-first popup.

## Still separate from this brief

- Name clearance: a release-readiness check; a preliminary search is not
  trademark clearance.
- Store listing content, submission and the release process for each store.
