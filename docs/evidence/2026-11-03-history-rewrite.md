# Evidence: Git history correction (2026-11-03)

Work unit: history correction, under the light assertion
`docs/project-preflight/history-rewrite-2026-11-03.json`.

This file records what was changed and checked when the repository history
was rewritten to correct commit authors and messages. It is dated evidence,
not a statement of current status.

## Why

The public repository identity rule (DEC-151) says commits carry no tool
names, attribution lines or trailers, and the commit identity rule says every
commit is authored as `Amir <155735614+amir42com@users.noreply.github.com>`.
Fifteen earlier commits were authored under a coding tool's identity, and
seven merge subjects named a branch whose name carried a tool name. The owner
approved the rewrite, the tag move, the branch deletions and the ruleset
change on 2026-11-03.

## What changed

| Item | Before | After |
| --- | --- | --- |
| `main` | `ea46f5d293cfe3720dddafc19d5e2e4639c16499` | `045f35ddbae74ed2af08770bc863252d0d470dba` |
| `docs/records-language-and-instructions-sync` | `63264a457402a8b9afc09cf2d14f69b9b61e27c8` | `faffb2e32bb48338d1e33c3b0840b07272288cb2` |
| Tag `v0.4.0` (annotated) | `47a8a5a5…` on commit `24d80acaaeab469a0be4ccc99a665d1ae3c00b84` | `0ab0896e…` on commit `fe6e83fd2329d2e2e51a11ee62445e1e235740b6` |

- 30 commits were rewritten: the 22 affected commits and their descendants.
  Fifteen took the owner's identity as author and committer; seven merge
  subjects now name `feat/firefox-for-android`. Nothing else in any commit
  changed.
- Tags `v0.2.0`, `v0.2.1` and `v0.3.0` and the other 11 branches did not move.
- Three merged branches were deleted: the tool-named branch and the two
  branches that added and then widened the attribution check.
- The `v0.4.0` tag keeps its tagger, date and message.
- Ruleset ENT-197 was off during the push and is back on, now with
  `Check attribution` as a required check beside `verify`.

## What was checked

- For every rewritten commit: the same tree, the same author and committer
  dates, and parents mapped to the rewritten parents. Identity changed only
  where it was the tool's. The script reported zero problems.
- Every pushed ref read back from GitHub has the same tree as before.
- The commit behind `v0.4.0` has the same tree as `24d80ac`.
- The attribution check over the whole rewritten history passed locally and
  in the `attribution` run of the push to `main`.
- The three `v0.4.0` release assets were downloaded after the push. Their
  SHA-256 sums match the release text, and they were not re-uploaded. The
  source archive's zip comment still names `24d80ac`, the commit they were
  built from. The release text now names both commits.

## Not exercised

- No package was rebuilt. A source archive built from the new tag would carry
  the new commit id in its zip comment, so it would differ from the attached
  one in that comment only.
- Earlier pull requests still point at the old commits through GitHub's own
  pull-request references, which no repository setting can change.

The old-to-new commit map and a backup of the old history are kept privately
by the owner, outside this repository.
