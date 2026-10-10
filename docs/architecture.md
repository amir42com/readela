# Architecture

Four small layers with plain data between them. Chrome and Firefox share all
of the code; only the manifest and one address in the stylesheet differ.
Supporting another site means adding one adapter and its host to the manifest;
the core, the popup and the preference model do not change.

```
src/core/      portable rules            no DOM, no extension API, no UI
src/page/      page integration          DOM reading and marking, site adapter
src/browser/   browser integration       extension namespace, storage, messages
src/ui/        popup                     controls over the shared preferences
src/content/   content script entry      wires storage and messages -> page
src/fonts/     packaged font             Vazirmatn and its licence
src/manifest/  base + per-browser keys
```

## Core (`src/core/`)

- `script.js` — `measureScripts(text)` returns `{ rtl, ltr }`: word counts by
  writing direction. Digits, punctuation, symbols and addresses are not
  counted.
- `direction.js` — `decideDirection(counts)` and
  `resolveDirection({ counts, mode, context })` return `"rtl"`, `"ltr"`, or
  nothing when the page should be left alone, which is always the case in the
  unchanged mode.
- `preferences.js` — the preference object (version 2), its validation
  (`normalizePreferences`, which is also the migration from version 1),
  reset, `changesPage`, the description of the packaged font, and
  `resolveTypography`, which turns choices into a font stack, a scale and a
  line height. The stored word for the unchanged state of every aspect is
  `"page"`; the popup calls it Original.
- `theme.js` — the Paper and Night palettes, the colours of the saved place,
  the WCAG contrast calculation the palettes are held to by the tests, and
  `colourAlpha`, which reads how opaque a colour is from the text a browser
  reports for it.
- `marker.js` — the saved place as data: fingerprints, the identity of a
  conversation, the record of a place, `locatePlace`, and the bounded list of
  saved places. See "Saved place" below.

Everything in and out is a string, number, boolean or plain object. The core
is tested with Node's built-in test runner and nothing else.

## Page integration (`src/page/`)

- `sites/` — one adapter per supported site, each plain data, and nothing else
  site-specific anywhere. An adapter says who owns what on the page; the
  contract is documented in `sites/index.js`:

  | Part of the page | Adapter field | Owner |
  | --- | --- | --- |
  | Application shell: navigation, headers, the composer and every editable field, controls, dialogs | `exclude` | the site; never read or changed |
  | The conversation shown | `scope`, `conversation`, `scroller` | the site; read |
  | The reader's own message | `user`, `extraBlocks` | the site for its appearance, inside and out; direction and typography follow the reading settings |
  | The text of a response | `prose` | Readela, under Paper and Night; the only place a saved place can be |
  | A code block or other unit inside a response | `capsule` (a `pre` always) | the site, as a whole |
  | A turn's identifier, a row's number | `turn`, `order` | the site; read for the saved place |

  Whatever an adapter does not name stays the site's. `siteFor(hostname)`
  selects the adapter by exact host; the manifest match patterns are exactly
  the adapters' hosts.
  - `chatgpt.js` reads direction and typography structurally (paragraph-like
    elements in the conversation region), because that site's styling class
    names change between front-end versions. The site keeps conversations
    opened earlier in the document, hidden, each with a region of its own;
    the region that is rendered is the conversation shown.
  - `claude.js` reads only inside messages and rendered-Markdown containers,
    which that site marks with stable hooks; text elsewhere on the page is
    left alone. Its transcript is a virtual list: only the rows near the
    viewport are in the document.
  - `common.js` holds what is never touched on any site: editable fields,
    controls, navigation and dialogs.
- `reader.js` — the one object that touches the page.
  - **Blocks.** It gathers each block's text, asks the core for a direction
    and marks the block; the outermost reading blocks are marked as such for
    the typography rules, whatever the direction setting. A list or quotation
    that reads against the page's direction is compared under both
    directions: if the page's indentation and border did not move, they are
    pinned to a physical side and are re-expressed on logical sides; if they
    moved, the page's own layout is left as it is.
  - **Reading surface.** Described under "Reading themes".
  - **Saved place.** Described under "Saved place".
  - **Following the page.** One `MutationObserver` batches streamed changes.
    A one-second check of the address and of which conversation region is
    rendered catches a change that came without any change to the document.
    Both run only while a reading aspect changes the page or a place is
    saved. `apply` is idempotent; `stop` removes every mark and custom
    property and disconnects everything.
- `style.js` — the whole stylesheet as text, keyed on the marks. It is static:
  without marks it has no effect. The build writes it to `content.css`.

### Reading themes

A theme is a small fixed set of rules, not a recolouring engine. Ownership
decides everything:

1. **The reading surface** is a root of response text that the adapter names
   (`prose`), and nothing else. It takes the theme's background and text
   colour, with a spread shadow of the same colour as its margin, so nothing
   moves. A root in or around a message of the reader's own, or around
   somewhere to type, is not a surface. Where the adapter recognises no root,
   nothing is coloured.
2. **Reading text** is the reading blocks directly on a surface and what is
   inside them. It takes the theme's text colour and gives up backgrounds made
   for the site's own theme. What a part of the text means stays visible
   through one token each: links (also underlined), inline code, table lines
   and header cells, the bar of a quotation, secondary text (list markers,
   small and struck text, captions), highlighted text and selected text.
   Borders are recoloured only on tables and quotations, so the lines a
   formula is drawn with keep the text's colour; a formula keeps its own font.
3. **A wrapper that only holds reading blocks** (around a table, say) is part
   of the surface. Its scrolling is untouched.
4. **Everything else in a response is a unit that stays the site's, whole**: a
   code block with its header, controls and syntax colours, a `pre`, a widget,
   an image. No rule for reading text reaches into it. The reader notes on the
   unit what it needs for that, after reading the unit's own colours once:
   - `surface` — unless the unit brings an opaque background of its own, or
     shows no text of its own (an image, a row of controls), the site's own
     measured background is put behind it, so its text stays readable;
   - `round` — in the unit's own corner radii where its shape is rounded, so
     no corner of another colour shows around it;
   - `text` — where its text takes its colour from around it, it keeps the
     site's measured text colour; a unit that sets a colour of its own keeps
     that.

   A unit with an opaque background and a colour of its own gets a bare mark
   and no rule at all. A unit whose content changes is examined again. No rule
   sets `overflow`, so nothing a unit shows outside its box is cut.

The site's own background is the first fully opaque background from the
conversation region outwards (`colourAlpha` decides; opaque black is opaque),
or the browser's page colour where nothing is painted. It is measured again
when the site changes its theme.

**Footprint in the page.** Only `data-readela-*` attributes, plus
`--readela-*` custom properties in three places: on a list or quotation whose
physical indentation has to be mirrored, on a rounded unit that keeps the
site's presentation under a theme (its corner radii), and on the root element
while a reading theme is on (the two measured site colours). No element is
added, and no text node, element structure, page-owned attribute or page-owned
style is written, which is what makes "off" exact.

### Saved place

One place per conversation, in the text of a response.

**Identity of a conversation.** The identifier is taken from the address path
by the adapter's patterns (`/c/<id>` on ChatGPT, also inside a project or a
custom assistant; `/chat/<id>` on Claude), so every route to one conversation
agrees and different conversations stay apart. A page that shows no
conversation has no identity and nothing can be saved on it. What is stored is
a fingerprint of the site and the identifier.

**The record.** Ten small values, none of them readable text:

| Field | Meaning |
| --- | --- |
| `k` | fingerprint of the site and the conversation's identifier |
| `m` | fingerprint of the identifier the site gives the turn that holds the response, or null |
| `s` | where `m` is null: fingerprint of all of the response's block fingerprints |
| `t` | kind of block: paragraph, list item, heading, cell, other |
| `f` | fingerprint of the block's text |
| `i` | the block's position in its response |
| `b`, `a` | fingerprints of the blocks before and after it in the response, or null at an edge |
| `n` | the row number the site gives the response, or null |
| `p` | where the block was along the conversation, in thousandths |

A fingerprint is a 64-bit one-way hash. These are local matching metadata; they
are neither anonymisation nor encryption.

**Finding it (`locatePlace`).** A place is trusted only inside the response it
was saved in.

- The response is the one whose turn carries the saved identifier. Without an
  identifier, it is the one response that is unchanged as a whole (and whose
  row number, where there is one, does not contradict the saved one).
  Identical text in any other response is never a candidate.
- In that response the saved block is the only block with its text and kind,
  or, among several, the only one whose two neighbours also agree: `exact`.
- If the block's text is gone, the response is identified by the site and
  exactly one block stands between the two unchanged neighbours:
  `approximate`.
- Otherwise there is no place: `absent` (the response is not on the page),
  `ambiguous` (identical candidates), or `changed`. A position or a row number
  never decides; they are hints for where to look.

**Saving.** The block is the readable block that holds a selection in view,
otherwise the first readable block of a response at the top of the reading
area that is not under something the site keeps on top; a paragraph that
begins above the area counts. Readable means paragraph-like, with text, larger
than an element kept only for screen readers, not hidden, and outside every
kept unit. A place that could not be told from an identical one is not saved.

**Returning.** Only when the reader chooses Return:

1. If the place is on the page it is scrolled into view.
2. If its response is not on the page, the conversation's own scrolling
   region is searched: first towards the place by row number where the site
   numbers rows, then outwards from where the place was when it was saved, in
   stops of four fifths of the region's height. After each stop the reader
   waits for the page to settle and asks again, reading only the responses'
   identifiers until the right one is there.
3. Limits: at most 40 stops and 12 seconds; a stop waits at least 120 ms, up
   to 360 ms for a first change, then for 100 ms of quiet, at most 700 ms. If
   five stops in a row bring nothing new into the document, only the two ends
   of the conversation are still tried.
4. The search ends at once when the reader does anything (wheel, touch,
   pointer or key), when the conversation changes and when Readela is turned
   off; then nothing more is moved.
5. Unless the place was found or the reader took over, the conversation is put
   back where it was.
6. A return is reported only after the place has been looked up again and is
   seen in view (within 2.5 seconds of scrolling to it).

A place that is not found stays saved. Nothing but Clear, or saving another
place in the same conversation, removes it.

**Keeping it shown.** While a place is saved the mark is kept on its block: it
is looked for again when its element is replaced, when the text in it changes,
and when the conversation changes.

## Browser integration (`src/browser/`)

- `api.js` resolves the extension namespace (`browser` or `chrome`) and
  detects an invalidated extension context.
- `storage.js` loads, saves and watches the two stored objects, the
  preferences and the saved places, in local extension storage.
  `changeMarks` is the only way the places are written: it reads the stored
  object, applies one change, writes, reads again and answers with what is
  stored. A tab therefore never writes back a copy it took earlier, and
  nothing is shown or reported as saved or cleared before the browser has
  stored it. A failed read or write rejects. (Two tabs writing within the same
  few milliseconds can still interleave; this storage has no transaction.)
- `messages.js` is the one exchange between the popup and a page. Settings
  never travel this way: the popup saves, and the content script reacts to the
  stored change. A saved place belongs to the conversation in one tab, so the
  popup asks the content script of the active tab to report, save, return or
  clear. `tabs.query` for the active tab and `tabs.sendMessage` to a tab that
  runs this extension's content script need no permission. The content script
  answers only requests from this extension, and each answer is given when it
  is true.

There is no background script.

## UI (`src/ui/`)

A popup of native controls: a switch, radio groups presented as segmented
controls, buttons and one link. Reading settings come first (Appearance, Font,
Text size, Line spacing, Text direction), then the saved place, then Reset and
the publisher and version. A selected choice is a raised segment with an
outline and heavier text; the keyboard focus is a separate ring in the accent
colour. The popup reads and writes the shared preferences and sends the
saved-place requests. Its link to the publisher's site is an ordinary link that
opens a new tab; nothing is requested until it is followed.

## Packaged font

`src/fonts/` holds the official Vazirmatn Non-Latin variable font and its
licence; `src/fonts/README.md` records the upstream version, file and digests.
The stylesheet declares one `@font-face` for Arabic-script characters only.
The browser loads the file from the extension itself, and only when such text
is shown in Readela Sans. For a page to use it, the file is the manifest's one
web-accessible resource, limited to the two supported hosts.

## Browser differences

| | Chrome | Firefox |
| --- | --- | --- |
| Manifest | `minimum_chrome_version` | `browser_specific_settings.gecko` (ID, minimum version, data-collection declaration); `author` and `developer`, which Chrome does not use |
| Font address in `content.css` | spelled out with the extension's identifier (`__MSG_@@extension_id__`), because a relative address is resolved against the page | relative, because it is resolved against the stylesheet |
| Code | identical | identical |

## Build

`scripts/build.mjs` bundles the content script and popup script into classic
scripts (content scripts cannot be ES modules), writes `content.css` from
`style.js`, copies static files, the font and its licence, and merges the
manifest. Output is not minified. `scripts/lib/zip.mjs` writes deterministic
archives.

## Reuse outside the browser extension

A client on another platform can reuse `src/core/` as-is wherever it can run
JavaScript modules, or implement the same small contract (`measureScripts`,
`resolveDirection`, the preference object, the palettes, the saved place) in
its own language. Everything in `src/page/`, `src/browser/` and `src/ui/` is
tied to the DOM and the extension APIs and does not carry over: reading the
host application's text, applying direction, colours and typography, storing
preferences and presenting controls are platform-specific work.
