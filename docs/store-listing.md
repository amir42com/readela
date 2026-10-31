# Store listing kit: Readela 0.4.0

One source for everything entered into the Chrome Web Store and Firefox
Add-ons (AMO) dashboards. Every statement here must stay true of the packaged
extension; when the product changes, this file, the privacy policy and the
manifest change in the same release.

This kit describes version 0.4.0. It is the copy to enter when that version is
submitted; which version and copy each store carries is recorded in the dated
evidence under `docs/evidence/`. Entering it is a publication step: it needs
the publication Gate of that stage and the owner's authorization, and nothing
in this file grants either.

Text in a block below is pasted as it stands. Dashboard labels are given as
the stores' own documentation names them; a dashboard can be relabelled
without notice, so a label is matched by what it asks for.

## Shared product truth

| | |
| --- | --- |
| Name as shown | Readela (manifest `name` and `short_name`) |
| Version | 0.4.0 |
| Publisher / developer | Amir42 |
| Author | Amir |
| Homepage | https://amir42.com |
| Source code | https://github.com/amir42com/readela |
| Support | https://github.com/amir42com/readela/issues · hello@amir42.com |
| Privacy policy | https://github.com/amir42com/readela/blob/main/docs/privacy-policy.md |
| License | MIT |
| Supported sites | chatgpt.com, claude.ai |
| Supported browsers | Chrome 121 or newer; Firefox 140 or newer (desktop); Firefox for Android 142 or newer (from 0.4.0) |
| Permissions | `storage`; content script on `https://chatgpt.com/*` and `https://claude.ai/*`. The same since 0.2.1: the update asks the reader for nothing new |
| Background component | one file, `background.js` (a service worker in Chrome, a script that is not kept running in Firefox): passes the three bookmark commands to the page and is the one writer of the stored bookmarks |
| Commands | `bookmark`, `bookmark-return`, `bookmark-remove`; no key suggested, the reader may assign one in the browser. Firefox for Android has no commands; there the bookmark is used from the popup |
| Web-accessible resources | three packaged font files, for those two sites only |
| Third-party assets | Inter (upright and italic) and Vazirmatn fonts, SIL Open Font License 1.1, both licence files in the package |
| Package | 18 files in each browser's package; code not minified |
| Chrome Web Store item | `bmdgcjmdaliachiboghdeeodlkbjojlf` |
| Firefox add-on ID | readela@amir42.com (slug `readela`) |
| Price | Free |

### Short summary (one sentence, 127 characters)

This is the manifest `description`. The Chrome Web Store takes it from the
package (limit 132 characters); on AMO it is entered as the Summary (limit
250).

```text
Comfortable reading on ChatGPT and Claude: warm Paper and Night colours, a clear font, automatic text direction and a bookmark.
```

### Description

One paragraph or list item to a line. Both stores take it as plain text; AMO
shows the lines that begin with a hyphen as a list.

```text
Readela is a lightweight reading-comfort extension for ChatGPT and Claude. It makes long responses easier on the eyes and keeps mixed-language text in order, without changing a word of the text.

What it does

- Paper and Night: warm light or warm dark reading colours for responses, whichever theme the site itself is in.
- Readela Sans: one clear reading font that comes with the extension. Inter for Latin text, Vazirmatn for Persian and Arabic.
- Text size and line spacing, three steps of each.
- Text direction: Auto reads each paragraph, list and table right-to-left or left-to-right from its own words, so Persian, Arabic or Hebrew mixed with English stays readable. RTL and LTR are there when you want to decide yourself.
- Bookmark: Save place, Return and Remove. One bookmark per conversation, to pick up a long read where you stopped.
- Optional keyboard shortcuts for the bookmark, on the desktop. You assign them in your browser's own shortcut settings; Readela sets none by default.
- Keeps code, mathematics, tables and links readable, and leaves the site's own cards, charts, polls and controls as they are.
- Every setting has an Original choice, and turning Readela off returns the page to the site's own presentation.

Privacy

- Readela processes conversation text locally in your browser. To do its job it reads the text of the conversation on the page, on chatgpt.com and claude.ai only, and uses it in memory.
- The extension does not transmit conversation content and keeps none of it in readable form. It has no server, no analytics, telemetry or tracking, no advertising and no remote code, and it makes no network request of its own.
- Only your preferences and your bookmarks are stored, locally on your device. A bookmark is kept as short fingerprints (hashes) and position numbers, not as your text, a title or an address.
- ChatGPT and Claude are separate services: your conversations are sent to and handled by them under their own privacy policies, with or without Readela. Readela does not change that.
- Permissions: access to chatgpt.com and claude.ai, and local storage. Nothing else.
- Open source under the MIT license: github.com/amir42com/readela

Works on chatgpt.com and claude.ai, in Chrome and Firefox on the desktop and in Firefox for Android. Readela is an independent project and is not affiliated with OpenAI or Anthropic.
```

### Core features (short list)

1. Paper and Night reading colours for responses.
2. Readela Sans: Inter for Latin text and Vazirmatn for Persian and Arabic,
   packaged with the extension.
3. Text size and line spacing.
4. Automatic text direction for each paragraph, list and table of mixed-script
   text, with RTL and LTR to choose by hand.
5. One bookmark per conversation, kept on the device: Save place, Return,
   Remove; optional shortcuts the browser manages.
6. Code, mathematics and the site's own components kept as they are; an
   Original choice for every setting; an exact off switch.
7. Local processing in the browser; the extension makes no network request
   and has no tracking or remote code.

### Release notes for 0.4.0

Entered on AMO as the version's release notes. The Chrome Web Store has no
field for them.

```text
Readela 0.4.0 brings Readela to Firefox for Android.

- New: Firefox for Android 142 or newer. Paper and Night, Readela Sans, text size and spacing, text direction and the bookmark work on ChatGPT and Claude conversations, from the Readela menu.
- Keyboard shortcuts for the bookmark stay a desktop feature: a phone has none.
- No new permission. Readela still makes no network request.
```

The release notes of 0.3.0 are in this file at tag `v0.3.0`.

### Screenshots

Five images of 1280x800 and one tile of 440x280, 24-bit PNG without
transparency, under `docs/store-images/`. They are uploaded in this order;
the first is the one a store shows before the others.

| Order | File | Caption (AMO has a caption field; the Chrome Web Store has none) |
| --- | --- | --- |
| 1 | `01-comfortable-reading.png` | A response in Paper and Readela Sans, beside the Readela popup. |
| 2 | `02-paper-and-readela-sans.png` | The same response as the page shows it, and in Paper with Readela Sans. |
| 3 | `03-night.png` | Night: warm light text on a dark page, in English, Persian and Arabic. |
| 4 | `04-text-direction.png` | Text direction as the page gives it, and with Auto. |
| 5 | `05-bookmark.png` | A saved place in a conversation, its bookmark in the list of conversations, and the popup. |
| tile | `promo-small-440x280.png` | not a screenshot: the small promotional tile of the Chrome Web Store. Unchanged since 0.2.0 |

What they are, so that no one takes them for more:

- Every capture inside an image is the built 0.3.0 Chrome extension at work
  (0.4.0 changes nothing that the images show)
  in a temporary browser profile: the reading colours, the font, the
  direction, the saved place, the bookmarks in the list and the popup are
  what the extension rendered, under the settings the label names. The
  bookmarks were saved with the popup's own button.
- The pages are synthetic. They were written for the listing
  (`scripts/lib/store-pages.mjs`), carry the structure of the two sites that
  the site adapters look for, and are served at addresses the extension
  matches. They are not the sites, they use no logo or artwork of either, and
  their text is not a conversation anyone had: it says what the README says
  Readela does. Each image says so in its last line.
- The frame around the captures (the heading, one line under it, the labels
  Original and the settings over a comparison) is added by
  `scripts/store-images.mjs`. Nothing is added inside a capture.
- A capture is taken at one and a half device pixels to a CSS pixel, in a
  small window, so that the page's 16-pixel text is 24 pixels in the image.
  The Chrome Web Store shows screenshots at half size; `npm run store-images`
  also writes each at 640x400 and one sheet of all of them to
  `dist/store-images/` for checking that they still read.
- `npm run build` and then `npm run store-images` make them again.

### Permission justification (shared wording)

Storage:

```text
Readela keeps two things in the browser's local extension storage, on the user's device: the reader's settings (on or off, appearance, text direction, font, text size, line spacing) and the reader's bookmarks (at most 1000, one per conversation). A bookmark is a set of 64-bit hash fingerprints and small position numbers; it holds no readable text, title or address. Nothing is synchronised to an account or transmitted.
```

Host permission (the content script on chatgpt.com and claude.ai):

```text
Readela's content script runs on https://chatgpt.com/* and https://claude.ai/* only. It reads the conversation text shown on the page, in memory, to decide the reading direction of each paragraph, to apply the reading colours, font, text size and line spacing the reader chose, and to find the paragraph the reader bookmarked. It reads the address of conversation links in the site's own list only to mark the conversations that have a bookmark. It changes the page through attributes of its own, transmits nothing, and requests no other site and no wildcard host.
```

Not permissions, and asked about by neither store, but named here so a
reviewer finds them explained:

- **Web-accessible resources:** `fonts/InterVariable.woff2`,
  `fonts/InterVariable-Italic.woff2` and `fonts/Vazirmatn-NL-wght.woff2` are
  made available to chatgpt.com and claude.ai only, so that their pages can
  display text in Readela Sans. Nothing else is web-accessible.
- **Commands:** three, without a suggested key.
- **Background component:** one file; what it does is under Reviewer notes.

### Reviewer notes (shared wording)

AMO's field for notes to the reviewer takes at most 3,000 characters; these
notes and the source paragraph under Source code submission fit together.

```text
Readela 0.4.0: a content script on https://chatgpt.com/* and https://claude.ai/*, a popup and a small background script. No account, server or network access; code not minified.

New since 0.3.0: the Firefox package declares Firefox for Android 142+ (browser_specific_settings.gecko_android). Android has no commands API, so background.js now adds its command listener only where browser.commands exists, and the popup hides its shortcut help there. Permissions are unchanged: storage and the content script on the two sites.

background.js passes the three bookmark commands (no suggested key) to the active tab and is the only writer of the stored bookmarks. No timer, no request.

Fonts: three unmodified OFL font files (Inter 4.1, Vazirmatn 33.003) are web-accessible to the two sites only; licences in fonts/.

How to test, on desktop or Android:
1. Open a conversation on chatgpt.com or claude.ai (claude.ai needs an account; the extension needs no credentials).
2. In the Readela popup choose Paper or Night, Readela Sans, a text size and spacing: response text changes; code and site controls do not.
3. Ask for a Persian or Arabic answer with English terms: with Direction Auto, right-to-left paragraphs read right-to-left.
4. Save place, scroll away, Return, Remove.
5. Switch Readela off: the page returns to the site's presentation.

Data: text is read in memory only. Storage holds readela.preferences and readela.marks (64-bit hashes and positions, no text, title or address). The popup and background ask the tab with tabs.sendMessage; pages ask the background with runtime.sendMessage; only messages from this extension are accepted.
Screenshots show synthetic test pages (scripts/lib/store-pages.mjs).
```

## Chrome Web Store

Item `bmdgcjmdaliachiboghdeeodlkbjojlf`, in the Developer Dashboard at
https://chrome.google.com/webstore/devconsole. The dashboard does not accept
browser automation, so every step is the owner's, typed in the owner's
signed-in session. Edits stay a draft until **Submit for review**; the public
item keeps showing 0.2.1 until the new version is published.

Do the tabs in this order.

### 1. Package tab

| Field | Action |
| --- | --- |
| Upload new package | Upload `readela-0.4.0-chrome.zip`, the archive built from the frozen commit, whose SHA-256 is the one in the release evidence. The dashboard then shows the draft version 0.4.0 |

The title (Readela) and the summary come from the package and need no
typing. After the upload, check that the summary shown on the Store listing
tab is the Short summary above.

### 2. Store listing tab

| Section | Field | Action |
| --- | --- | --- |
| Product details | Description | Replace all of it with the Description above |
| Product details | Category | Leave as it is: Accessibility |
| Product details | Language | Leave as it is: English |
| Graphic assets | Store icon | Leave as it is (128x128; the icon did not change) |
| Graphic assets | Screenshots | Remove the four screenshots of 0.2. Upload `docs/store-images/01-comfortable-reading.png`, `02-paper-and-readela-sans.png`, `03-night.png`, `04-text-direction.png`, `05-bookmark.png`, in that order; drag to reorder if the dashboard shows them otherwise |
| Graphic assets | Small promo tile | Leave as it is (`promo-small-440x280.png`, unchanged) |
| Graphic assets | Marquee promo tile, video | Leave empty |
| Additional fields | Official URL | Leave unset |
| Additional fields | Homepage URL | Leave as it is: https://amir42.com |
| Additional fields | Support URL | Leave as it is: https://github.com/amir42com/readela/issues |
| Additional fields | Mature content | Leave off |

### 3. Privacy practices tab

| Field | Action |
| --- | --- |
| Single purpose description | Replace with the text below |
| Permission justification: storage | Replace with the Storage text above |
| Permission justification: host permission | Replace with the Host permission text above |
| Remote code | "No, I am not using remote code" (unchanged) |
| Data usage: what the item collects | **Website content** ticked, and nothing else (unchanged) |
| Data usage: the three certifications | All three ticked (unchanged) |
| Privacy policy URL | Leave as it is: https://github.com/amir42com/readela/blob/main/docs/privacy-policy.md |

Single purpose description:

```text
Readela makes long and multilingual responses on chatgpt.com and claude.ai comfortable to read within the original page: reading colours, typography, text direction, and a bookmark for where the reader stopped. It does nothing else.
```

Why the data-usage answers stay as they are:

- **Website content** is ticked because Readela reads the text of the
  conversation on the two sites. It does so in the page, in memory; it does
  not transmit it and stores none of it in readable form. The dashboard's
  word is "collects"; the box is ticked because the content is handled, and
  the privacy policy says exactly how.
- **Web history** is not ticked: Readela keeps no list of pages visited. A
  bookmark is made only when the reader asks for one, in the conversation
  open at that moment, and holds a hash fingerprint of that conversation's
  identifier, not its address or title.
- **User activity** is not ticked: Readela records no clicks, scrolling,
  pointer position or keys. A search for a bookmark stops when the reader
  scrolls, clicks or presses a key, without looking at which.
- **Personally identifiable information, health, financial and payment,
  authentication, personal communications, location:** none is handled as
  such. A conversation can contain anything its writer put in it; Readela
  treats all of it as website content, in the way described.
- The certifications: no sale or transfer of user data to third parties
  outside the approved use cases; no use or transfer for purposes unrelated
  to the single purpose; no use or transfer to determine creditworthiness or
  for lending. All three hold: Readela transmits nothing, so it has nothing
  to sell, transfer or use elsewhere. The exact wording of the boxes is read
  from the dashboard.

### 4. Distribution tab

No change: public, all regions, free, no in-app purchases.

### 5. Test instructions tab

No username or password. The field for further instructions takes at most
500 characters, so it gets this shorter text (494 characters), not the
Reviewer notes:

```text
No account or credentials are needed for the extension. To test: open a conversation on chatgpt.com (a signed-out chat works) or claude.ai. In the Readela toolbar popup choose Paper or Night, Readela Sans, a text size and spacing. Ask for Persian or Arabic mixed with English: with Direction Auto those paragraphs read right-to-left; code and links stay left-to-right. Save place, scroll away, Return, Remove. Off restores the site's presentation. Source and tests: github.com/amir42com/readela
```

### 6. Submit

**Submit for review** opens a dialog with a checkbox that publishes the item
by itself as soon as the review passes. With it ticked, passing review is
publication. With it cleared, the reviewed version waits and is published by
the owner's own click, within 30 days of passing; after that the submission
goes back to a draft. Which of the two is the owner's decision at the
publication Gate. Until the new version is published, people who have
Readela keep 0.2.1 and the public page does not change; when it is, their
browsers update by themselves, and since the permissions are the same no one
is asked to approve anything.

## Firefox Add-ons (AMO)

Add-on `readela`, in the Developer Hub at
https://addons.mozilla.org/developers/addon/readela/. On AMO a listed
version that passes the automatic checks can be public within minutes of
**Submit Version**: that button is the publication, not a draft. Edits to the
product page are public as soon as they are saved.

### 1. New version

Manage Status & Versions, then Upload a New Version.

| Step | Action |
| --- | --- |
| Upload | `readela-0.4.0-firefox.zip`, the archive built from the frozen commit, whose SHA-256 is the one in the release evidence |
| Compatibility | Tick Firefox and Firefox for Android. The check on a real phone is recorded in `docs/evidence/2026-10-31-readela-firefox-for-android.md`. The manifest's `gecko_android` entry sets the Android range, which AMO then shows as locked |
| Validation | Read the result. Errors stop the submission; warnings are read and recorded |
| Source code | "Yes": upload `readela-0.4.0-source.zip` (see Source code submission) |
| Release notes | The Release notes for 0.4.0 above |
| Notes to reviewer | The Reviewer notes above, followed by the paragraph under Source code submission |
| Submit Version | The publication step |

### 2. Product page

Edit Product Page, after the new version is public, so that the page never
describes what the public version does not do.

| Field | Action |
| --- | --- |
| Name | Leave as it is: Readela |
| Add-on URL (slug) | Leave as it is: readela |
| Summary (max 250 characters) | Replace with the Short summary above |
| Description | Replace with the Description above |
| Categories (Firefox desktop, up to two) | Leave as they are: Language Support; Appearance |
| Experimental | No |
| Requires payment | No |
| License | Leave as it is: MIT License |
| Privacy policy | Replace with the text of `docs/privacy-policy.md` as it is on `main` |
| Homepage | Leave as it is: https://amir42.com |
| Support email | Leave as it is: hello@amir42.com |
| Support site | Leave as it is: https://github.com/amir42com/readela/issues |
| Icon | Leave as it is (the icon did not change) |
| Screenshots | Delete the three screenshots of 0.2. Upload the five of the table above in order, each with its caption |

Data collection: the manifest declares
`data_collection_permissions.required: ["none"]`, which Firefox shows at
installation as collecting no data. It is true of 0.4.0: Readela transmits
nothing, so it collects nothing in Mozilla's sense of the word. It uses the
conversation text in the page and passes it on to no one; what the site
itself does with a conversation is the site's.

### Source code submission

The packaged `content.js`, `background.js` and `popup/popup.js` are produced
by esbuild from the ES modules under `src/`, and `content.css` by the build
script from `src/page/style.js`, so the source archive is submitted with the
package.

- Archive: `dist/packages/readela-0.4.0-source.zip`, written by
  `npm run source-package`: the complete tracked tree of the frozen commit
  (readable source, `package.json`, `package-lock.json`, build scripts, tests
  and documentation; no `node_modules`, caches or build output). Its bytes
  name the commit it was made from, so it is made from the frozen commit and
  from no other.
- For the notes to the reviewer:

  ```text
  Source: the attached archive is the complete repository tree of the release commit, also public at https://github.com/amir42com/readela (tag v0.4.0).

  To build:
    unzip readela-0.4.0-source.zip
    cd readela-0.4.0-source
    npm ci
    npm run package

  Requires Node.js 22.15 or newer with its bundled npm. The build was verified on Windows 11 with Node.js 22.23.1 and gave the same bytes with Node.js 20.20.2; no step is specific to an operating system. npm ci installs exactly the versions in package-lock.json. The build uses esbuild 0.28.2 and nothing else; the other two development dependencies (puppeteer-core, @puppeteer/browsers) drive browsers in the tests and take no part in the build. The output is not minified.

  Result: dist/firefox/ (18 files) is the content of the submitted package, and dist/packages/readela-0.4.0-firefox.zip is the archive. The archive is written with sorted entries and a fixed timestamp, so the same files give the same bytes; if the archive bytes differ in another environment, the extracted files are what to compare. The fonts under fonts/ are copied unchanged from src/fonts/, where README.md records their upstream sources, versions and SHA-256 digests.
  ```
