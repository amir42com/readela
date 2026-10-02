# Readela

A browser extension that makes multilingual text easier to read within the
original page. The first supported site is ChatGPT (`chatgpt.com`).

Mixed right-to-left and left-to-right answers often come out with the wrong
paragraph direction: a Persian sentence that starts with an English word is
laid out left-to-right, list markers land on the wrong side and punctuation
jumps to the wrong end. Readela decides the direction of each paragraph from
its whole text and presents it accordingly, without changing the text.

This repository holds an **evaluation build**. Nothing has been published to an
extension store and no release has been made.

## What it does

- **On/off switch.** Off shows the page exactly as the site presents it.
- **Direction per paragraph.** Paragraphs, headings, lists, quotations and
  tables read right-to-left when at least 40% of their words are in a
  right-to-left script, whatever the first word is.
- **Direction override.** Automatic, right-to-left or left-to-right.
- **Lists and tables as a unit**, so markers, indentation and column order
  agree with the text.
- **Typography.** Font (page default, sans-serif, serif/Naskh — from fonts
  installed on your device), text size (up to 140%) and line spacing.
- **Remembers your choices** on this device.

Code blocks, inline code, mathematics and web addresses stay left-to-right and
keep their own font. The message composer and other editable fields are never
touched. The underlying text, selection and copying are unchanged.

## What has been checked

| | Chrome | Firefox |
| --- | --- | --- |
| Version exercised | 154.0.8037.58 (Windows 11) | 157.0 (Windows 11) |
| Minimum declared in the manifest (not exercised) | 121 | 140 |
| Synthetic conversation page: Persian, Arabic, Hebrew, English, mixed | passed | passed |
| Real `chatgpt.com` start page, signed out | loaded, nothing disturbed | loaded, nothing disturbed |
| Real signed-in conversation | **not checked** | **not checked** |

The exact cases, method and limits are in
[docs/evidence/2026-10-02-first-evaluation-build.md](docs/evidence/2026-10-02-first-evaluation-build.md).
A real conversation has not been exercised by the automated checks; see
"Manual check" below.

## Try it

Requirements: Node.js 22.15 or newer.

```sh
npm ci
npm run package
```

This writes two loadable directories and two archives:

```
dist/chrome/                              dist/packages/readela-0.1.0-chrome.zip
dist/firefox/                             dist/packages/readela-0.1.0-firefox.zip
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

Open a conversation on `chatgpt.com` and use the Readela toolbar button to
switch it on or off and to change direction, font, size and spacing.

### Manual check on a real conversation

1. Ask for an answer in Persian, Arabic or Hebrew that includes English terms,
   a bulleted and a numbered list, a code block and a formula.
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
| Access to `chatgpt.com` | Read the conversation text to decide direction and mark blocks for presentation. |
| `storage` | Remember preferences locally. |

Details: [docs/privacy-and-permissions.md](docs/privacy-and-permissions.md).

## Limitations

- Only `chatgpt.com` is supported.
- The automatic decision is a word-share rule. A paragraph split almost evenly
  between scripts can be judged differently from how you read it; use the
  override.
- The override applies to all prose in the conversation area, not to a single
  message.
- A reader's own message is handled when the site renders it as paragraphs or
  in the layout the adapter knows; other layouts are not.
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
npm test                 # core rules (Node's test runner)
npm run build            # dist/chrome and dist/firefox
npm run package          # build + archives in dist/packages
npm run browsers:firefox # one-time: download Firefox for the tests into .cache/
npm run test:e2e         # real Chrome and Firefox, temporary profiles
```

`npm run test:e2e` uses the installed Chrome (or `READELA_CHROME`) and the
Firefox in `.cache/` (or `READELA_FIREFOX`). It never uses an existing browser
profile. Add `-- --live` to also open the real signed-out start page; nothing
is typed or sent there.

Layout: `src/core` (portable rules), `src/page` (page integration),
`src/browser` (extension APIs), `src/ui` (popup). See
[docs/architecture.md](docs/architecture.md) and
[docs/product-brief.md](docs/product-brief.md).

## License

No license has been selected yet. Until a license file is added, this
repository grants no permission to reuse the source.

## Project governance

Preflight records are under `docs/project-preflight/`; dated verification
evidence is under `docs/evidence/`.
