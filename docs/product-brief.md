# Readela Product Brief — first release

Prepared on 2026-10-02 from the owner's stated first-release scope. Approval of
this brief, and the project's managerial status, are tracked in the managerial
system (entry ENT-196), not in this file.

## Purpose

Readela makes multilingual text easier to read within the original page. The
motivating case: a ChatGPT answer that mixes Persian and English can come out
with the wrong paragraph direction, misplaced list markers and misplaced
punctuation, and the reader ends up copying it into a word processor just to
read it. Readela removes that step.

## Users and first use case

A reader of right-to-left languages who reads ChatGPT answers in a desktop
browser. The first supported site is ChatGPT (`chatgpt.com`). Chrome and
Firefox builds come from one shared codebase.

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
6. **Local persistence.** Choices are remembered on the device.

### Defaults

Readela is on after installation, direction is automatic, and font, size and
line spacing are the page's own. With the defaults, the only visible change is
the direction and alignment of blocks whose text calls for it.

### Behaviour details

- **Automatic direction.** A block reads right-to-left when at least 40% of its
  words are written in a right-to-left script; otherwise left-to-right. The
  first character is not decisive. Code, mathematics and web addresses are not
  counted. A block with no words (numbers or symbols only) follows its
  surroundings.
- **Lists and tables** are decided as a unit, so markers, indentation, column
  order and text agree. A nested list is decided separately.
- **Override.** Right-to-left or left-to-right applies to all prose in the
  conversation area. Code and mathematics stay left-to-right under every
  setting.
- **Reset** returns direction, font, size and spacing to the defaults and keeps
  the on/off state.
- **Typography choices.** Font: page default, sans-serif, serif/Naskh — from
  fonts already installed on the device. Text size: page default, 110%, 125%,
  140%. Line spacing: page default, 1.6, 1.9, 2.2.

### Preserved

- Underlying text, character order and copyable content.
- English-only text; inline and block code; web addresses; mathematics.
- Links, selection, page controls and normal conversation interactions.
- The message composer and every other editable field.

Readela follows newly streamed answers and navigation between conversations.
Turning it on repeatedly stacks nothing; turning it off removes everything it
added and stops observing the page.

## Languages and browsers

Persian, Arabic, Hebrew, English and mixed-script text are in scope. Support is
claimed only for what was checked; the dated evidence under `docs/evidence/`
states exactly which browser versions and cases were exercised.

## Privacy and permissions

Readela works locally: no backend, no telemetry, no remote code, no upload of
conversation content and no runtime font download. It stores preferences only.
It requests access to `chatgpt.com` and to extension storage, and nothing else.
Details and the reason for each permission are in
[privacy-and-permissions.md](privacy-and-permissions.md).

## Out of scope for the first release

Voice transcription, AI services, translation, accounts, cloud sync,
analytics, reading-position markers, focus modes, other websites and native
applications. Later candidates are tracked in the managerial system.

## Acceptance criteria

The release is acceptable for owner evaluation when, in real Chrome and
Firefox builds:

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

## Owner decisions not made in this brief

These do not block a local evaluation build and are deliberately left open:

- Open-source license.
- Store distribution route and release process for each browser.
- Release identity: the Firefox add-on ID currently in the manifest
  (`readela@amir42.com`) is provisional and becomes permanent once an add-on
  is signed.
- Trademark or domain clearance for the name.
