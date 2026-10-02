# Readela

**Readela by Amir42** — a browser extension that makes multilingual text
easier to read within the original page. It supports ChatGPT (`chatgpt.com`)
and Claude (`claude.ai`), in Chrome and Firefox.

Mixed right-to-left and left-to-right answers often come out with the wrong
paragraph direction: a Persian sentence that starts with an English word is
laid out left-to-right, list markers land on the wrong side and punctuation
jumps to the wrong end. Readela decides the direction of each paragraph from
its whole text and presents it accordingly, without changing the text.

This repository holds an **evaluation build**. Publication through the Chrome
Web Store and Firefox Add-ons is planned; nothing has been submitted, signed
or published, and no release has been made.

## What it does

- **On/off switch.** Off shows the page exactly as the site presents it.
- **Direction per paragraph, automatic by default.** Paragraphs, headings,
  lists, quotations and tables read right-to-left when at least 40% of their
  words are in a right-to-left script, whatever the first word is.
- **Direction override.** Automatic, right-to-left or left-to-right.
- **Lists and tables as a unit**, so markers, indentation and column order
  agree with the text.
- **Typography.** Font (page default, sans-serif, serif/Naskh — from fonts
  installed on your device), text size (up to 140%) and line spacing.
- **Remembers your choices** on this device, for both sites.

Code blocks, inline code, mathematics and web addresses stay left-to-right and
keep their own font. The message composer and other editable fields are never
touched. The underlying text, selection and copying are unchanged.

## What has been checked

Automated checks, in Chrome 154.0.8037.58 and Firefox 157.0 on Windows 11:

| | ChatGPT | Claude |
| --- | --- | --- |
| Synthetic conversation page: Persian, Arabic, Hebrew, English, mixed | passed in both browsers | passed in both browsers (Persian, English, mixed) |
| Real start page, signed out, nothing sent | loaded, nothing disturbed | sign-in page loaded, nothing disturbed |
| Real signed-in conversation | not exercised by the automated checks | not exercised by the automated checks |

The owner reported manually testing the earlier build on several real ChatGPT
conversations and finding it working correctly. That is a report, not part of
the automated evidence, and it predates Claude support.

The minimum browser versions declared in the manifests (Chrome 121, Firefox
140) have not been exercised. The exact cases, method and limits are in the
dated evidence:

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
dist/chrome/                              dist/packages/readela-0.2.0-chrome.zip
dist/firefox/                             dist/packages/readela-0.2.0-firefox.zip
```

### Chrome — load unpacked (development install)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the `dist/chrome` directory.

Chrome loads a directory, not the archive; unzip the archive first if you
received only that. This is not a Chrome Web Store installation.

### Firefox — temporary add-on (development install)

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…**.
3. Select `dist/firefox/manifest.json` or the Firefox archive.

Firefox removes a temporary add-on when it restarts. The archive is **not
signed**; release versions of Firefox will not install it permanently.

### Use

Open a conversation on `chatgpt.com` or `claude.ai` and use the Readela
toolbar button to switch it on or off and to change direction, font, size and
spacing.

### Manual check on a real conversation

On each site:

1. Ask for an answer in Persian, Arabic or Hebrew that includes English terms,
   a bulleted and a numbered list, a quotation, a code block and a formula.
2. While it streams and afterwards: paragraphs and headings that start with an
   English word read right-to-left; list markers sit on the right; code and
   the formula stay left-to-right.
3. Your own message and the composer behave as before while you type.
4. Switch Readela off: the page returns to the site's own presentation.
5. Open another conversation: the new one is handled without a reload.

## Privacy and permissions

Readela works on your device. It has no backend, sends nothing anywhere, loads
no remote code or fonts, and stores only your preferences.

| Permission | Reason |
| --- | --- |
| Access to `chatgpt.com` and `claude.ai` | Read the conversation text to decide direction and mark blocks for presentation. |
| `storage` | Remember preferences locally. |

Details: [docs/privacy-and-permissions.md](docs/privacy-and-permissions.md).

## Limitations

- Only `chatgpt.com` and `claude.ai` are supported. Safari is a planned future
  platform and is not supported.
- The automatic decision is a word-share rule. A paragraph split almost evenly
  between scripts can be judged differently from how you read it; use the
  override.
- The override applies to all prose in the conversation, not to a single
  message, and preferences are shared by both sites.
- On Claude, only message content is handled. Right-to-left text there keeps
  the side padding the site gives every text block.
- On ChatGPT, a reader's own message is handled when the site renders it as
  paragraphs or in the layout the adapter knows; other layouts are not.
- A web address that is not a link is not isolated from surrounding
  right-to-left text.
- No fonts are bundled. A font choice has an effect only if a listed font is
  installed; otherwise the browser falls back.
- Text size scales whole blocks, including code inside them.
- A newly streamed block is marked within about a tenth of a second; it can
  show the site's own direction for that moment.
- The popup is in English.

## Development

```sh
npm test                 # core rules, stylesheet and site contract
npm run build            # dist/chrome and dist/firefox
npm run package          # build + archives in dist/packages
npm run browsers:firefox # one-time: download Firefox for the tests into .cache/
npm run test:e2e         # real Chrome and Firefox, temporary profiles
```

`npm run test:e2e` uses the installed Chrome (or `READELA_CHROME`) and the
Firefox in `.cache/` (or `READELA_FIREFOX`). It never uses an existing browser
profile. Add `-- --live` to also open the real signed-out start pages; nothing
is typed or sent there.

Layout: `src/core` (portable rules), `src/page` (page integration and one
adapter per site), `src/browser` (extension APIs), `src/ui` (popup). See
[docs/architecture.md](docs/architecture.md) and
[docs/product-brief.md](docs/product-brief.md).

## License

[MIT](LICENSE). Copyright (c) 2026 Amir.

## Project governance

Preflight records are under `docs/project-preflight/`; dated verification
evidence is under `docs/evidence/`.
