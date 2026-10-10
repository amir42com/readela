# Privacy and permissions

The reusable engineering baseline this project follows has no rule for
browser-extension permissions or privacy, so the controls below are
project-local. They are requirements on every change, not a description of one
release.

## Permissions requested

| Manifest entry | Why it is needed | What it does not allow |
| --- | --- | --- |
| `content_scripts` matching `https://chatgpt.com/*` and `https://claude.ai/*` | Read the conversation text on the page to decide direction and to find the reading mark, and add presentation attributes. Both browsers show this as access to data on these two sites. | Any other site, and any subdomain of these two. There is no all-sites pattern, no wildcard host and no `host_permissions` entry. |
| `storage` | Remember the reader's preferences and reading marks in the browser's local extension storage. | Synchronisation to an account (`storage.sync` is not used). |

Nothing else is requested: no `tabs`, `activeTab`, `scripting`, `webRequest`,
clipboard, microphone, notifications or native messaging, and there is no
background script.

The match patterns are exactly the hosts of the site adapters in
`src/page/sites/`; a test fails if the manifest and the adapters disagree or if
anything broader is requested.

Firefox builds declare `data_collection_permissions: { "required": ["none"] }`.

## Other manifest entries with a trust effect

| Manifest entry | Why it is needed | Effect and limit |
| --- | --- | --- |
| `web_accessible_resources`: `fonts/Vazirmatn-NL-wght.woff2`, for `https://chatgpt.com/*` and `https://claude.ai/*` | A page can use a font from the extension only if the file is web-accessible. This is the packaged font of Readela Sans. | It is not a permission and causes no install prompt. Those two sites, and no other, can request this one file; like the presentation attributes, that lets them notice that Readela is installed. The file is a public font and reveals nothing about the reader. A test fails if any other resource or host is listed. |

## Messages between the popup and a page

The popup asks the content script in the active tab about the reading mark
(report, set, go, clear). It uses `tabs.query` for the active tab and
`tabs.sendMessage`, which need no permission; without the `tabs` permission
the popup cannot read a tab's address or title, and does not need to. A
message carries one word. The answer carries a status word and the name of the
supported site. The content script ignores messages that do not come from this
extension. Settings are never sent this way.

## Data handling

- **Processed in memory, never stored or sent:** the text of the conversation,
  read to count words by script and to fingerprint reading blocks. On Claude
  only message content is read; on ChatGPT, paragraph-like text in the main
  region. While every reading aspect is Original and no reading mark is saved,
  the page is not read.
- **Stored — preferences:** one object under the key `readela.preferences` —
  on/off, direction mode, reading theme, font, size, spacing and a format
  version. Unknown fields are dropped before saving. The same object serves
  both sites.
- **Stored — reading marks:** one object under the key `readela.marks`,
  written only when the reader marks a place: at most 100 marks, one per
  conversation. A mark is five values: a fingerprint of the conversation's
  host and path, fingerprints of the marked paragraph's text and of the
  paragraphs before and after it, and the paragraph's position number. A
  fingerprint is a 64-bit one-way hash shown as 16 hexadecimal digits. No
  readable message content, page address, site name or history is stored.
  Unknown fields are dropped before saving. A fingerprint cannot be turned
  back into its text; someone who can already read the browser's extension
  storage on the device could test a guess against it, which matters only for
  very short, guessable text.
- **Sent anywhere:** nothing. The extension has no backend and makes no
  network request.

## Controls

1. No network API in shipped code (`fetch`, `XMLHttpRequest`, `WebSocket`,
   `sendBeacon`, `EventSource`), and no address other than the match patterns
   and the homepage address in the manifest metadata.
2. No remote or dynamic code: no `eval`, `new Function`, remote script or
   remote stylesheet. All code and styles are packaged files.
3. No unsafe HTML insertion: no `innerHTML`, `outerHTML`,
   `insertAdjacentHTML` or `document.write`, and no element is added to the
   page. The page is changed only through `data-readela-*` attributes and
   `--readela-*` custom properties (on a mirrored list or quotation, and on the
   root element while a reading theme is on).
4. Text nodes and page-owned attributes are never written. The site's own
   theme setting and preferences are never changed.
5. Editable fields — the composer, text areas, inputs and anything
   `contenteditable` — are never read or marked, on any site, and a container
   that holds one never becomes a reading surface.
6. The only third-party asset is the packaged font: the official, unmodified
   Vazirmatn Non-Latin variable font under the SIL Open Font License 1.1, with
   its licence file beside it in every package and its upstream version, file
   and SHA-256 recorded in `src/fonts/README.md`. Nothing is downloaded at
   run time; the stylesheet names no other resource. The icons are generated by
   `scripts/make-icons.mjs` from original geometry.
7. Development dependencies (the bundler and the browser-automation library)
   are not part of the packaged extension.
8. Adding a permission, a match pattern, a web-accessible resource, a stored
   field, a message or a network request requires updating this document and
   the Product Brief in the same change.
9. Readela scrolls the page only when the reader chooses Go to mark, and only
   to a place found by text fingerprint.

## How these are verified

- **Source review:** a search of `src/` for the APIs in controls 1–3; the
  result is recorded in the dated evidence under `docs/evidence/`.
- **Contract tests:** `test/page/sites.test.mjs` checks the manifest against
  the site adapters, the permissions, the single web-accessible resource and
  the exclusion of editable fields on every site; `test/page/style.test.mjs`
  checks that the stylesheet names only the packaged font and that every rule
  is keyed on a Readela mark; `test/core/marker.test.mjs` checks that a mark
  holds fingerprints only and that anything else is dropped;
  `test/core/theme.test.mjs` holds the palettes to their contrast ratios.
- **Runtime check:** the end-to-end suite serves a synthetic conversation page
  for each site with no external resources, refuses and records every other
  request, and asserts that none occurred and that the only file a page took
  from the extension is the font; it also asserts that storage holds only the
  two objects above and that a saved mark contains no readable text or
  address. On the real sites, requests are attributed by initiator so the
  page's own traffic is not mistaken for the extension's.

Public source makes these claims inspectable. It is not by itself a security
guarantee.
