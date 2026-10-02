# Architecture

Four small layers with plain data between them. Chrome and Firefox share all
of the code; only the manifest differs.

```
src/core/      portable rules            no DOM, no extension API, no UI
src/page/      page integration          DOM reading and marking, site adapter
src/browser/   browser integration       extension namespace, storage
src/ui/        popup                     controls over the shared preferences
src/content/   content script entry      wires storage -> page
src/manifest/  base + per-browser keys
```

## Core (`src/core/`)

- `script.js` — `measureScripts(text)` returns `{ rtl, ltr }`: word counts by
  writing direction. Digits, punctuation, symbols and addresses are not
  counted.
- `direction.js` — `decideDirection(counts)` and
  `resolveDirection({ counts, mode, context })` return `"rtl"`, `"ltr"`, or
  nothing when the page should be left alone.
- `preferences.js` — the preference object, its validation
  (`normalizePreferences`), reset, and `resolveTypography`, which turns
  choices into a font stack, a scale and a line height.

Everything in and out is a string, number, boolean or plain object. The core
is tested with Node's built-in test runner and nothing else.

## Page integration (`src/page/`)

- `sites/chatgpt.js` — the only site-specific data: the conversation region,
  and what must never be touched. The conversation is read structurally
  (paragraph-like elements) rather than through styling class names.
- `reader.js` — gathers each block's text, asks the core for a direction and
  marks the block. One `MutationObserver` batches streamed changes. `apply`
  is idempotent; `stop` removes every mark and disconnects the observer.
- `style.js` — the whole stylesheet as text, keyed on the marks. It is static:
  without marks it has no effect. The build writes it to `content.css`.

**Footprint in the page.** Only `data-readela-*` attributes, plus
`--readela-*` custom properties on a list or quotation whose physical
indentation has to be mirrored. No text node, element structure, page-owned
attribute or page-owned style is written, which is what makes "off" exact.

## Browser integration (`src/browser/`)

`api.js` resolves the extension namespace (`browser` or `chrome`) and detects
an invalidated extension context. `storage.js` loads, saves and watches the
preference object in local extension storage. The popup and the content script
never message each other: the popup saves, the content script reacts to the
stored change. There is no background script.

## UI (`src/ui/`)

A popup of native controls that reads and writes the shared preferences.

## Browser differences

| | Chrome | Firefox |
| --- | --- | --- |
| Manifest | `minimum_chrome_version` | `browser_specific_settings.gecko` (ID, minimum version, data-collection declaration) |
| Code | identical | identical |

## Build

`scripts/build.mjs` bundles the content script and popup script into classic
scripts (content scripts cannot be ES modules), writes `content.css` from
`style.js`, copies static files and merges the manifest. Output is not
minified. `scripts/lib/zip.mjs` writes deterministic archives.

## Reuse outside the browser extension

A client on another platform can reuse `src/core/` as-is wherever it can run
JavaScript modules, or implement the same small contract (`measureScripts`,
`resolveDirection`, the preference object) in its own language. Everything in
`src/page/`, `src/browser/` and `src/ui/` is tied to the DOM and the
extension APIs and does not carry over: reading the host application's text,
applying direction and typography, storing preferences and presenting controls
are platform-specific work.
