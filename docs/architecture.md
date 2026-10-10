# Architecture

Four small layers with plain data between them. Chrome and Firefox share all
of the code; only the manifest and one address in the stylesheet differ.
The feature the reader knows as a **bookmark** is called the saved place in
the code and in this document: one place per conversation.
Supporting another site means adding one adapter and its host to the manifest;
the core, the popup and the preference model do not change.

```
src/core/      portable rules            no DOM, no extension API, no UI
src/page/      page integration          DOM reading and marking, site adapter
src/browser/   browser integration       extension namespace, storage, messages
src/ui/        popup                     controls over the shared preferences
src/content/   content script entry      wires storage and messages -> page
src/background/ background component     passes the browser's one command to a page
src/fonts/     packaged fonts            Inter, Vazirmatn and their licences
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
  reset, `changesPage`, the description of the packaged fonts, and
  `resolveTypography`, which turns choices into a font stack, a scale and a
  line height. The stored word for the unchanged state of every aspect is
  `"page"`; the popup calls it Original. Line spacing is 1.5, 1.75 or 2.0;
  the 1.6, 1.9 and 2.2 of earlier builds of this version are read as those.
- `theme.js` — the Paper and Night palettes, the colours of the saved place,
  the WCAG contrast calculation the palettes are held to by the tests, and
  `colourAlpha`, which reads how opaque a colour is from the text a browser
  reports for it.
- `marker.js` — the saved place as data: fingerprints, the identity of a
  conversation, the record of a place, `locatePlace`, the bounded list of
  saved places with its rule at the limit (`canSave`), and `indexMarks`,
  which lets the reader ask for a conversation's place at the same cost
  however many are stored. See "Saved place" below.

Everything in and out is a string, number, boolean or plain object. The core
is tested with Node's built-in test runner and nothing else.

## Page integration (`src/page/`)

- `sites/` — one adapter per supported site, each plain data, and nothing else
  site-specific anywhere. An adapter says who owns what on the page; the
  contract is documented in `sites/index.js`:

  | Part of the page | Adapter field | Owner |
  | --- | --- | --- |
  | Application shell: navigation, headers, the composer and every editable field, controls, dialogs | `exclude` | the site; never read or changed, with the one exception below |
  | The links of conversations in the site's own lists | `rows`, `rowShown`, `rowPlacement` | the site; the address path of a link is read, and the link of a conversation with a saved place gets one attribute |
  | The conversation shown | `scope`, `conversation`, `scroller` | the site; read |
  | The reader's own message | `user`, `extraBlocks` | the site for its appearance, inside and out; direction and typography follow the reading settings |
  | The text of a response | `prose` | Readela, under Paper and Night; the only place a saved place can be |
  | A code block or other unit inside a response | `capsule` (a `pre` always) | the site, as a whole |
  | Inline code the site renders without a code element | `token` | presented as inline code; not counted as words of the sentence |
  | A turn's identifier, a row's number | `turn`, `order` | the site; read for the saved place |

  Whatever an adapter does not name stays the site's. `siteFor(hostname)`
  selects the adapter by exact host; the manifest match patterns are exactly
  the adapters' hosts.
  - `chatgpt.js` reads direction and typography structurally (paragraph-like
    elements in the conversation region), because that site's styling class
    names change between front-end versions. The site keeps conversations
    opened earlier in the document, hidden, each with a region of its own;
    the region that is rendered is the conversation shown. Its inline code
    is a span, not a `code` element, which the adapter names as `token`.
  - `claude.js` reads only inside messages and rendered-Markdown containers,
    which that site marks with stable hooks; text elsewhere on the page is
    left alone. Its transcript is a virtual list: only the rows near the
    viewport are in the document. Most rows of its sidebar carry an address
    that does not name the conversation the page then shows; see "Saved
    conversations in the site's lists".
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
  - **Following the page.** Described under "What runs, and when".
    `apply` is idempotent; `stop` removes every mark and custom property
    and releases everything the reader holds.
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
   through tokens of its own: links (also underlined); inline code, keyboard
   and sample text, the same on every site (a text colour at 7:1 or better on
   a ground tinted away from the surface, inside a line at 3:1 or better
   against the surface, drawn inside the box so nothing moves; an outline in
   the system's text colour where colours are forced); table lines and header
   cells; the bar of a
   quotation; secondary text (list markers, small and struck text, captions);
   highlighted text and selected text.
   Borders are recoloured only on tables and quotations, so the lines a
   formula is drawn with keep the text's colour; a formula keeps its own font.
3. **A wrapper that only holds reading blocks** (around a table, say) is part
   of the surface, at whatever width the site gives it. Where it is wider than
   the text, the outermost wrapper carries the surface with it: the surface's
   ground, the surface's margin to its two sides and the surface's corners, so
   no strip or square corner shows beyond the text. Wrappers inside it paint
   nothing. Nothing is clipped and its scrolling is untouched.
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
(the two measured site colours while a reading theme is on, the measured site
font while Readela Sans is on). The attributes are on elements of the
conversation (one of them, `data-readela-token`, on what a site renders as
inline code without a `code` element), on the root element, and, as the one
mark outside the conversation, on the sidebar links of conversations that
have a saved place.
No element is added, and no text node, element structure, page-owned attribute
or page-owned style is written, which is what makes "off" exact.

### Saved place

One place per conversation, in the text of a response.

**Identity of a conversation.** The identifier is taken from the address path
by the adapter's patterns (`/c/<id>` on ChatGPT, also inside a project or a
custom assistant; `/chat/<id>` on Claude), so every route to one conversation
agrees and different conversations stay apart. A page that shows no
conversation has no identity and nothing can be saved on it. What is stored is
a fingerprint of the site and the identifier.

**The record.** Ten small values, and for some places an eleventh, none of
them readable text:

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
| `r` | only where the site needs it: fingerprint of the address path of the conversation's row in the site's list (see "Saved conversations in the site's lists"). A place without it is stored without the field |

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

**Saving.** A selection in view says exactly which block: the readable block
that holds it. Without one, the block is the first readable block of a
response that begins clearly in the reading area, so the reader sees all of
what was saved; a block that only reaches into view from above is passed over.
Only where no block begins in view (one long paragraph fills the screen) is it
the block being read at the top. Readable means paragraph-like, with text,
larger than an element kept only for screen readers, not hidden, and outside
every kept unit. A place that could not be told from an identical one is not
saved.

**The reading area.** It is the conversation's scrolling region less whatever
the site keeps over its top and bottom edges, less 8px. A cover is found from
the page's geometry, not by asking what a pointer would hit, because a header
can lie over the text and let the pointer through: a positioned element
(fixed, sticky, or absolute outside the scrolled content) that lies within 8px
of an edge of the region, spans at least 30% of its width and at most 40% of
its height. No site's header height is written down anywhere. Something
painted behind the text can be taken for a cover; the only cost is a place a
little further down.

**Capacity.** A thousand conversations can have a place. At the limit a place
for a further conversation is refused; a conversation that has one can still
move or remove it. No place is dropped to make room.

**Returning.** Only when the reader chooses Return:

1. If the place is in the document, it is brought into view.
2. If its response is not in the document, the conversation's own scrolling
   region is searched. Positions are distances from the beginning of the
   conversation whichever way the site lays it out: a region laid out from its
   end (ChatGPT) counts `scrollTop` from 0 at the end into negative numbers,
   and a positive value does nothing there.
   - Where the site numbers its rows (Claude), at most ten jumps go straight
     towards the saved row; the number only says which way and roughly how
     far.
   - Then a walk in the direction the place is expected in (by row number, or
     by where the place was when it was saved), and after that in the other,
     each from where the reader was. A walk goes one stretch at a time. A
     stretch ends at the edge of the unbroken run of turns the site has in the
     document on that side, so nothing lies between two stops that was never
     in the document; where nothing is, it is four fifths of a screen.
   - At the beginning of what is loaded, the page is given 2.5 seconds to load
     what came before (ChatGPT loads a few earlier turns each time its
     beginning is shown). If the conversation grows, the walk goes on.
   - After each stop the reader waits for the page to settle (at least 120 ms,
     up to 360 ms for a first change, then 100 ms of quiet, at most 700 ms)
     and asks again, reading only the turns' identifiers until the right one
     is there.
3. Limits: 90 stops and 30 seconds. Thirty seconds reach back in the order of
   a hundred turns on a site that loads its earlier part a few turns at a
   time; what was loaded stays loaded, so a second Return goes further.
4. The search ends at once when the reader does anything (wheel, touch,
   pointer or key), when the conversation changes and when Readela is turned
   off; then nothing more is moved.
5. Unless the place was found or the reader took over, the conversation is put
   back where it was.
6. Arrival: the block is placed with its beginning a fifth of the reading area
   (at most 120px) below the top of that area, so it is clear of the site's
   header and some of what precedes it stays in view; a block taller than the
   room begins at the top of the area. A return is reported only after the
   place has been looked up again and begins clearly in the reading area; the
   placement is corrected up to three times where the page moves it.

A place that is not found stays saved. Nothing but Remove, or saving another
place in the same conversation, removes it.

The end of the scrolling region is where the position says so within two
pixels, or where a move no longer moves: a browser reports the region's size
in whole pixels and its position in parts of one, so the two rarely agree
exactly.

**Keeping it shown.** While a place is saved the mark is kept on its block: it
is looked for again when its element is replaced, when the text in it changes,
and when the conversation changes.

**Saved conversations in the site's lists.** The link of a conversation that
has a saved place gets `data-readela-saved`, and the stylesheet draws a small
filled bookmark, about 8 by 14 pixels, at the start of its row from it: a
pseudo-element of the link, positioned in the row, taking no part in the
row's layout and no pointer input. It is the same bookmark on every site;
where a site's row leaves no room before its text the adapter says so
(`rowPlacement: "edge"`) and the bookmark sits 4px further out, on the row's
edge. Rows are found by the hook the adapter names (`rows`). A link whose
row is not the box it is positioned in is left unmarked. Off removes every
mark. A row is recognised in one of two ways:

- **By its address.** Where the address path of the link names the
  conversation (ChatGPT; older conversations on Claude), it gives the
  conversation's identifier and from it the same key the place is stored
  under.
- **By the site's own mark on the row shown.** Claude lists most
  conversations under an address that does not name them
  (`/cowork/cse_<id>` for a conversation shown at `/chat/<uuid>`), and
  nothing in the page ties the two. There the adapter names how the site
  marks the row of the conversation shown (`rowShown`:
  `aria-current="page"`), and a one-way fingerprint of that row's address
  path is kept with the place (`r`). A row whose fingerprint a stored place
  names is marked. The fingerprint is written when the reader bookmarks or
  updates, and once more by itself when the list shows which row is this
  conversation's and the stored place names none or another: that row has to
  be the only one marked as shown, and has to be seen so on two looks half a
  second or more apart. Only that one value of the place changes. The site's
  own navigation uses the same link hook; only links under a row of a
  conversation are rows.

No title, label or address is kept. Rows are looked at when a place is saved
or removed, when the stored places change, and when a row link is added to
the document or its address changes; not on a clock.

**Saving by the browser's command.** The manifest declares one command,
`bookmark`, with no key. The reader may give it one in the browser's own
shortcut settings; the browser stores the key, refuses combinations it does
not allow and delivers the command. The background component passes it to
the page in the active tab as one message, and the page does what the
popup's first button does, through the same function, and shows the brief
emphasis on the bookmarked paragraph once the place is stored. The page
listens for no key of its own.

### What runs, and when

Readela is meant to stay switched on, so what it runs is kept to what a
change needs:

- **Off**, and **every aspect Original with nothing bookmarked**: nothing.
  No observer, no timer, no listener; the content script waits for a change
  to what is stored.
- **Otherwise**, three things keep it current, and a settled page runs
  nothing at all where the browser reports changes of address:
  - *Changes to the document.* One `MutationObserver` on the document
    gathers them and they are handled together 60 ms later. A change in an
    editable field (what the reader types) is dropped as it arrives. Only
    what changed is looked at again: the blocks in and around it; the rows of
    the site's lists only when a row link was added or the address of one
    changed (the one attribute observed is `href`).
  - *A change of address.* A site changes conversation without loading a
    page. Where the browser reports that itself (the Navigation API's
    `currententrychange`: Chrome, and Firefox from version 147), nothing
    runs until it does. Where it does not (Firefox 140 to 146), the address
    path is compared with the one last seen on a beat, once a second, while
    the page is in view. Either way, after a change, and when the stored
    places change, the conversation region and the row shown are looked at
    on the next few beats, a second apart, and then the beats stop again
    where the browser reports changes. While the page is out of view there
    is no beat; it is looked at once when it comes back.
  - *The stored preferences and places*, as they change.
- The stored places are held as an index by conversation, built when they
  change, so asking for this conversation's place costs the same with one
  bookmark or a thousand.
- A search for a place (Return) runs only on the reader's request and ends
  by itself.
- The packaged fonts are fetched by the browser from the extension only when
  Readela Sans is on and text of that script, and in that style, is shown.
- The background component runs only for the command and holds nothing.

`docs/evidence/` records the measurements these statements rest on, and
`test/perf/run.mjs` repeats them.

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
- `messages.js` is the one exchange between the extension's own pages and a
  page. Settings never travel this way: the popup saves, and the content
  script reacts to the stored change. A saved place belongs to the
  conversation in one tab, so the popup asks the content script of the
  active tab to report, save, return or clear, and the background component
  asks it to save for the browser's command. `tabs.query` for the active tab
  and `tabs.sendMessage` to a tab that runs this extension's content script
  need no permission. The content script answers only requests from this
  extension, and each answer is given when it is true.
- `shortcut.js` names the command, reads the key the browser holds for it
  (`commands.getAll`) and opens the browser's own shortcut settings:
  `commands.openShortcutSettings` in Firefox, the page
  `chrome://extensions/shortcuts` in a new tab in Chrome. Neither needs a
  permission. Readela stores no key and offers no field to type one.

## Background component (`src/background/`)

One file, `main.js`, built to `background.js`: a service worker in Chrome, a
script that is not kept running in Firefox. It registers one listener, for
the command, and passes the command to the tab the browser names (or the
active tab of the window last in front) as the message `quick`. It keeps no
state, sets no timer, makes no request and stores nothing; the browser
starts it for the command and lets it go. A tab that is not a supported page
has no one to answer, and nothing happens.

## UI (`src/ui/`)

A popup of native controls: a switch, radio groups presented as segmented
controls, buttons and one link. Reading settings come first (Appearance, Font,
Text size, Line spacing, Text direction), then the bookmark, then Reset and
the publisher and version. A selected choice is a raised segment with an
outline and heavier text; the keyboard focus is a separate ring in the accent
colour. The popup reads and writes the shared preferences and sends the
saved-place requests. The section is headed Bookmark. Its first button reads
Bookmark where this conversation has none and Update where it has one, and
Return and Remove are available only then, so the state is said by the
buttons and not in words. Beside the heading is the number of conversations
that have a bookmark, on both sites together, read from what is stored. One
line says what a bookmark is, and one says which key the browser holds for
the command, with a control that opens the browser's shortcut settings. Its link to the publisher's site is
an ordinary link that opens a new tab; nothing is requested until it is
followed.

## Packaged fonts

`src/fonts/` holds the official Inter variable fonts (upright and italic), the
official Vazirmatn Non-Latin variable font and their licences;
`src/fonts/README.md` records the upstream versions, files and digests. The
stylesheet declares three `@font-face` rules, each limited by `unicode-range`
to the characters of its own script: Inter for Latin and Latin Extended,
Vazirmatn for Arabic script. A script is therefore never shown in the other's
font, and text in neither falls through to the device's fonts. The browser
loads a file from the extension itself, and only when such text is shown in
Readela Sans. For a page to use them, the three files are the manifest's
web-accessible resources, limited to the two supported hosts.

Readela Sans applies to reading text. Code, keyboard input, sample text and
mathematics are left to their own fonts, and a unit the site presents as a
whole is given the site's own font back, which the reader measures on the
conversation region.

## Browser differences

| | Chrome | Firefox |
| --- | --- | --- |
| Manifest | `minimum_chrome_version`; `background.service_worker` | `browser_specific_settings.gecko` (ID, minimum version, data-collection declaration); `author` and `developer`, which Chrome does not use; `background.scripts` |
| Shortcut settings | opened as the page `chrome://extensions/shortcuts`; the popup reads the key again each time it opens | opened by `commands.openShortcutSettings` |
| Font addresses in `content.css` | spelled out with the extension's identifier (`__MSG_@@extension_id__`), because a relative address is resolved against the page | relative, because it is resolved against the stylesheet |
| Code | identical | identical |

## Build

`scripts/build.mjs` bundles the content script, the popup script and the
background component into classic scripts (content scripts cannot be ES
modules), writes `content.css` from
`style.js`, copies static files, the fonts and their licences, and merges the
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
