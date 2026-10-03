# Readela Product Brief — first release

First prepared on 2026-10-02 and reconciled the same day with the owner's
accepted decisions (DEC-100, DEC-102, DEC-103, DEC-104). Approval of this
brief as a whole, and the project's managerial status, are tracked in the
managerial system (entry ENT-196), not in this file.

## Purpose

Readela makes multilingual text easier to read within the original page. The
motivating case: an AI assistant's answer that mixes Persian and English can
come out with the wrong paragraph direction, misplaced list markers and
misplaced punctuation, and the reader ends up copying it into a word processor
just to read it. Readela removes that step.

## Identity

| | |
| --- | --- |
| Product name | Readela |
| Public presentation | Readela by Amir42 |
| Publisher / developer | Amir42 |
| Author | Amir |
| Website | amir42.com |
| License | MIT |
| Firefox add-on ID | `readela@amir42.com` |

## Users and first use case

A reader of right-to-left languages who reads AI-assistant answers in a
desktop browser. The first release supports two sites: **ChatGPT**
(`chatgpt.com`) and **Claude** (`claude.ai`). Chrome and Firefox builds come
from one shared codebase.

## First-release scope

1. **On/off.** One clear switch. Off returns the page exactly to the
   presentation the site gives it.
2. **Paragraph-level direction.** Each paragraph, heading, list, quotation and
   table gets the base direction that fits its own text, including
   right-to-left text that begins with a left-to-right word.
3. **Explicit direction override.** Automatic, right-to-left or left-to-right,
   for when the automatic decision is unsuitable.
4. **Lists and headings.** Markers, indentation and alignment follow the
   direction of the content.
5. **Typography.** A small set of font, text-size and line-spacing choices.
6. **Local persistence.** Choices are remembered on the device and shared by
   both supported sites.

### Defaults

Readela is on after installation, **direction is Automatic**, and font, size
and line spacing are the page's own. With the defaults, the only visible
change is the direction and alignment of blocks whose text calls for it.

### Behaviour details

- **Automatic direction.** A block reads right-to-left when at least 40% of its
  words are written in a right-to-left script; otherwise left-to-right. The
  first character is not decisive. Code, mathematics and web addresses are not
  counted. A block with no words (numbers or symbols only) follows its
  surroundings.
- **Lists and tables** are decided as a unit, so markers, indentation, column
  order and text agree. A nested list is decided separately.
- **Override.** Right-to-left or left-to-right applies to all prose in the
  conversation. Code and mathematics stay left-to-right under every setting.
- **Reset** returns direction, font, size and spacing to the defaults and keeps
  the on/off state.
- **Typography choices.** Font: page default, sans-serif, serif/Naskh — from
  fonts already installed on the device. Text size: page default, 110%, 125%,
  140%. Line spacing: page default, 1.6, 1.9, 2.2.
- **One preference set.** The same choices apply on both sites; there are no
  per-site preferences in this release.

### Preserved

- Underlying text, character order and copyable content.
- English-only text; inline and block code; web addresses; mathematics.
- Links, selection, page controls and normal conversation interactions.
- The message composer and every other editable field.

Readela follows newly streamed answers and navigation between conversations.
Turning it on repeatedly stacks nothing; turning it off removes everything it
added and stops observing the page.

## Languages, sites and browsers

Persian, Arabic, Hebrew, English and mixed-script text are in scope, on
ChatGPT and Claude, in Chrome and Firefox. Support is claimed only for what
was checked; the dated evidence under `docs/evidence/` states exactly which
browser versions, sites and cases were exercised and how.

## Privacy and permissions

Readela works locally: no backend, no telemetry, no remote code, no upload of
conversation content and no runtime font download. It stores preferences only.
It requests access to `chatgpt.com` and `claude.ai` and to extension storage,
and nothing else. Details and the reason for each permission are in
[privacy-and-permissions.md](privacy-and-permissions.md).

## Distribution

Planned public distribution is the **Chrome Web Store** and **Firefox Add-ons
(AMO)**. This brief records the intent only: store submission, signing and
publication are separate steps with their own authorization, and none has
happened.

## Out of scope for the first release

- A reading-position marker (deferred to a later version by DEC-102).
- Safari. It is an accepted planned public platform for macOS and, after
  compatibility and packaging validation, iOS/iPadOS (DEC-104), to be planned
  separately; nothing in the first release implements it.
- Per-site preferences, focus modes, other websites.
- Voice transcription, AI services, translation, accounts, cloud sync,
  analytics and native applications.

## Acceptance criteria

The release is acceptable for owner evaluation when, in real Chrome and
Firefox builds, on both supported sites:

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
8. The extension makes no network request and stores preferences only.

## Accepted owner decisions reflected here

- DEC-100: product name and public repository.
- DEC-102: ChatGPT and Claude in the first release; reading-position marker
  deferred; Amir42 branding.
- DEC-103: Automatic default direction; MIT license; Firefox add-on ID;
  Chrome Web Store and Firefox AMO distribution.
- DEC-104: Safari as a planned future platform.

## Still separate from this brief

- Name clearance: a release-readiness check; a preliminary search is not
  trademark clearance.
- Store listing content, submission and the release process for each store.
