# Readela

**Readela by Amir42** — a small reading-comfort extension that makes long and
multilingual text easier to read within the original page. It supports ChatGPT
(`chatgpt.com`) and Claude (`claude.ai`), in Chrome and Firefox.

Mixed right-to-left and left-to-right answers often come out with the wrong
paragraph direction: a Persian sentence that starts with an English word is
laid out left-to-right, list markers land on the wrong side and punctuation
jumps to the wrong end. Readela decides the direction of each paragraph from
its whole text and presents it accordingly, without changing the text. Around
that it offers warm reading colours, a packaged reading font for Latin,
Persian and Arabic text, text size and line spacing, and a saved place for
where you stopped.

Readela is distributed through the Chrome Web Store and Firefox Add-ons
(AMO). The dated evidence under `docs/evidence/` records which version was
submitted to which store and what each store reported; the managerial system
owns the current release status. The packages in this repository can also be
built and loaded for development, as described below.

## What it does

- **On/off switch.** Off shows the page exactly as the site presents it and
  keeps your settings and saved places.
- **Every setting has an Original choice** that leaves that part of the page
  as the site shows it.
- **Appearance:** Original, Paper or Night. Warm light or warm dark reading
  colours for the text of responses, whichever theme the site itself is in.
  Your own messages, the site's navigation and controls, and code blocks stay
  as the site shows them. Links, inline code, lists, quotations and tables
  stay distinct; primary text is held at a contrast ratio of 10:1 or better.
- **Font:** Original or Readela Sans. Readela Sans shows Latin text in Inter
  and Persian and Arabic in Vazirmatn, both packaged with the extension, with
  their own italic and bold; other scripts use your device's sans-serif
  fonts.
- **Text size** (up to 140%) and **line spacing.**
- **Text direction:** Original, Auto, RTL or LTR. Auto is the default:
  paragraphs, headings, lists, quotations and tables read right-to-left when
  at least 40% of their words are in a right-to-left script, whatever the
  first word is. Lists and tables are decided as a unit, so markers,
  indentation and column order agree with the text.
- **Saved place:** Save place, Return and Clear, one place per conversation,
  kept on this device. Save place takes the first paragraph of a response
  that begins in view, below the site's header, or the paragraph you selected
  text in. Alt+Shift+S on the page does the same without opening the popup,
  except while you are typing. Return goes back to it, also when the site has
  not loaded that part of the conversation yet, and never to a look-alike
  paragraph somewhere else: if the place cannot be found for certain, nothing
  moves, the popup says so, and the place stays saved. The popup shows
  whether this conversation has a place and how many do, and a conversation
  that has one gets a small bookmark in the site's own list. Up to 1000
  conversations can have a place; none is ever removed to make room.
- **Remembers your choices** on this device, for both sites.

Code blocks, inline code, mathematics and web addresses stay left-to-right and
keep their own font. The message composer and other editable fields are never
touched. The underlying text, selection and copying are unchanged.

## What has been checked

Automated checks of version 0.3.0, in Chrome 154.0.8037.98 and Firefox 157.0
on Windows 11:

| | ChatGPT | Claude |
| --- | --- | --- |
| Synthetic conversation page: direction for Persian, Arabic, Hebrew, English, mixed | passed in both browsers | passed in both browsers (Persian, English, mixed) |
| Synthetic conversation page: Paper and Night (who owns what, code blocks, links, lists, quotations, tables), Readela Sans | passed in both browsers, page light and dark | passed in both browsers (light and dark in Chrome, light in Firefox) |
| Synthetic conversation page: saved place (identical paragraphs, routes, reload, browser restart, failed save, status and count, bookmark in the list, limit of 1000, Alt+Shift+S) | passed in both browsers (failed save: Chrome), including a long conversation laid out from its end that loads its earlier part a few turns at a time | passed in both browsers, including a long conversation of which only the part near the viewport is in the document, under a header that lies over the text |
| Real start page, signed out, nothing sent | content script ran, nothing disturbed (a bot check in headless Chrome) | content script ran, nothing disturbed (sign-in page in Firefox, a bot check in headless Chrome) |
| Real signed-in conversation | page structure read three times, without the text, to shape the adapters and the checks; the 0.3.0 extension was not run there by the automated checks | the same |

The owner reported manually testing earlier builds on real ChatGPT and Claude
conversations and finding them working correctly. Those are reports, not part
of the automated evidence, and they predate 0.3.0.

The minimum browser versions declared in the manifests (Chrome 121, Firefox
140) have not been exercised. The exact cases, method and limits are in the
dated evidence:

- [docs/evidence/2026-10-10-readela-0.3.0-correction-2.md](docs/evidence/2026-10-10-readela-0.3.0-correction-2.md)
  (the second correction; it supersedes the first where they differ)
- [docs/evidence/2026-10-10-readela-0.3.0-correction.md](docs/evidence/2026-10-10-readela-0.3.0-correction.md)
- [docs/evidence/2026-10-10-readela-0.3.0-implementation.md](docs/evidence/2026-10-10-readela-0.3.0-implementation.md)
  (the first 0.3.0 implementation; superseded by the correction where they differ)
- [docs/evidence/2026-10-02-claude-support.md](docs/evidence/2026-10-02-claude-support.md)
- [docs/evidence/2026-10-02-first-evaluation-build.md](docs/evidence/2026-10-02-first-evaluation-build.md)

## Try it

Requirements: Node.js 22.15 or newer.

```sh
npm ci
npm run package
```

This writes two loadable directories and two archives:

```
dist/chrome/                              dist/packages/readela-0.3.0-chrome.zip
dist/firefox/                             dist/packages/readela-0.3.0-firefox.zip
```

### Chrome — load unpacked (development install)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the `dist/chrome` directory.

Chrome loads a directory, not the archive; unzip the archive first if you
received only that. This is not a Chrome Web Store installation. If the store
version of Readela is installed in the same profile, turn it off on that page
while the unpacked one is on: two copies would both mark the same page.

### Firefox — temporary add-on (development install)

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…**.
3. Select `dist/firefox/manifest.json` or the Firefox archive.

Firefox removes a temporary add-on when it restarts. The archive is **not
signed**; release versions of Firefox will not install it permanently.

### Use

Open a conversation on `chatgpt.com` or `claude.ai` and use the Readela
toolbar button to switch it on or off, to change appearance, font, size,
spacing and direction, and to save or return to a place.

### Manual check on a real conversation

On each site:

1. Ask for an answer in Persian, Arabic or Hebrew that includes English terms,
   a bulleted and a numbered list, a quotation, a code block and a formula.
2. While it streams and afterwards: paragraphs and headings that start with an
   English word read right-to-left; list markers sit on the right; code and
   the formula stay left-to-right.
3. Your own message and the composer behave as before while you type.
4. Choose Paper, then Night: only the text of responses changes colour; your
   own messages, code blocks, the composer and the site's controls stay as the
   site shows them, and no corner of another colour shows around a code block.
5. Save a place, scroll far away, choose Return; reload and do it again; close
   and reopen the browser and do it again. Try it in a long conversation, from
   above and from below the place, and on a sentence that occurs more than
   once. Try Alt+Shift+S on the page and in the composer, and look for the
   bookmark beside the conversation in the site's list.
6. Switch Readela off: the page returns to the site's own presentation.
7. Open another conversation: the new one is handled without a reload.

## Privacy and permissions

Readela works on your device. It has no backend, sends nothing anywhere, loads
no remote code or fonts, and stores only your preferences and your saved
places. A saved place holds one-way fingerprints and a few small numbers,
never your text, a title or the address of the conversation. That is matching
information kept on your device, not encryption.

| Permission | Reason |
| --- | --- |
| Access to `chatgpt.com` and `claude.ai` | Read the conversation text to decide direction, find the saved place and mark blocks for presentation. |
| `storage` | Remember preferences and saved places locally. |

Three font files, Inter (upright and italic) and Vazirmatn, are packaged with
the extension and made available to those two sites so their pages can display
them. Both fonts are distributed under the SIL Open Font License 1.1; the
licences are in every package next to the fonts, and
[src/fonts/README.md](src/fonts/README.md) records their sources, versions
and digests.

Privacy policy: [docs/privacy-policy.md](docs/privacy-policy.md). Technical
controls and how they are verified:
[docs/privacy-and-permissions.md](docs/privacy-and-permissions.md).

## Limitations

- Only `chatgpt.com` and `claude.ai` are supported. Safari is a planned future
  platform and is not supported.
- The automatic decision is a word-share rule. A paragraph split almost evenly
  between scripts can be judged differently from how you read it; use the
  override.
- RTL and LTR apply to all prose in the conversation, not to a single
  message, and preferences are shared by both sites.
- Paper and Night colour the text of responses, where Readela recognises it.
  Your own messages, the composer and the site's controls keep the site's
  colours, and so does a response in a layout Readela does not recognise. A
  code block, and anything else in a response that is not text, stays as the
  site made it, so under a theme opposite to the site's it stands out as a
  block of the site's colour. Colours the site gave to individual words are
  replaced by the theme's colours for text, links and secondary text.
- A place can be saved in a response, not in your own message. It is found
  again only in the response it was saved in. If that response was
  regenerated or removed, or the paragraph and its neighbours were rewritten,
  the place is reported as not found and stays saved until you clear or
  replace it. A paragraph that has an identical twin right beside it with the
  same neighbours cannot be saved.
- Return looks for a place that is not on the page for at most about thirty
  seconds, and stops as soon as you scroll, click or type. In a very long
  conversation, or on a slow connection, that may not be enough; choose
  Return again (what the site loaded meanwhile stays loaded), or scroll
  nearer first.
- Save place without a selection takes the first paragraph that begins in
  view. When one long paragraph fills the screen it takes that one. To choose
  exactly, select some text in the paragraph.
- Alt+Shift+S is fixed and cannot be changed. It gives no message when a
  place cannot be saved; the popup does.
- The bookmark in the site's list appears on rows the adapter recognises.
  Other lists of conversations (search results, project pages) are not
  marked.
- The saved place is shown visually; a screen reader is told about it in the
  popup, not in the page.
- On Claude, only message content is handled. Right-to-left text there keeps
  the side padding the site gives every text block.
- On ChatGPT, direction and typography are applied to a reader's own message
  when the site renders it as paragraphs or in the layout the adapter knows;
  other layouts are not.
- A web address that is not a link is not isolated from surrounding
  right-to-left text.
- Text size scales whole blocks, including code inside them.
- A newly streamed block is marked within about a tenth of a second; it can
  show the site's own direction for that moment.
- The popup is in English.

## Development

```sh
npm test                 # core rules, stylesheet and site contract
npm run build            # dist/chrome and dist/firefox
npm run package          # build + archives in dist/packages
npm run source-package   # source archive of the current commit, for review
npm run store-images     # store listing images from the built extension
npm run browsers:firefox # one-time: download Firefox for the tests into .cache/
npm run test:e2e         # real Chrome and Firefox, temporary profiles
```

`npm run test:e2e` uses the installed Chrome (or `READELA_CHROME`) and the
Firefox in `.cache/` (or `READELA_FIREFOX`). It never uses an existing browser
profile. Add `-- --live` to also open the real signed-out start pages; nothing
is typed or sent there.

### Reproducing the store packages

The packages submitted to the stores are built from a tagged commit with the
commands above; nothing is minified and no step is manual. To reproduce one:

```sh
npm ci            # installs exactly the versions in package-lock.json
npm run package   # dist/chrome, dist/firefox and dist/packages/*.zip
```

- Requires Node.js 22.15 or newer and the npm that ships with it. The
  packages were built on Windows 11 with Node.js 22.23.1 and rebuilt
  byte-for-byte with Node.js 20.20.2; the bundler output does not depend on
  the operating system.
- `dist/firefox/` is the content of the Firefox package and `dist/chrome/`
  the content of the Chrome package; they differ in `manifest.json` and in
  how `content.css` names the packaged fonts. Each has 17 files.
- The archives are written by `scripts/lib/zip.mjs` with sorted entries and a
  fixed timestamp, so the same files give the same archive bytes. If an
  archive differs, compare the extracted files: they are what the browser
  installs. Archive bytes can differ between zlib versions while the files are
  identical.
- `npm run source-package` writes `dist/packages/readela-<version>-source.zip`,
  the tracked tree of the current commit, for the Firefox Add-ons source
  review. `npm run store-images` regenerates `docs/store-images/` from the
  built extension and the synthetic test conversations.

Layout: `src/core` (portable rules), `src/page` (page integration and one
adapter per site), `src/browser` (extension APIs), `src/ui` (popup). See
[docs/architecture.md](docs/architecture.md) and
[docs/product-brief.md](docs/product-brief.md).

## License

[MIT](LICENSE). Copyright (c) 2026 Amir.

## Project governance

Preflight records are under `docs/project-preflight/`; dated verification
evidence is under `docs/evidence/`.
