# Verification evidence — Claude support and release-facing reconciliation (2026-10-02)

Work unit: ENT-198 (with ENT-196 and ENT-197), under the Preflight Record
`docs/project-preflight/ent-198-claude-support.json`.

This file records what was run and observed on 2026-10-02 for build 0.2.0. It
is dated evidence, not a statement of current status. The earlier build is
covered by `2026-10-02-first-evaluation-build.md`, which is left as recorded.

## Three kinds of statement in this file

- **Owner decisions** — accepted in the managerial system and applied here.
- **Reported manual testing** — reported by the owner; not observed by these
  checks.
- **Verified** — run and observed in this work.

## Owner decisions applied

DEC-102, DEC-103 and DEC-104: ChatGPT and Claude as first-release sites;
Automatic default direction with explicit overrides; MIT license; Firefox
add-on ID `readela@amir42.com`; "Readela by Amir42" branding (publisher
Amir42, author Amir, website amir42.com); planned Chrome Web Store and Firefox
AMO distribution; reading-position marker deferred; Safari as a planned future
platform. None of these is a claim of publication, signing, store approval or
Safari support.

## Reported manual testing

The owner reported manually testing the earlier evaluation build (0.1.0) on
several real ChatGPT conversations and pages and finding it working correctly.
This was not observed or repeated here, it predates this build, and it does not
cover Claude.

## Source and artifact identity

- Source: the commit that adds this file, on branch
  `feat/ent-198-first-usable-extension`, descended from
  `d4f16a63fa25d1944e746fc4463dc3bb8658b991`.
- Packages, built with `npm ci && npm run package` (deterministic; built twice
  with identical digests, extracted and compared with `dist/`, 12 entries
  each):

  | File | SHA-256 |
  | --- | --- |
  | `dist/packages/readela-0.2.0-chrome.zip` | `d8674ab0a2c0519b2a2d3bf6be0470e73f430bdf62cc9fa35909686ae1a6b17a` |
  | `dist/packages/readela-0.2.0-firefox.zip` | `d74de1c18059d8241b5516df8b1f67d1926e5c5bd21c3a1af19dd227cf706307` |

- These are local evaluation packages. Neither is signed, published or
  submitted to a store.

## Environment

Windows 11 Pro 10.0.26300; Node.js 22.23.1; Chrome 154.0.8037.58 (installed
branded build) and Firefox 157.0 (Mozilla stable build in the project's ignored
`.cache/`), each started with a fresh temporary profile. No existing browser
profile or account was used. esbuild 0.28.2, puppeteer-core 25.12.0; no
dependency was added or upgraded.

## What changed in the extension

- **Manifest:** `content_scripts.matches` gained `https://claude.ai/*` (now
  exactly `https://chatgpt.com/*` and `https://claude.ai/*`). `permissions`
  is still `["storage"]`. No `host_permissions`, background script or
  web-accessible resource. Metadata added: `name` "Readela by Amir42",
  `short_name` "Readela", `homepage_url`; Firefox only: `author` and
  `developer`. Version 0.2.0.
- **Site adapters:** `src/page/sites/claude.js`, site selection in
  `src/page/sites/index.js`, shared exclusions in `common.js`. The reader gained
  the optional `within` restriction used by the Claude adapter.
- **Core:** unchanged. No Claude evidence pointed at the direction algorithm.
- **Page layer, mirror detection:** changed. The earlier rule mirrored a list
  or quotation whenever its far side carried more spacing than its near side.
  Claude's stylesheet gives every text block more right padding than left, so
  that rule would have rearranged left-to-right lists and moved the bar of
  left-to-right quotations. The reader now compares the element's layout under
  both directions and mirrors only when nothing moved, which is what "pinned to
  a physical side" means. The ChatGPT checks for physically indented lists and
  quotations still pass.

## How Claude's structure was established

Without an account, from the site's public assets loaded by the signed-out
page (read-only, 2026-10-02): messages carry
`data-testid="assistant-message"` / `"user-message"` and `data-is-streaming`;
rendered Markdown sits in `.standard-markdown` (`.progressive-markdown` while
streaming); lists use logical start padding (`ps-7`) and quotations a logical
start border (`border-s-2`), while every text block also gets physical left
and right padding; the composer is a `contenteditable`. The synthetic page
`test/e2e/fixtures/claude-conversation.html` reproduces these traits. It
contains no real conversation. This establishes the hooks the adapter relies
on; it is not an observation of a rendered conversation.

## Core, stylesheet and site contract — `npm test`

23 tests, 23 passed. The four new ones cover the site contract: every adapter
has the required fields and excludes editable fields; no host is served twice;
the manifest requests exactly the adapters' hosts with `storage` and nothing
broader; site selection matches exact hosts only (a subdomain or look-alike
host is not a supported site).

## Real browsers — `npm run test:e2e -- --live`

29 checks per browser; 29 passed in Chrome and 29 in Firefox.

The 22 checks from the first build were rerun unchanged against the ChatGPT
page and still pass. Seven new checks run against the Claude page, served at a
`https://claude.ai/` address inside the test browser so the real match pattern,
content script and site selection are exercised:

1. The content script runs on `claude.ai` and reads message content only:
   page text outside messages, navigation, buttons and the composer carry no
   mark, and typing into the composer works.
2. Mixed-direction replies read right-to-left (confirmed by on-screen
   character positions), English left-to-right, a table follows its content,
   and the reader's own message is handled in both of its renderings.
3. Lists and quotations follow the direction; left-to-right lists and
   quotations keep exactly the site's spacing; nothing is mirrored.
4. Inline code, a code block, mathematics and a web-address link stay
   left-to-right; code keeps its font; text, element count, selection and link
   target are unchanged.
5. The shared preferences apply on Claude and on ChatGPT at once, to message
   content only; page text outside messages is not scaled or restyled; no
   horizontal overflow.
6. Off: no mark or custom property remains, the transcript markup equals the
   original, the site's own first-strong handling is back, and new content is
   left alone while off.
7. A streamed reply (first word left-to-right, then right-to-left as the text
   arrives, then a streamed list) and navigation to another conversation are
   followed.

Languages on the Claude page: Persian, English and mixed. Arabic and Hebrew
were exercised on the ChatGPT page only; the direction rule is the same shared
core on both.

The Firefox-specific limits recorded in the first evidence file still apply:
the installed popup is operated through its DOM there, and keyboard, contrast
and theme checks use a stand-in rendering of the same popup files.

### Real sites, signed out, nothing typed or sent

Before these checks the text size was set to 110% so that the root mark shows
the content script ran and read the stored preferences.

| | Chrome (visible window) | Firefox (headless) |
| --- | --- | --- |
| `chatgpt.com` start page | loaded; content script ran; 15 editable fields, none touched; 189 requests, all to the site | loaded; content script ran; 15 editable fields, none touched; 185 requests, all to the site |
| `claude.ai` (redirects to its sign-in page) | loaded; content script ran; no block marked; 5 editable fields, none touched; 220 requests, all the site's own | loaded; content script ran; no block marked; 5 editable fields, none touched; 216 requests, all the site's own |

No request had an extension address or an extension initiator. In headless
Chrome both sites answered with a bot check, which was not bypassed; the
content script still ran on that page and nothing further was observed there.
No sign-in, message, captcha interaction or account change was made.

### Network, storage and source review

- On the synthetic pages every request other than the two page documents is
  refused and recorded. Chrome recorded none; Firefox recorded only inline
  `data:` resources.
- Storage holds only `readela.preferences`.
- `src/` contains no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`,
  `EventSource`, `eval`, `new Function`, `innerHTML`, `outerHTML`,
  `insertAdjacentHTML` or `document.write`. The only addresses are the two
  match patterns and the homepage address in manifest metadata. The only
  extension API used is `storage.local` (`get`, `set`) and `storage.onChanged`.

### Manifest metadata, and its source

`short_name` (at most 12 characters) and `homepage_url` per
developer.chrome.com's manifest reference; `author` and `developer` per MDN,
which states that `developer.name` overrides `author` in Firefox and that
Chrome does not use `author`. Both manifests were accepted by the browsers
above.

## Not verified

- A real conversation on Claude, signed in or not: no account was used and no
  message was sent. The adapter's hooks come from the site's public assets;
  how a rendered conversation looks with Readela on the real site has not been
  observed. The README has a manual check.
- A real ChatGPT conversation by these automated checks (see "Reported manual
  testing").
- Claude's reasoning, artifact and tool-output views.
- Arabic and Hebrew on the Claude page.
- Real key input on the installed Firefox popup; the manual installation
  paths; persistence across a browser restart; the minimum browser versions
  declared in the manifests; operating systems other than Windows 11; screen
  readers.
- Safari: not implemented and not tested.

## Gate results

- **Implementation and documentation: PASS** (evaluated 2026-10-02 before the
  work; recorded in the Preflight Record).
- **Bootstrap Apply, evaluated again at this target state: BLOCKED.** The
  repository still has no ruleset or other external mutation boundary; no
  owner approval exists for the exact frozen identities of this state; no OS
  execution identity is named for this target. Apply was not run.

## Bootstrap (dev-standards adoption)

The earlier preparations were bound to earlier target states and are not
reused. Inspect, Plan and Prepare are run again against the commit that adds
this file, from Universal Project Bootstrap
`d3efc7c5d1d99b20f6691c8242fc2892e530c176` (pin re-verified: dev-standards
`v0.6.0`, commit `f35e1025bf6cc0fcedbf7528b41a00ceaebf04d8`) with Capabilities
`["web-interface"]`. Because a preparation's identities depend on the commit
that contains this file, they cannot be written here; they are recorded in the
managerial system (ENT-197) and the preparation package is held outside the
repository. No governance bundle, pointer document, workflow, hook or receipt
exists in this repository, and none was written by hand. No dev-standards
verifier, hook or hosted CI ran on this branch.

## Review

Focused self-review of the diff against the Product Brief, the site contract
and the privacy controls. No independent review was performed.
