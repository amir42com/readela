# Evidence: Readela on Firefox for Android (2026-10-31)

Work unit: ENT-293, under the light assertion
`docs/project-preflight/ent-293-readela-firefox-for-android.json`.

This file records what was changed and checked to let the existing Firefox
package run in Firefox for Android. It is dated evidence, not a statement of
current status; the managerial system owns status. Sections are appended as
later stages happen.

## Starting state

- `main` at `84d7cd5a9d8345abfcf37748c41b2bcfa101f7be` (version 0.3.0),
  clean; no open pull request or issue.
- Public listings read on 2026-10-31: the Firefox Add-ons public API reports
  add-on `readela` public at 0.3.0; the Chrome Web Store public page shows
  0.3.0, updated 14 October 2026.
- `node .governance/dev-standards/verify-dev-standards.mjs`: passed (v0.6.0,
  effective policy `sha256:b671fdd9…a692`, exceptions none).

## What Firefox for Android lacks that Readela used

Read from Mozilla's documentation for extension developers (Extension
Workshop, "Developing extensions for Firefox for Android" and "Differences
between desktop and Android extensions"; MDN, `browser_specific_settings`):

- An add-on is offered on Android only when its manifest declares
  `browser_specific_settings.gecko_android`.
- `commands` is not supported: a phone has no keyboard from which a command
  can be given.
- The action popup opens as an overlay over the page.
- `storage.local` is supported. Permissions are granted at installation.

This is documentation, not observation. Nothing here has run in Firefox for
Android yet.

## Change

| Where | Change |
| --- | --- |
| `src/manifest/firefox.json` | `browser_specific_settings.gecko_android.strict_min_version: "142.0"`. 142 is the first Firefox for Android that supports `data_collection_permissions`; with it, Mozilla's linter no longer gives the warning `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` recorded for 0.3.0. Permissions, hosts, web-accessible resources and the desktop minimum (140) are unchanged. |
| `src/background/main.js` | The listener for commands is added only where the browser has a `commands` namespace. Before, the first line that touched `commands` would throw in Firefox for Android and stop the background component before it began to answer requests to change the stored bookmarks, so no bookmark could be saved there. |
| `src/ui/popup.html`, `src/ui/popup.js` | Where the browser reports no commands, the Help paragraph about shortcuts is hidden together with the shortcut row, which was already hidden. |
| `test/browser/background.test.mjs` | New: the background component loads without `commands`, answers requests to change bookmarks and ignores messages from elsewhere. |
| `test/page/sites.test.mjs` | Two contract assertions follow the two changes above. |
| `README.md`, `docs/privacy-policy.md`, `docs/privacy-and-permissions.md`, `docs/store-listing.md` | Firefox for Android described: declared from the release after 0.3.0, no keyboard commands, Chrome for Android unable to run extensions, AMO's Android compatibility left unticked until a check on a phone is recorded. |

The Chrome package changes only in `background.js` and the popup; its
manifest is unchanged.

## Checks in the cloud environment

Environment: Ubuntu 24.04.5, Node.js 22.23.4, npm 10.9.9.

- `npm test`: 90 passed, 0 failed (89 before, plus the new test).
- `npm run package`: `readela-0.3.0-firefox.zip`
  `c8c3e54fc7847ceec2f94d38ec4180054af500cf3a192f0c1292110380a89134`,
  `readela-0.3.0-chrome.zip`
  `d6fc2d749125d82b16dfaa05391159034d9973bfea44fe7aa8b364daafa9bdcc`. These
  are working builds of this branch, not release artefacts; the version number
  is unchanged.
- Mozilla's `addons-linter` 10.15.0 on the Firefox archive: 0 errors,
  0 notices, 0 warnings. The tool was run from a scratch directory and is not
  a dependency.
- `npm run test:e2e:chrome` in Google Chrome for Testing 153.0.8010.12
  (headless, Linux): 69 checks passed, 3 failed. The three are popup layout
  checks ("popup: as approved …", and "light theme" and "dark theme: popup
  contrast and 320px fit", which report a popup height of 1125). The same three
  fail in the same way on unchanged `main` in this environment, so they come
  from this browser build and its fonts, not from this change. The release
  evidence of 0.3.0 records the suite passing in Chrome 154.0.8037.98 on
  Windows 11.
- `npm run test:e2e:firefox`: **not run.** Firefox cannot be downloaded in this
  environment (the hosts `product-details.mozilla.org` and `ftp.mozilla.org`
  are refused).

## Checks on the owner's Windows computer

Run on 2026-10-31 in `D:\01_Tech\readela`, switched to this branch at
`1e9014a62576b331e4dc1c7f9df9bc3312641cb5`; the worktree stayed clean.

- `npm ci`, `npm test`: 90 passed, 0 failed.
- `npm run package`, built twice: the same two digests as the cloud build,
  `c8c3e54f…89134` (Firefox) and `d6fc2d74…bdcc` (Chrome).
- `npm run test:e2e:chrome` in Chrome 156.0.8078.48 (headless): 72 passed,
  none failed. The three popup checks that failed in the cloud browser pass
  here.
- `npm run test:e2e:firefox` in Firefox 157.0: 69 passed, none failed; `main`
  gives the same 69 in that version. Firefox 157.0 was downloaded to a
  temporary folder for this run only.
- In Firefox 159.0, the version `npm run browsers:firefox` downloads today, the
  suite stops before its first check, on this branch and on `main` alike:
  `TimeoutError: Waiting failed: 15000ms exceeded` in `loadPopup`
  (`test/e2e/run.mjs:159`). Firefox 159 refuses the automation's direct
  navigation to the extension's popup page ("is not allowed in this
  context"). This is a limit of the test harness in that Firefox version, not
  of the extension, and is outside this work unit.
- Phone preparation: Android Platform-Tools 37.0.1 present; a Samsung SM-A526B
  (Android 14) connected with USB debugging allowed. Firefox is not installed
  on it, so `web-ext` was not run.

## Check on a phone

Run on 2026-10-31 by the owner, on the Samsung SM-A526B (Android 14) above,
after Firefox for Android 159.0 was installed on it (user agent
`Mozilla/5.0 (Android 14; Mobile; rv:159.0) Gecko/159.0 Firefox/159.0`).
Readela was loaded from `dist/firefox` of this branch with
`web-ext run --target=firefox-android` over USB, as a temporary add-on.

- First pass, on one claude.ai tab: Readela on and off, direction, Readela
  Sans, text size and line spacing took effect; Paper and Night changed
  nothing, and the bookmark buttons in the popup stayed disabled. The tab was
  read through Firefox's remote debugging, for structure only (no text): it
  was not a Claude conversation but a page under `/code/` of claude.ai, which
  Readela was never made for. The Claude adapter recognises conversations at
  `/chat/<id>` and the reply markup of those pages; that page has neither
  (`.standard-markdown` and `.progressive-markdown` 0), so the popup reports
  no conversation and nothing is coloured, as designed. Direction and
  typography are applied to the paragraphs of any page of the host, which is
  why they acted there. The same holds on the desktop.
- Second pass, on a signed-in Claude conversation (`claude.ai/chat/…`) and a
  signed-in ChatGPT conversation: every option worked on both sites,
  including Paper and Night and Save place, Return and Remove from the popup.
  The site adapters recognise the mobile layouts of both sites as they are on
  this date.
- The popup could not be inspected from the computer: Firefox 159 for Android
  does not list it among the add-on's debuggable frames. This did not matter
  once the check ran on conversations.

## Not yet done

- The end-to-end suite in Firefox 159 and later: the harness must open the
  popup another way, or the suite must name a Firefox version. Revisit before
  the next release's Firefox end-to-end run.
- Pages of claude.ai outside conversations, such as those under `/code/`, are
  not supported on any platform. Supporting them would be a new site adapter
  and its own work unit.
- Raising the version, a tag, a release and the AMO submission with Android
  compatibility, which need their own go-ahead.
