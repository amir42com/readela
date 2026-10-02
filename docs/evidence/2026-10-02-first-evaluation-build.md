# Verification evidence — first evaluation build (2026-10-02)

Work unit: ENT-197 / ENT-198, under the Preflight Record
`docs/project-preflight/ent-197-repository-establishment.json`.

This file records what was run and observed on 2026-10-02. It is dated
evidence, not a statement of current status.

## Source and artifact identity

- Source: the commit that adds this file, on branch
  `feat/ent-198-first-usable-extension`, descended from the establishment
  commit `bca17d071daac544c1a9b4be6f834888e7ebfead`.
- Packages, built from that source with `npm ci && npm run package`
  (deterministic archives; rebuilt twice with identical digests):

  | File | SHA-256 |
  | --- | --- |
  | `dist/packages/readela-0.1.0-chrome.zip` | `ecfd10e07292a5384fdf66ed509d198503beb8dbdef2a50fe477d2e89596c4d1` |
  | `dist/packages/readela-0.1.0-firefox.zip` | `39a21b8e6ef6e94e255f7fa37b7ec6c6f9cc80eaa22e20af29aa4f2797c89010` |

  Each archive was extracted and compared with its `dist/` directory (12
  entries, `manifest.json` at the root, identical content). `dist/` is not
  tracked.
- These are local evaluation packages. Neither is signed, published or
  submitted to a store.

## Environment

- Windows 11 Pro 10.0.26300; Node.js 22.23.1; Git 2.54.0.
- Chrome 154.0.8037.58: the installed branded build, started with a fresh
  temporary profile.
- Firefox 157.0: the stable build from Mozilla's release archive, downloaded
  into the project's ignored `.cache/` directory and started with a fresh
  temporary profile. Firefox was not otherwise installed on the machine.
- No existing browser profile was read or modified, and the extension was not
  installed into one.
- Build and test tooling: esbuild 0.28.2, puppeteer-core 25.12.0.

## Gate results

- **Establishment, implementation, branch push and draft pull request: PASS**
  (evaluated 2026-10-02 before repository initialization; recorded in the
  Preflight Record).
- **Bootstrap Apply: BLOCKED** (same record). Not run. See "Bootstrap" below.

## Core rules — `npm test`

19 tests, 19 passed. They cover the direction decision for Persian, Arabic,
Hebrew, English and mixed text; numbers and punctuation; addresses; the
zero-width non-joiner; overrides; neutral blocks; preference validation and
reset; and the generated stylesheet.

## Real browsers — `npm run test:e2e -- --live`

The built extension was installed into each browser. A synthetic conversation
page (`test/e2e/fixtures/conversation.html`, no real conversation content) was
served at a `https://chatgpt.com/` address inside the test browser, so the real
manifest match pattern and the real content script were exercised.

22 checks per browser; 22 passed in Chrome and 22 in Firefox:

1. Content script runs on the matched address.
2. Right-to-left paragraphs starting with a left-to-right word (Persian,
   Arabic, Hebrew), a heading and a quotation: marked and laid out
   right-to-left, confirmed by the on-screen position of characters.
3. Plain Persian/Arabic/Hebrew paragraphs right-to-left; English left-to-right,
   including an English sentence that starts with a Persian word.
4. Mixed punctuation and numbers keep their order; a number-only paragraph
   follows its surroundings.
5. Lists: unit direction, nested list decided separately, logical indentation
   follows, physical indentation and a physical quotation border are mirrored.
6. Tables follow their content; a header pinned to the left aligns to the
   reading start.
7. Inline code, a code block, mathematics and a web-address link stay
   left-to-right and keep their font; a link with ordinary text is untouched.
8. Text content, element count, selection text and link target unchanged.
9. Composer (`contenteditable` and `textarea`), form, navigation and buttons
   carry no mark; typing into the composer works.
10. Streamed text: a paragraph that starts in English and continues in Persian
    flips to right-to-left; a streamed list is followed.
11. Navigation to another conversation (content replaced, address changed).
12. Direction override in both directions, code unaffected.
13. Font, size and spacing apply to prose; code keeps its font; scaling is
    applied once and causes no horizontal overflow.
14. Preferences persist across a page reload and a reopened popup.
15. Off: no `data-readela-*` attribute or `--readela-*` property remains, the
    first reply's markup equals the original, and two changes the page made
    while Readela was on are kept.
16. While off, new content is left alone.
17. Four on/off rounds: nothing stacks and nothing survives being turned off.
18. Reset.
19. Popup keyboard operation and visible focus.
20. Light theme: popup contrast, 320px fit, page text readable.
21. Dark theme: the same.
22. No network request; storage holds only the preferences object.

Measured popup text contrast (minimum required 4.5): light 7.56–16.56, dark
9.91–14.86.

### Differences in how each browser was exercised

- **Chrome.** The installed popup was opened as a page and operated with real
  pointer and key input. The suite passed headless and again with a visible
  window.
- **Firefox.** The automation protocol does not deliver pointer or key input
  to an extension page, cannot resize it and cannot switch colour scheme at
  runtime. Therefore: the installed popup was operated through its DOM
  (script-triggered clicks and selections), which exercises the real popup
  code, storage and the page's reaction; keyboard operation, focus indicator,
  contrast and 320px fit were checked with real key input on the same built
  popup files rendered as an ordinary page with an in-memory stand-in for
  extension storage; the dark theme was checked in a second launch with the
  scheme set by preference.
- Firefox also accepted `readela-0.1.0-firefox.zip` as a temporary add-on.

### Network and storage

- On the synthetic page every request other than the page document is refused
  and recorded. Chrome recorded none. Firefox recorded only inline `data:`
  resources, which do not reach the network.
- Real `https://chatgpt.com/` start page, signed out, nothing typed or sent:
  Chrome (visible window) made 186 requests and Firefox 182, all to
  `chatgpt.com`; none had an extension address or an extension initiator. No
  editable field was marked (15 present). In headless Chrome the site answered
  with a bot check, which was not bypassed; that run observed nothing further.
- Source review of `src/` found no `fetch`, `XMLHttpRequest`, `WebSocket`,
  `sendBeacon`, `EventSource`, `eval`, `new Function`, `innerHTML`,
  `outerHTML`, `insertAdjacentHTML` or `document.write`, and no address other
  than the manifest match pattern. The only extension API used is
  `storage.local` (`get`, `set`) and `storage.onChanged`.

## Platform behaviour relied on, and its source

Checked against the vendors' documentation on 2026-10-02 and, where it is
load-bearing, by the runs above.

| Behaviour | Source | Exercised here |
| --- | --- | --- |
| A static content script needs only `matches`; `background` is optional in Manifest V3 | developer.chrome.com manifest and content-scripts reference; MDN `manifest.json` | yes, both browsers |
| Content scripts can use `storage.local` and `storage.onChanged`; storage calls return promises under Manifest V3 in both namespaces | developer.chrome.com storage reference; Extension Workshop Manifest V3 migration guide | yes, both browsers |
| Chrome loads an unpacked directory in Developer mode; the branded build ignores `--load-extension` since 137 | developer.chrome.com "Hello World" tutorial and June 2025 extension news | the suite loads the directory through the browser's debugging pipe, not through the `chrome://extensions` page |
| Firefox grants host access from `content_scripts` at installation since 127; temporary add-ons get it without a prompt | Extension Workshop migration guide; MDN `host_permissions` | yes (157) |
| Firefox temporary installation from `about:debugging`; removed at restart; unsigned add-ons cannot be installed permanently in release Firefox | Extension Workshop temporary-installation and signing pages | installed through the automation protocol's equivalent command, not through the `about:debugging` page |
| `browser_specific_settings.gecko.id` and `data_collection_permissions: { required: ["none"] }` | MDN `browser_specific_settings`; Extension Workshop data-consent page | manifest accepted by 157 |
| Icon formats and sizes | developer.chrome.com and MDN `icons` reference | not visually checked in a toolbar |

## Not verified

- A real conversation on `chatgpt.com`, signed in or not: no message was sent
  (sending would accept the site's terms on the owner's behalf) and no private
  conversation was read. The site's signed-out pages use paragraphs and
  headings with `dir="auto"` and first-strong handling, which the synthetic
  page reproduces, but the signed-in layout was not observed. The manual check
  in the README covers this.
- Streaming and navigation on the real site.
- The reader's own messages in the site's current layout.
- Real key input on the installed Firefox popup (see above).
- The manual installation paths through `chrome://extensions` and
  `about:debugging`, and the popup shown as a toolbar popup rather than a page.
- Preference persistence across a browser restart.
- The minimum browser versions declared in the manifests (Chrome 121, Firefox
  140) and any operating system other than Windows 11.
- Screen-reader behaviour.

## Bootstrap (dev-standards adoption)

Run from Universal Project Bootstrap `d3efc7c5d1d99b20f6691c8242fc2892e530c176`
against this repository at `bca17d071daac544c1a9b4be6f834888e7ebfead`
(`main`, clean), with Capabilities `["web-interface"]` and a clean checkout of
dev-standards as the source:

- Inspect: `COMPLETE`.
- Plan: `dev-standards-adoption`, `governance-ci-insertion` and
  `project-instructions` all `ELIGIBLE`.
- Prepare: `PREPARED`. Pinned source authenticated (13 checks):
  `v0.6.0`, tag object `95f5b6d42bfb20e21f3c7fe2019b00f52abdd348`, commit
  `f35e1025bf6cc0fcedbf7528b41a00ceaebf04d8`, source bundle
  `d885508cd89e21f53577c4b43a1210e812220af91e77c720d001437703d93694`.
  - Target key `f4ef4aa78d99f61cdae6bf287b95e74aeb5a8b2ab9a1723923c175650e97edb0`
  - Final Plan `2edbc7a43be1209b8f571ac0491e2176a78c3cef3fd068d9163c3d05e80610b1`
  - Preparation `7261e3abcc6e133400230699f6e931621f18d904f32c8f539c082b4506bcf6ee`
  - Candidates: adoption `e2ce07fc9c72a1f5ee2e4bf8e11c9e4bc65e8e588540a5e6b926d62e240ae55e`
    (with `.gitattributes` `2972b4cb516f1e95f5b4b679e4889aa2abfec2f89b92fed3b6afe7612ca39afe`),
    workflow `45f77e1cd70755b89bbeaca78d1520258c65c7282d6ea5b143846b602cb80ca0`,
    instructions `3411a189c05ad22de15745fb93bc39fa8280fe3a36c51cd593040fdfcc1df4d9`.
- **Apply was not run** and no authorization document was created. No
  governance bundle, pointer document, workflow, hook or receipt exists in
  this repository, and none was written by hand. The preparation package is
  held outside the repository. A preparation is bound to the exact target
  state it was made from; applying to a different commit needs a fresh
  Prepare.

Consequently no dev-standards verifier, hook or hosted CI ran on this branch.
The universal rules (no attribution, tool-neutral surfaces, no secrets,
branch and commit naming) and the `web-interface` accessibility rules were
followed by hand; that is not machine evidence of conformance.

## Review

Focused self-review of the diff against the Product Brief and the privacy
controls. No independent review was performed.
