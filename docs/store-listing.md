# Store listing kit — Readela 0.2.0

One source for everything entered into the Chrome Web Store and Firefox
Add-ons (AMO) dashboards. Every statement here must stay true of the packaged
extension; when the product changes, this file, the privacy policy and the
manifest change in the same release. Dashboard field names and limits are
confirmed on the live dashboards at submission time.

## Shared product truth

| | |
| --- | --- |
| Name as shown | Readela by Amir42 (manifest `name`; `short_name` Readela) |
| Version | 0.2.0 |
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
| Firefox add-on ID | readela@amir42.com |
| Price | Free |

### Short summary (one sentence)

Makes mixed right-to-left and left-to-right text easier to read on ChatGPT and
Claude, within the original page.

### Description

Readela makes multilingual answers easier to read on ChatGPT and Claude.

Answers that mix Persian, Arabic or Hebrew with English often come out with the
wrong paragraph direction: a sentence that starts with an English word is laid
out left-to-right, list markers land on the wrong side and punctuation jumps to
the wrong end. Readela decides the direction of each paragraph from its whole
text and presents it accordingly, without changing the text itself.

What it does

- Reads each paragraph, heading, list, quotation and table right-to-left when
  most of its words are in a right-to-left script, whatever the first word is.
- Keeps lists and tables consistent as a unit: markers, indentation and column
  order follow the text.
- Leaves code, inline code, mathematics and web addresses left-to-right, in
  their own font.
- Lets you override the direction (automatic, right-to-left, left-to-right)
  and choose a font, text size and line spacing from the toolbar popup.
- Remembers your settings on this device, for both sites.
- Off means off: the page returns exactly to the site's own presentation.

What it does not do

- It does not send anything anywhere. Readela has no server, makes no network
  request, and includes no analytics, advertising or remote code.
- It does not store conversation content. The only thing it saves is your own
  settings, in the browser's local extension storage.
- It does not touch the message composer or any other editable field, and it
  never changes the text you select or copy.

Works on chatgpt.com and claude.ai only. Font choices use fonts already
installed on your device; nothing is downloaded. The source code is public
under the MIT license at github.com/amir42com/readela, and the privacy policy
is published there.

### Core features (short list)

1. Automatic per-paragraph reading direction for mixed-script text.
2. Lists, headings, quotations and tables aligned with their content.
3. Code, maths and links kept left-to-right.
4. Direction override, font, text size and line spacing.
5. Local settings only; no network, no tracking, exact off switch.

### Permission justification (shared wording)

- **Site access to chatgpt.com and claude.ai:** Readela runs a content script
  on these two sites only, to read the conversation text on the page and
  decide the reading direction of each block, and to add presentation markers.
  No other site is accessed and no wildcard host is requested.
- **storage:** to remember the reader's settings (on/off, direction mode,
  font, text size, line spacing) in the browser's local extension storage.

### Reviewer notes (shared wording)

Readela is a content-script extension with a popup; there is no background
script, no network access and no account. To test: install, open any
conversation on chatgpt.com or claude.ai that contains Persian, Arabic or
Hebrew text mixed with English, and toggle Readela from the toolbar popup.
Paragraphs whose words are mostly right-to-left read right-to-left, list
markers move to the right, code and links stay left-to-right; off restores the
site's own presentation. A ChatGPT conversation can be opened without an
account; Claude requires one. The repository contains two synthetic test
conversations (test/e2e/fixtures/) that reproduce each site's structure; the
listing screenshots were taken from those pages with the real extension, not
from real conversations. `npm test` runs the unit tests and `npm run test:e2e`
installs the built extension into a temporary Chrome and Firefox profile and
checks the behaviour, including that no request leaves the browser and that
only the settings object is stored.

## Chrome Web Store

### Store listing tab

| Field | Value |
| --- | --- |
| Title | from the manifest: Readela by Amir42 |
| Summary | from the manifest description (112 characters) |
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

- **Single purpose:** Readela presents multilingual text on chatgpt.com and
  claude.ai with the correct reading direction and the reader's chosen
  typography, within the original page. It does nothing else.
- **Permission justification — storage:** see shared wording.
- **Host permission justification (content script on chatgpt.com and
  claude.ai):** see shared wording.
- **Remote code:** No, I am not using remote code. All code ships in the
  package; nothing is fetched, evaluated or injected from outside it.
- **Data usage:** Readela handles **website content** only: it reads the text
  of the conversation on the two supported sites, in memory, inside the page,
  to decide reading direction. It does not collect, store or transmit it. No
  other category applies (no personally identifiable information, health,
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
| Name | Readela by Amir42 |
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

- Archive: `dist/packages/readela-0.2.0-source.zip`, written by
  `npm run source-package`: the complete tracked tree of the tagged commit
  (readable source, `package.json`, `package-lock.json`, build scripts, tests
  and documentation; no `node_modules`, caches or build output).
- Build instructions for the reviewer:

  ```sh
  unzip readela-0.2.0-source.zip
  cd readela-0.2.0-source
  npm ci
  npm run package
  ```

  Node.js 22.15 or newer with its bundled npm; esbuild 0.28.2 is the only
  build-time dependency and is installed by `npm ci` from the lockfile. The
  result `dist/firefox/` (12 files) is the content of the submitted package;
  `dist/packages/readela-0.2.0-firefox.zip` is the archive. Output is not
  minified. The build was verified on Windows 11 with Node.js 22.23.1 and
  reproduced byte-for-byte with Node.js 20.20.2; the bundler output does not
  depend on the operating system. If the archive bytes differ in another
  environment, the extracted files are what to compare.
