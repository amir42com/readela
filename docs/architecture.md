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
- `theme.js` — the Paper and Night palettes, the colours of the reading mark,
  and the WCAG contrast calculation the palettes are held to by the tests.
- `marker.js` — the reading mark as data: text fingerprints, the conversation
  key, `locateMark` (exact, approximate or nothing) and the bounded list of
  saved marks.

Everything in and out is a string, number, boolean or plain object. The core
is tested with Node's built-in test runner and nothing else.

## Page integration (`src/page/`)

- `sites/` — one adapter per supported site, each plain data, and nothing else
  site-specific anywhere. The contract is documented in `sites/index.js`:
  `hosts`, `scope`, optional `within`, `surface` and `extraBlocks`, and
  `exclude`. `siteFor(hostname)` selects the adapter by exact host; the
  manifest match patterns are exactly the adapters' hosts.
  - `chatgpt.js` reads structurally (paragraph-like elements in the main
    region), because that site's styling class names change between front-end
    versions.
  - `claude.js` reads only inside messages and rendered-Markdown containers,
    which that site marks with stable hooks, and lets a reading theme colour
    rendered Markdown only; text elsewhere on the page is left alone.
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
  - **Reading surface.** Under Paper or Night it marks the container that
    directly holds a response's reading blocks as the surface. Three things
    never become a surface: the reader's own messages, a container that holds
    somewhere to type, and the parent of a block the site has taken out of the
    flow (a heading kept for screen readers). It also measures the site's own
    background and text colour and keeps that measurement current when the
    site changes its theme.
  - **Reading mark.** It lists the reading blocks (paragraph-like elements
    with text and no smaller paragraph-like element inside), fingerprints
    them, and asks the core where the saved mark is. The mark is looked for
    again when its element is replaced or the conversation changes.
  - **Following the page.** One `MutationObserver` batches streamed changes.
    It runs only while a reading aspect changes the page or a reading mark is
    saved. `apply` is idempotent; `stop` removes every mark and custom
    property and disconnects everything.
- `style.js` — the whole stylesheet as text, keyed on the marks. It is static:
  without marks it has no effect. The build writes it to `content.css`.

### Reading themes

A theme is a small fixed set of rules, not a recolouring engine:

1. The surface takes the theme's background and text colour, with a spread
   shadow of the same colour as its margin, so nothing moves.
2. Reading blocks directly on the surface, and what is inside them, take the
   theme's text colour and give up backgrounds made for the site's own theme.
   Links, inline code, table headers, separators and selected text have one
   token each.
3. Everything else directly on the surface — a code block, a widget, an image
   — and every `pre` is left as the site made it and is given the site's own
   measured background and text colour, so it is readable whichever theme the
   site is in.

Nothing outside a surface is styled. Where a structure is not recognised no
surface is marked, and the page keeps the site's presentation.

**Footprint in the page.** Only `data-readela-*` attributes, plus
`--readela-*` custom properties in two places: on a list or quotation whose
physical indentation has to be mirrored, and on the root element while a
reading theme is on (the two measured site colours). No element is added, and
no text node, element structure, page-owned attribute or page-owned style is
written, which is what makes "off" exact.

## Browser integration (`src/browser/`)

- `api.js` resolves the extension namespace (`browser` or `chrome`) and
  detects an invalidated extension context.
- `storage.js` loads, saves and watches the two stored objects, the
  preferences and the reading marks, in local extension storage.
- `messages.js` is the one exchange between the popup and a page. Settings
  never travel this way: the popup saves, and the content script reacts to the
  stored change. A reading mark belongs to the conversation in one tab, so the
  popup asks the content script of the active tab to report, set, go to or
  clear it. `tabs.query` for the active tab and `tabs.sendMessage` to a tab
  that runs this extension's content script need no permission. The content
  script answers only requests from this extension.

There is no background script.

## UI (`src/ui/`)

A popup of native controls: a switch, radio groups presented as segmented
controls, and buttons. It reads and writes the shared preferences and sends
the reading-mark requests.

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
`resolveDirection`, the preference object, the palettes, the reading mark) in
its own language. Everything in `src/page/`, `src/browser/` and `src/ui/` is
tied to the DOM and the extension APIs and does not carry over: reading the
host application's text, applying direction, colours and typography, storing
preferences and presenting controls are platform-specific work.
