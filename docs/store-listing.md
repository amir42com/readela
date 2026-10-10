# Store listing kit — Readela 0.3.0

One source for everything entered into the Chrome Web Store and Firefox
Add-ons (AMO) dashboards. Every statement here must stay true of the packaged
extension; when the product changes, this file, the privacy policy and the
manifest change in the same release. Dashboard field names and limits are
confirmed on the live dashboards at submission time.

This kit describes version 0.3.0. It is the copy to enter when that version is
submitted; which version and copy each store carries is recorded in the dated
evidence under `docs/evidence/`. The listing images under `docs/store-images/`
show the 0.2 popup and are regenerated with `npm run store-images` before a
0.3.0 submission.

## Shared product truth

| | |
| --- | --- |
| Name as shown | Readela (manifest `name` and `short_name`) |
| Version | 0.3.0 |
| Publisher / developer | Amir42 |
| Author | Amir |
| Homepage | https://amir42.com |
| Source code | https://github.com/amir42com/readela |
| Support | https://github.com/amir42com/readela/issues · hello@amir42.com |
| Privacy policy | https://github.com/amir42com/readela/blob/main/docs/privacy-policy.md |
| License | MIT |
| Supported sites | chatgpt.com, claude.ai |
| Supported browsers | Chrome 121 or newer; Firefox 140 or newer (desktop) |
| Permissions | `storage`; content script on `https://chatgpt.com/*` and `https://claude.ai/*` |
| Web-accessible resource | one packaged font file, for those two sites only |
| Third-party asset | Vazirmatn font, SIL Open Font License 1.1, licence file in the package |
| Firefox add-on ID | readela@amir42.com |
| Price | Free |

### Short summary (one sentence)

Comfortable reading on ChatGPT and Claude: automatic text direction, warm
Paper and Night colours, clear fonts and a reading mark.

### Description

In the dashboards each paragraph and each list item is entered as one line;
the line breaks inside them below are only this file's wrapping.

Readela is a lightweight reading-comfort extension for ChatGPT and Claude. It
makes long and multilingual responses easier to read without changing the
underlying text.

What it does

- Fixes paragraph direction for languages written right-to-left, such as
  Persian, Arabic and Hebrew, when mixed with English.
- Paper and Night: warm, comfortable reading colours for responses, whichever
  theme the site itself is in.
- Readela Sans: a clear font for Persian and Arabic that comes with the
  extension, so it does not depend on fonts installed on your device.
- A reading mark: mark where you stopped and come back to it later.
- Text size and line spacing.
- Keeps lists, tables, code, maths and links readable.
- Every setting has an Original choice that leaves that part of the page as
  the site shows it; turning Readela off restores the page completely.

Privacy & trust

- Open source under the MIT license: github.com/amir42com/readela
- No server, analytics, advertising or remote code.
- Conversation content is not stored or transmitted.
- Only your settings and your reading marks are stored, locally in the
  browser. A reading mark holds a one-way fingerprint, not your text.

Works on chatgpt.com and claude.ai.

### Core features (short list)

1. Automatic per-paragraph reading direction for mixed-script text.
2. Paper and Night reading colours for responses.
3. Readela Sans with a packaged Persian and Arabic font.
4. A reading mark per conversation.
5. Text size and line spacing; lists, tables, code, maths and links kept
   readable.
6. Local only; no network, no tracking, exact off switch.

### Permission justification (shared wording)

- **Site access to chatgpt.com and claude.ai:** Readela runs a content script
  on these two sites only, to read the conversation text on the page and
  decide the reading direction of each block, and to add presentation markers.
  No other site is accessed and no wildcard host is requested.
- **storage:** to remember, in the browser's local extension storage, the
  reader's settings (on/off, direction mode, reading appearance, font, text
  size, line spacing) and the reading marks the reader sets (one-way
  fingerprints and a position number; no readable text or address).
- **Web-accessible resource (not a permission):** the packaged font file
  `fonts/Vazirmatn-NL-wght.woff2` is made available to chatgpt.com and
  claude.ai only, so that their pages can display Persian and Arabic text in
  it. Nothing else is web-accessible.

### Reviewer notes (shared wording)

Readela is a content-script extension with a popup; there is no background
script, no network access and no account. To test: install, open any
conversation on chatgpt.com or claude.ai that contains Persian, Arabic or
Hebrew text mixed with English, and toggle Readela from the toolbar popup.
Paragraphs whose words are mostly right-to-left read right-to-left, list
markers move to the right, code and links stay left-to-right; off restores the
site's own presentation. Paper and Night colour the response text area only.
Readela Sans shows Persian and Arabic in the packaged Vazirmatn font
(`fonts/Vazirmatn-NL-wght.woff2`, SIL Open Font License 1.1, licence in
`fonts/OFL.txt`); it is the only web-accessible resource and nothing is
fetched from the network. Mark here, Go to mark and Clear send a one-word
message from the popup to the content script of the active tab
(`tabs.sendMessage`, no `tabs` permission). A ChatGPT conversation can be
opened without an account; Claude requires one. The repository contains two synthetic test
conversations (test/e2e/fixtures/) that reproduce each site's structure; the
listing screenshots were taken from those pages with the real extension, not
from real conversations. `npm test` runs the unit tests and `npm run test:e2e`
installs the built extension into a temporary Chrome and Firefox profile and
checks the behaviour, including that no request leaves the browser and that
only the settings and the reading marks are stored.

## Chrome Web Store

### Store listing tab

| Field | Value |
| --- | --- |
| Title | from the manifest: Readela |
| Summary | from the manifest description (130 characters) |
| Description | the Description above |
| Category | Accessibility (fallback: Functionality & UI) |
| Language | English |
| Store icon | icons/icon-128.png from the package (128x128 PNG) |
| Screenshots (1280x800) | docs/store-images/01-chatgpt-readela-on.png, 02-chatgpt-readela-off.png, 03-claude-readela-on.png, 04-popup-and-page.png |
| Small promo tile (440x280) | docs/store-images/promo-small-440x280.png |
| Marquee promo tile | not provided (optional) |
| Homepage URL | https://amir42.com |
| Support URL | https://github.com/amir42com/readela/issues |
| Official URL | left unset (requires site verification; not needed for this release) |

### Privacy practices tab

- **Single purpose:** Readela makes long and multilingual text on chatgpt.com
  and claude.ai comfortable to read within the original page: reading
  direction, reading colours, typography and a mark for where the reader
  stopped. It does nothing else.
- **Permission justification — storage:** see shared wording.
- **Host permission justification (content script on chatgpt.com and
  claude.ai):** see shared wording.
- **Remote code:** No, I am not using remote code. All code ships in the
  package; nothing is fetched, evaluated or injected from outside it.
- **Data usage:** Readela handles **website content** only: it reads the text
  of the conversation on the two supported sites, in memory, inside the page,
  to decide reading direction and to recognise a paragraph the reader marked.
  It does not collect or transmit it, and stores none of it in readable form:
  a reading mark is a set of one-way fingerprints kept in local extension
  storage. No other category applies (no personally identifiable information, health,
  financial or authentication information, personal communications, location,
  web history or user activity is handled).
- **Certifications:** Readela does not sell or transfer user data to third
  parties outside the approved use cases; does not use or transfer user data
  for purposes unrelated to its single purpose; does not use or transfer user
  data to determine creditworthiness or for lending purposes. (Exact checkbox
  wording is read from the dashboard at submission time.)
- **Privacy policy URL:**
  https://github.com/amir42com/readela/blob/main/docs/privacy-policy.md

### Distribution tab

Visibility Public; all regions; free; no in-app purchases.

### Test instructions

Reviewer notes above. No credentials are provided or needed for ChatGPT.

## Firefox Add-ons (AMO)

| Field | Value |
| --- | --- |
| Name | Readela |
| Add-on URL (slug) | readela |
| Summary (max 250 characters) | the Short summary above |
| Description | the Description above |
| Categories (Firefox desktop, up to two) | Language Support; Appearance |
| Compatibility | Firefox desktop only. Firefox for Android is not declared: it has not been tested and is not claimed. |
| Experimental | No |
| Requires payment | No |
| License | MIT License |
| Privacy policy | the text of docs/privacy-policy.md, pasted into the listing, with the repository URL |
| Homepage | https://amir42.com |
| Support email | hello@amir42.com |
| Support site | https://github.com/amir42com/readela/issues |
| Icon | icons/icon-128.png (uploaded as the listing icon; AMO scales it) |
| Screenshots | 01-chatgpt-readela-on.png, 04-popup-and-page.png, 03-claude-readela-on.png |
| Data collection declaration | `data_collection_permissions.required: ["none"]` in the manifest; the listing states that no data is collected or transmitted |
| Notes to reviewer | Reviewer notes above, plus the source-code paragraph below |

### Source code submission

The packaged `content.js` and `popup/popup.js` are produced by esbuild from the
ES modules under `src/`, so the source archive is submitted with the package.

- Archive: `dist/packages/readela-0.3.0-source.zip`, written by
  `npm run source-package`: the complete tracked tree of the tagged commit
  (readable source, `package.json`, `package-lock.json`, build scripts, tests
  and documentation; no `node_modules`, caches or build output).
- Build instructions for the reviewer:

  ```sh
  unzip readela-0.3.0-source.zip
  cd readela-0.3.0-source
  npm ci
  npm run package
  ```

  Node.js 22.15 or newer with its bundled npm; esbuild 0.28.2 is the only
  build-time dependency and is installed by `npm ci` from the lockfile. The
  result `dist/firefox/` (14 files) is the content of the submitted package;
  `dist/packages/readela-0.3.0-firefox.zip` is the archive. Output is not
  minified. The build was verified on Windows 11 with Node.js 22.23.1 and
  reproduced byte-for-byte with Node.js 20.20.2; the bundler output does not
  depend on the operating system. If the archive bytes differ in another
  environment, the extracted files are what to compare.
