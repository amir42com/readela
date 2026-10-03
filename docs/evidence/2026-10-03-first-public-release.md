# Release evidence — first public release of 0.2.0 (2026-10-03)

Work unit: ENT-198, under the Preflight Record
`docs/project-preflight/ent-198-first-public-release.json` (integrated into
`main` by pull request 2 as `200614e96f5b61e0dbbe3c06b7e580693f4dbba7`).

This file records what was run and observed on 2026-10-03. It is dated
evidence, not a statement of current status; the managerial system owns
release status. Sections are appended as later stages happen; nothing recorded
here is rewritten afterwards.

## Preflight integration

- Branch `docs/ent-198-release-preflight` from `main`
  `db7dcfeb782be38c427823a77e567717054973c3`; one commit
  `25accc97f55885f62495335d5126a8ddf0a582b3` adding the record alone.
- Required check `verify` succeeded on the push and on the pull request.
- Integration Gate: **PASS** — owner authorization present (ENT-198), record
  is the only change, `verify` green on the exact head, ruleset `24401132`
  unchanged (active, no bypass, strict required `verify`), `main` unchanged
  since the record's `baseCommit`.
- Merged by merge commit `200614e96f5b61e0dbbe3c06b7e580693f4dbba7`;
  `verify` succeeded on that push of `main` (run `37087990118`).

## Practical release name check

Performed on 2026-10-03 after the Preflight was integrated. Searches and
results, exactly as observed:

| Surface | Query | Result |
| --- | --- | --- |
| IP Australia, Australian Trade Mark Search, quick search | `readela` | 0 results |
| IP Australia, quick search | `readella` | 0 results |
| USPTO Trademark Search (tmsearch.uspto.gov) | `readela` | No results found |
| WIPO Global Brand Database, brand name contains | `readela` | No results found (76,891,139 records, 89 sources) |
| TMview (EUIPN), trade mark name contains | `readela` | No rows found |
| Chrome Web Store search | `readela` | no results |
| Firefox Add-ons search API (`addons.mozilla.org/api/v5/addons/search`) | `readela` | no add-on of that name; results are unrelated reading add-ons |
| GitHub repository search | `readela` | only `amir42com/readela`; unrelated `readelan` (an R package) and `reAdela` |
| npm registry, PyPI | `readela` | not found (HTTP 404) |
| General web search | `"Readela"`, `"Readela" extension/software/app`, `"Readela by Amir42"` | personal-name profiles; this repository; no browser extension or software product named Readela |
| Near spellings, general web | `Readella`, `Readelah`, `Reedela`, `Readila` | none; the nearest reading tools are *Readel* (read-aloud extension), *Readera*, *Reedy*, *Reedah* |

One observation to keep in view: the domain `readela.com` was registered on
2025-09-27 (Amazon Registrar) and is indexed by web search as a "book
marketplace" for self-publishing. On 2026-10-03 the domain did not resolve
(its name servers refuse queries), and the Internet Archive holds captures only
from 2017 to 2019 under an earlier, unrelated use. No trade mark for that name
was found in any register searched. It is a different kind of product (a book
sales platform, not a browser extension) and the public presentation here is
"Readela by Amir42".

A web-search summary during this check attributed a US registration to
"Readela"; the record it cited (serial 99417853) is the mark **READERFUL**,
not Readela, and the direct USPTO search for `readela` returned nothing.

**Result: practical release name check: no material conflict found; not legal
advice or formal trademark clearance.** The product is not renamed.

## Release-readiness changes (this branch)

Product code (`src/`), tests, the build script and the lockfile are unchanged
from `main` `200614e`. The branch adds or changes only:

- `docs/privacy-policy.md` — the user-facing public privacy policy; its public
  URL is `https://github.com/amir42com/readela/blob/main/docs/privacy-policy.md`.
- `docs/store-listing.md` — the shared listing text, Chrome Web Store listing
  and privacy-practices answers, Firefox Add-ons listing, reviewer notes and
  source-package instructions.
- `docs/store-images/` — four 1280x800 screenshots and one 440x280
  promotional tile, produced by `scripts/store-images.mjs` from the built
  extension on the synthetic test conversations (no real conversation).
- `scripts/source-package.mjs` and the `source-package` script — the Firefox
  Add-ons source archive (the tracked tree of the commit, via `git archive`).
- `scripts/store-images.mjs` and the `store-images` script.
- `README.md` — distribution statement, privacy-policy link, and the
  "Reproducing the store packages" section.
- This file.

## Verification on the branch

Environment: Windows 11 Pro 10.0.26300; Node.js 22.23.1; Chrome 154.0.8037.58
(installed branded build) and Firefox 157.0 (Mozilla stable build in the
project's ignored `.cache/`), each with a fresh temporary profile.

- `node .governance/dev-standards/verify-dev-standards.mjs` (worktree and
  `--staged`): pass; v0.6.0, effective policy `sha256:b671fdd9…a692`.
- `npm test`: 23 tests, 23 passed.
- `npm run test:e2e -- --live`: 29 checks passed in Chrome and 29 in Firefox,
  including the no-network and storage checks (only `readela.preferences` is
  stored) and both colour schemes (popup contrast 7.56 to 16.56 light,
  9.91 to 14.86 dark).
  Live, signed out, nothing typed or sent: in Firefox, `chatgpt.com` loaded
  with the content script running and no editable field touched; `claude.ai`
  redirected to its sign-in page with the content script running and nothing
  marked; in headless Chrome both sites answered with a bot check, which was
  not bypassed, and the content script ran on that page. In every case no
  request had an extension address or an extension initiator.
- Packages, `npm run package`, built on 2026-10-03:

  | File | SHA-256 |
  | --- | --- |
  | `dist/packages/readela-0.2.0-chrome.zip` | `d8674ab0a2c0519b2a2d3bf6be0470e73f430bdf62cc9fa35909686ae1a6b17a` |
  | `dist/packages/readela-0.2.0-firefox.zip` | `d74de1c18059d8241b5516df8b1f67d1926e5c5bd21c3a1af19dd227cf706307` |

  These equal the digests recorded on 2026-10-02 for the same source. The
  same two digests were produced by Node.js 20.20.2 and by Node.js 22.23.1
  (twice). Each archive has 12 entries with fixed timestamps.
- Manifest metadata checked against the current store limits:
  `description` 112 characters (Chrome summary limit 132), `name` 17
  characters (Firefox limit 50).

## Provider requirements and account state

Official documentation re-read on 2026-10-03 (developer.chrome.com:
publish, images, register, privacy-practices tab, user-data FAQ;
extensionworkshop.com: submitting an add-on, source-code submission, built-in
data consent, add-on policies). What it requires is summarised in the
Preflight Record's `providerRequirements`.

Observed, read-only, in the owner's browser on 2026-10-03:

- Chrome Web Store developer console: the signed-in Google account was
  redirected to the registration page (Developer Agreement). No registered
  developer account was found for that account; registration, its one-time
  fee, agreement acceptance and two-step verification are owner-only actions
  and were not performed.
- Firefox Add-ons Developer Hub: not signed in. Signing in to a Mozilla
  account is an owner-only action and was not performed.

No store account, fee, terms, signing, submission or publication action was
taken.
