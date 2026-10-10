# Privacy and permissions

The reusable engineering baseline this project follows has no rule for
browser-extension permissions or privacy, so the controls below are
project-local. They are requirements on every change, not a description of one
release.

## Permissions requested

| Manifest entry | Why it is needed | What it does not allow |
| --- | --- | --- |
| `content_scripts` matching `https://chatgpt.com/*` and `https://claude.ai/*` | Read the conversation text on the page to decide direction and to find the saved place, and add presentation attributes. Both browsers show this as access to data on these two sites. | Any other site, and any subdomain of these two. There is no all-sites pattern, no wildcard host and no `host_permissions` entry. |
| `storage` | Remember the reader's preferences and saved places in the browser's local extension storage. | Synchronisation to an account (`storage.sync` is not used). |

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

The popup asks the content script in the active tab about the saved place
(report, save, return, clear). It uses `tabs.query` for the active tab and
`tabs.sendMessage`, which need no permission; without the `tabs` permission
the popup cannot read a tab's address or title, and does not need to. A
message carries one word. The answer carries a status word and the name of the
supported site, and is given when it is true: a place is reported as saved
once the browser has stored it, and as reached once it is seen in view. The
content script ignores messages that do not come from this extension. Settings
are never sent this way.

## Data handling

- **Processed in memory, never stored or sent:** the text of the conversation,
  read to count words by script and to fingerprint reading blocks, and the
  conversation's address path and the identifiers the site writes on its turn
  elements, read to recognise the conversation and the response a place is in.
  On Claude only message content is read; on ChatGPT, paragraph-like text in
  the conversation shown. A conversation the site keeps in the document but
  hidden is not read. While every reading aspect is Original and no place is
  saved, the page is not read.
- **Stored — preferences:** one object under the key `readela.preferences` —
  on/off, direction mode, reading theme, font, size, spacing and a format
  version. Unknown fields are dropped before saving. The same object serves
  both sites.
- **Stored — saved places:** one object under the key `readela.marks` with a
  format version (2), written only when the reader saves or clears a place:
  at most 100 places, one per conversation. A place is ten values:
  - fingerprints of: the site with the conversation's identifier; the
    identifier the site gives the turn that holds the response (or, where the
    site gives none, of the whole response's block fingerprints); the saved
    block's text; the text of the block before it and of the block after it;
  - the kind of block (paragraph, list item, heading, cell, other), its
    position in its response, the row number the site gives the response where
    it gives one, and where the block was along the conversation, in
    thousandths.

  A fingerprint is a 64-bit one-way hash shown as 16 hexadecimal digits. No
  readable message content, title, prompt, response, page address, site
  identifier or page snapshot is stored. Unknown fields are dropped before
  saving, and so are entries in an earlier format. These values are local
  matching metadata. They are not anonymisation and not encryption: a
  fingerprint cannot be turned back into its text, but someone who can already
  read the browser's extension storage on the device could test a guess
  against it, which matters for short, guessable text and for identifiers they
  already know.
- **How the places are written:** each save and clear reads the stored object,
  changes one conversation's entry, writes it and reads it back. A tab never
  writes back a copy it read earlier, so a place saved in another tab is not
  lost; and nothing is shown or reported as saved or cleared before the
  browser has stored it. A lookup that fails never removes a place.
- **Sent anywhere:** nothing. The extension has no backend and makes no
  network request.

## Controls

1. No network API in shipped code (`fetch`, `XMLHttpRequest`, `WebSocket`,
   `sendBeacon`, `EventSource`), and no address other than the match patterns
   and the publisher's address `https://amir42.com`, which appears twice: as
   the homepage in the manifest metadata and as one link in the popup. The
   link is an ordinary link that opens a new tab when the reader follows it;
   opening the popup requests nothing.
2. No remote or dynamic code: no `eval`, `new Function`, remote script or
   remote stylesheet. All code and styles are packaged files.
3. No unsafe HTML insertion: no `innerHTML`, `outerHTML`,
   `insertAdjacentHTML` or `document.write`, and no element is added to the
   page. The page is changed only through `data-readela-*` attributes and
   `--readela-*` custom properties (on a mirrored list or quotation, on a
   rounded unit that keeps the site's presentation under a reading theme, and
   on the root element while a reading theme is on).
4. Text nodes and page-owned attributes are never written. The site's own
   theme setting and preferences are never changed.
5. Editable fields — the composer, text areas, inputs and anything
   `contenteditable` — are never read or marked, on any site, and a response
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
9. Readela scrolls the page only when the reader chooses Return, and only the
   conversation's own scrolling region. It scrolls to a place it trusts. Where
   the response the place is in is not on the page, it may first search that
   region in a bounded number of stops and a bounded time (the limits are in
   [architecture.md](architecture.md)); the search stops at once when the
   reader scrolls, clicks, touches or presses a key, when the conversation
   changes and when Readela is turned off, and unless it found the place or
   the reader took over it puts the conversation back where it was. Nothing is
   typed, clicked or submitted, and no other part of the page is operated.
10. Under a reading theme Readela colours only the text of responses, which
    the site adapter names. The reader's own messages, the application shell
    and any structure the adapter does not recognise keep the site's
    presentation.

## How these are verified

- **Source review:** a search of `src/` for the APIs in controls 1–3; the
  result is recorded in the dated evidence under `docs/evidence/`.
- **Contract tests:** `test/page/sites.test.mjs` checks the manifest against
  the site adapters, the permissions, the single web-accessible resource, the
  exclusion of editable fields and the application shell on every site, and
  that the popup names the one outside address as a plain link;
  `test/page/style.test.mjs` checks that the stylesheet names only the
  packaged font, that every rule is keyed on a Readela mark and that no rule
  for reading text reaches into a unit that stays the site's;
  `test/core/marker.test.mjs` checks that a place holds fingerprints and small
  numbers only, that anything else is dropped, and the matching rules;
  `test/browser/storage.test.mjs` checks that a failed write stores nothing
  and that one tab does not overwrite another's place;
  `test/core/theme.test.mjs` holds the palettes to their contrast ratios.
- **Runtime check:** the end-to-end suite serves a synthetic conversation page
  for each site with no external resources, refuses and records every other
  request, and asserts that none occurred and that the only file a page took
  from the extension is the font; that the popup requested nothing outside the
  extension; that storage holds only the two objects above and that a saved
  place contains no readable text, address or site identifier; that a hidden
  conversation is not read; and that a search stops on the reader's input and
  at its limits. On the real sites, requests are attributed by initiator so
  the page's own traffic is not mistaken for the extension's.

Public source makes these claims inspectable. It is not by itself a security
guarantee.
