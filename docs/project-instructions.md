# Project instructions

This document is the repository's only project-specific instruction body. Any
person or agent working on Readela reads it first. `AGENTS.md` at the root only
points here.

## Protocol pointer

This project is governed by the Project Operating Protocol, version v1.

- Protocol: https://app.notion.com/p/3c2b7da33f5081709510eb8c464dcef9
- Managerial project page: https://app.notion.com/p/3edb7da33f508123a869fc4505e81d31

Read the Protocol and the managerial project page before starting work, and
verify the repository state (branch, working tree, latest commit on `main`) and
the repository's dev-standards pin before relying on it:

```sh
node .governance/dev-standards/verify-dev-standards.mjs
```

Managerial state lives in the managerial system (Personal OS). This repository
owns technical reality only.

## Scope

Readela is a small, inspectable browser extension for reading long and
multilingual text in the original page: paragraph direction, warm colours, a
packaged script-aware font, size and spacing, and a bookmark where the reader
stopped. It runs on `chatgpt.com` and `claude.ai` in Chrome and Firefox.

- The project covers code, tests, packaging, release evidence, the store
  listing, privacy documents and later platforms.
- It stays a minimal reading-comfort product (DEC-116): new work solves a
  demonstrated reading problem or materially extends reach, never a general
  productivity tool.

## Authoritative sources

- Personal OS owns managerial state, priorities, Decisions, the roadmap and
  planning. Verify Status, Next item and Next step there at the start of each
  substantial task, never from repository documents, memory or chat. When the
  project is Paused with no Next item, no development starts until the owner
  starts a task.
- The repository owns code, tests, technical contracts, architecture,
  implementation evidence and release truth. Technical documents: `README.md`
  and, in `docs/`, `product-brief.md`, `architecture.md`,
  `privacy-and-permissions.md`, `privacy-policy.md`, `store-listing.md`, the
  dated files in `evidence/` (newest first; a later file supersedes an earlier
  one) and the Preflight Records and light assertions in `project-preflight/`.
- Chats, memory, prompts, summaries and handoffs are working context, not
  authority. Resolve conflicts by source authority. Agent reports are
  `reported` until verified, especially merge, release, close-out and Personal
  OS claims.
- Local workspace on the owner's computer: `D:\01_Tech\readela`. Retained
  evidence (read-only): `D:\01_Tech\_evidence\readela`.

## Product rules

- Every setting has an Original choice that leaves that part of the page
  untouched; Off means Readela does nothing.
- Never change the text, selection or copying, or touch the composer or other
  editable fields. Code, mathematics and web addresses stay left-to-right in
  their own font.
- Local processing only: no backend, no sending conversation content, no
  analytics, no remote code or fonts. Storage holds only preferences and
  bookmarks; a bookmark never holds text, a title or the conversation address.
- Permissions: host access to the two sites and `storage` only. A new
  permission, host, site adapter or platform updates
  `docs/privacy-and-permissions.md` and `docs/privacy-policy.md` in the same
  change.
- Readela Sans is Inter (Latin) and Vazirmatn (Persian, Arabic), packaged
  (DEC-142). There is one event-driven bookmark write authority, in the
  background component (DEC-144).
- Next platforms: Microsoft Edge, then Safari (DEC-104), reusing `src/core`,
  never as separate products.
- The popup is in English; store copy, `README.md` and privacy text are in
  Australian English.

## Working rules

- Read current context first: the Protocol, the managerial project page, the
  task-relevant Active Entries, Accepted Decisions and recent Updates, and the
  repository. If sources are missing or conflict, report the gap; do not guess
  or mutate.
- Mutation boundary: advice, analysis, prompt-writing, review and audit are
  read-only. Change Personal OS, the repository or external services only on
  an explicit owner request or an approved workflow. A review verdict, a
  recommendation or a passing Gate is not owner approval.
- Close-out is part of an authorised execution task: verify Status, Summary,
  Next item and the affected Entry; add an Update only for a milestone,
  blocker, direction change or handoff.
- Judgement and simplicity: flag unnecessary, risky, duplicated, premature or
  overengineered work and propose the smaller safe option. Reuse, consolidate
  or delete before adding architecture, dependencies, process, tests, gates or
  documents. Priority: project success; correctness and safety; simplicity;
  maintainability; reasonable flexibility; speed; sophistication.
- Repository discipline: before editing, check the branch, the working tree,
  the applicable rules and the current and remote baseline. Preserve existing
  work and unrelated local changes; keep changes focused, without unrelated
  refactors, cleanup, dependency changes or redesign.
- Language of records (DEC-168): every record of this project is written in
  English: repository documents, code comments, commit messages, pull
  requests, issues, Preflight Records and light assertions, Personal OS pages,
  project files and deliverables. Persian is only the owner's chat dialogue.
- Dashes (DEC-152): never use an em dash (U+2014) in anything written for this
  project. Use an en dash for English ranges; a hyphen only in compounds,
  slugs, file names and title separators.
- Public repository identity: commits, pull requests, comments, releases and
  files stay tool-neutral, with no tool, model, vendor or session names and no
  attribution lines or trailers. The only approved functional reference is the
  root entry files `AGENTS.md` and `CLAUDE.md` and the import `@AGENTS.md`
  (DEC-151).
- Commit identity: every commit is authored and committed as
  `Amir <155735614+amir42com@users.noreply.github.com>`; GitHub may commit
  web merges. Set `user.name` and `user.email` before the first commit of a
  session, turn off the coding client's own attribution defaults, and check
  the branch name, identity, commit messages and pull-request text before the
  first push. The `attribution` workflow (`scripts/check-attribution.mjs`)
  fails on attribution shapes in commit messages and pull-request text
  (including after an edit), on a head branch without a Conventional Commits
  type prefix, and on any other author or committer.
- Local files on the owner's computer follow Local Filesystem Structure
  (https://app.notion.com/p/3dab7da33f50812882d5ec1ccb7eaa71). Temporary work,
  worktrees, builds and screenshots go under `D:\01_Tech\_scratch\readela\`,
  never in the root of `D:\01_Tech`; final evidence goes to
  `D:\01_Tech\_evidence\readela\`. Clean up what the task created at its end,
  as that page describes.
- Safety: protect secrets, credentials, production data, privacy and
  security. Never expose, commit or publish secrets.

## Where work runs

- Remote and cloud sessions: code, documents, `npm test`, `npm run build`,
  `npm run package`, branches and pull requests. Their end-to-end and
  performance runs use that environment's browser: record the browser and
  version, and never present them as the owner's real-browser check.
- The owner's Windows computer: real Chrome and Firefox checks on signed-in
  ChatGPT and Claude, store package reproduction, and anything that needs the
  owner's browsers.
- Store accounts are the owner's: prepare packages, listing text, screenshots
  and privacy answers; the owner submits and reports the result (a report, not
  verified evidence).

## Verification

- `npm test` gates every change. Changes to `src/content`, `src/page`,
  `src/browser`, `src/background` or the stylesheet also need
  `npm run test:e2e` in Chrome, and in Firefox where browsers differ.
- A change that can alter a settled page's cost (content script, observers,
  bookmarks) needs the matched `test/perf` benchmark before and after, in a
  dated evidence file (DEC-144).
- Each release or correction gets one dated `docs/evidence/` file: what was
  checked, browser and version, what passed, what was not exercised, and what
  the stores reported.
- Avoid review loops. Broad or independent review is only for material
  architecture, security, trust, data-loss, release or irreversible risk;
  changed artifacts need affected re-checks, not a restart. Zero findings is
  not required: each actionable non-blocking finding is fixed now or deferred
  with a real revisit trigger.

## Release

- Release from a frozen, tagged commit: raise the version in `package.json`
  (the build writes both manifests), tag `v<version>`, build with `npm ci` and
  `npm run package`, and publish the GitHub Release from the tag with both
  store archives and the Firefox review source archive. Packages stay
  reproducible from the tag: nothing minified, no manual step.
- Store text and screenshots live in the repository (`docs/store-listing.md`,
  `docs/store-images/`, `npm run store-images`); change them here first, then
  in the store.

## Approval levels

- Routine once authorised (finish end to end, then report): reading,
  branches, edits, tests, builds, packaging, evidence files, pull requests, CI
  fixes, and merging your own pull request into `main` under the standing
  merge approval (DEC-160) once `npm test`, the needed end-to-end checks, CI
  and the Protocol's Gate pass. Never ask for that merge.
- One owner go-ahead per task: a version raise, tag and GitHub Release; any
  new permission, host, site adapter, platform or privacy-document change;
  store listing text or screenshots.
- Only on the owner's explicit, exact instruction: submitting to a store or
  claiming an unreported store state; deleting or moving release evidence,
  Preflight Records, packaged fonts or the retained evidence folder; sending
  conversation content outside the browser.

## Writing

Audience-facing writing (README, store listing, privacy policy, release notes,
popup text) follows the owner's Writing Engine standard. Never invent test
results, browser versions or store outcomes. If the standard is unavailable,
say so.
