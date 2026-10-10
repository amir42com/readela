# Privacy and permissions

The reusable engineering baseline this project follows has no rule for
browser-extension permissions or privacy, so the controls below are
project-local. They are requirements on every change, not a description of one
release. The feature the reader knows as a bookmark is called the saved place
here and in the code.

## Permissions requested

| Manifest entry | Why it is needed | What it does not allow |
| --- | --- | --- |
| `content_scripts` matching `https://chatgpt.com/*` and `https://claude.ai/*` | Read the conversation text on the page to decide direction and to find the saved place, and add presentation attributes. Both browsers show this as access to data on these two sites. | Any other site, and any subdomain of these two. There is no all-sites pattern, no wildcard host and no `host_permissions` entry. |
| `storage` | Remember the reader's preferences and saved places in the browser's local extension storage. | Synchronisation to an account (`storage.sync` is not used). |

Nothing else is requested: no `tabs`, `activeTab`, `scripting`, `webRequest`,
clipboard, microphone, notifications, context menus, alarms or native
messaging.

The match patterns are exactly the hosts of the site adapters in
`src/page/sites/`; a test fails if the manifest and the adapters disagree or if
anything broader is requested.

Firefox builds declare `data_collection_permissions: { "required": ["none"] }`.

## Other manifest entries with a trust effect

| Manifest entry | Why it is needed | Effect and limit |
| --- | --- | --- |
| `commands`: `bookmark`, with a description and no `suggested_key` | One command the reader may give a key in the browser's own shortcut settings: bookmark the reading position, or update the bookmark. | It is not a permission and causes no install prompt. It has no key unless the reader assigns one; the browser stores the key, refuses what it does not allow and delivers the command. Readela ships no default key, records no key and listens for none in the page. A test fails if a key is suggested or a second command appears. |
| `background`: one file, `background.js` (a service worker in Chrome, a script that is not kept running in Firefox) | A command is delivered to an extension's background, not to a page; the file passes it on to the page in the active tab. | It registers one listener, for the command. It keeps no state, sets no timer, makes no request, stores nothing and uses no permission; the browser starts it for the command and lets it go. It reaches a tab only through the message described below, which a page answers only if it runs this extension's content script. A test fails if it gains another listener, a timer, a network call or a use of storage. |
| `web_accessible_resources`: `fonts/Vazirmatn-NL-wght.woff2`, `fonts/InterVariable.woff2` and `fonts/InterVariable-Italic.woff2`, for `https://chatgpt.com/*` and `https://claude.ai/*` | A page can use a font from the extension only if the file is web-accessible. These are the packaged fonts of Readela Sans. | It is not a permission and causes no install prompt. Those two sites, and no other, can request these three files; like the presentation attributes, that lets them notice that Readela is installed. The files are public fonts and reveal nothing about the reader. A test fails if any other resource or host is listed. |

## Messages between the extension's own pages and a page

The popup asks the content script in the active tab about the saved place
(report, save, return, clear), and the background component asks it to save
when the browser delivers the command. They use `tabs.query` for the active
tab and `tabs.sendMessage`, which need no permission; without the `tabs`
permission neither can read a tab's address or title, and neither needs to. A
message carries one word. The answer carries a status word and the name of the
supported site, and is given when it is true: a place is reported as saved
once the browser has stored it, and as reached once it is seen in view. The
content script ignores messages that do not come from this extension. Settings
are never sent this way. The number of saved places the popup shows is read by
the popup from the extension's own storage, not from a page.

## Data handling

- **Processed in memory, never stored or sent:** the text of the conversation,
  read to count words by script and to fingerprint reading blocks, and the
  conversation's address path and the identifiers the site writes on its turn
  elements, read to recognise the conversation and the response a place is in.
  On Claude only message content is read; on ChatGPT, paragraph-like text in
  the conversation shown. A conversation the site keeps in the document but
  hidden is not read. While every reading aspect is Original and no place is
  saved, the conversation is not read.
- **Read in memory outside the conversation, never stored or sent:** the
  address path of the conversation links in the site's own lists (the
  sidebar), to tell which of them have a saved place. The path gives the
  conversation's identifier, which is fingerprinted and compared with the
  stored places. A link's title and text are not read. Only while Readela is
  on.
- **Key presses:** none are read. The page code listens for no particular
  key, and the popup has no field that takes one. A search for a place stops
  when the reader presses any key, without looking at which.
- **Stored — preferences:** one object under the key `readela.preferences` —
  on/off, direction mode, reading theme, font, size, spacing and a format
  version. Unknown fields are dropped before saving. The same object serves
  both sites.
- **Stored — saved places:** one object under the key `readela.marks` with a
  format version (2), written when the reader bookmarks, updates or removes,
  and in the one case described below: at most 1000 places, one per
  conversation. At that number a place for a further conversation is refused
  and the reader is told; no place is removed to make room. A place is ten
  values, and for some places an eleventh:
  - fingerprints of: the site with the conversation's identifier; the
    identifier the site gives the turn that holds the response (or, where the
    site gives none, of the whole response's block fingerprints); the saved
    block's text; the text of the block before it and of the block after it;
  - the kind of block (paragraph, list item, heading, cell, other), its
    position in its response, the row number the site gives the response where
    it gives one, and where the block was along the conversation, in
    thousandths;
  - only on a site whose list of conversations carries addresses that do not
    name the conversation the page shows (Claude): a fingerprint of the
    address path of the conversation's own row in that list, so the row can
    be recognised again. It is written when the reader bookmarks or updates.
    It is also written once without a button being pressed: when the list
    shows which row is this conversation's (the only row the site marks as
    the one shown, seen so twice) and the stored place names none or another.
    Nothing else about the place changes then.

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
   on the root element while a reading theme or Readela Sans is on).
4. Text nodes and page-owned attributes are never written. The site's own
   theme setting and preferences are never changed.
5. Editable fields — the composer, text areas, inputs and anything
   `contenteditable` — are never read or marked, on any site, and a response
   that holds one never becomes a reading surface.
6. The only third-party assets are the packaged fonts, both official and
   unmodified: the Inter variable fonts (upright and italic) and the Vazirmatn
   Non-Latin variable font, each under the SIL Open Font License 1.1, with
   each licence file beside them in every package and each upstream version,
   file and SHA-256 recorded in `src/fonts/README.md`. Nothing is downloaded
   at run time; the stylesheet names no other resource. The icons are
   generated by `scripts/make-icons.mjs` from original geometry.
7. Development dependencies (the bundler and the browser-automation library)
   are not part of the packaged extension.
8. Adding a permission, a match pattern, a web-accessible resource, a stored
   field, a message or a network request requires updating this document and
   the Product Brief in the same change.
9. Readela does work in a page only while it has something to keep current.
   Off, and with every aspect Original and nothing bookmarked, it observes
   nothing and runs no timer. Otherwise it observes changes to the document
   and hears a change of address from the browser; only where the browser
   does not report one (Firefox before version 147) does it compare the
   address with the one last seen once a second, while the page is in view.
   What is typed into an editable field is dropped unread as it arrives. The measurements behind this are in the dated
   evidence, and `test/perf/run.mjs` repeats them.
10. Readela scrolls the page only when the reader chooses Return, and only the
   conversation's own scrolling region. It scrolls to a place it trusts. Where
   the response the place is in is not on the page, it may first search that
   region in a bounded number of stops and a bounded time (the limits are in
   [architecture.md](architecture.md)); the search stops at once when the
   reader scrolls, clicks, touches or presses a key, when the conversation
   changes and when Readela is turned off, and unless it found the place or
   the reader took over it puts the conversation back where it was. On a site
   that loads the earlier part of a conversation when its beginning is shown,
   that search can make the site load it, exactly as the reader's own
   scrolling there would. Nothing is typed, clicked or submitted, and no other
   part of the page is operated.
11. Under a reading theme Readela colours only the text of responses, which
    the site adapter names. The reader's own messages, the application shell
    and any structure the adapter does not recognise keep the site's
    presentation.
12. Outside the conversation Readela marks one thing: the link of a
    conversation that has a saved place, in the site's own lists, with one
    attribute from which the stylesheet draws a small bookmark. The link's
    text, address, behaviour and layout are not changed, and the bookmark
    takes no pointer input. No title or address of a conversation is stored
    for it; turning Readela off removes it.
13. The browser's command does what the popup's Bookmark button does and
    nothing else, through the same function in the page. Whether it has a
    key, and which, is the reader's choice in the browser's own settings.

## How these are verified

- **Source review:** a search of `src/` for the APIs in controls 1–3; the
  result is recorded in the dated evidence under `docs/evidence/`.
- **Contract tests:** `test/page/sites.test.mjs` checks the manifest against
  the site adapters, the permissions, the one command without a key, the one
  background file and what it may contain, that the page code names no key,
  the web-accessible resources (the packaged fonts and nothing else), the
  exclusion of editable fields and the application shell on every site, and
  that the popup names the one outside address as a plain link; `test/page/style.test.mjs` checks that the
  stylesheet names only the packaged fonts, that every rule is keyed on a
  Readela mark, that a row of the site's lists gets a bookmark and nothing
  else, and that no rule for reading text reaches into a unit that stays the
  site's; `test/core/marker.test.mjs` checks that a place holds fingerprints
  and small numbers only, that anything else is dropped, the matching rules,
  and that nothing is dropped at the limit;
  `test/browser/storage.test.mjs` checks that a failed write stores nothing
  and that one tab does not overwrite another's place;
  `test/core/theme.test.mjs` holds the palettes to their contrast ratios.
- **Runtime check:** the end-to-end suite serves a synthetic conversation page
  for each site with no external resources, refuses and records every other
  request, and asserts that none occurred and that the only files a page took
  from the extension are the fonts; that the popup requested nothing outside
  the extension; that storage holds only the two objects above and that a
  saved place contains no readable text, address or site identifier; that a
  hidden conversation is not read; that the command saves through the same
  path as the popup and that no key pressed in the page saves anything; that
  only the rows of saved conversations are marked, on both sites, and that
  Off removes the marks; that a settled page, in view or out of it, on or
  off, runs no code of the extension's at all (read from a trace, in
  Chrome); and that a search stops on the reader's input and at its limits. On the real sites, requests are attributed by initiator so
  the page's own traffic is not mistaken for the extension's.

Public source makes these claims inspectable. It is not by itself a security
guarantee.
