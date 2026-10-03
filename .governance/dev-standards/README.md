# dev-standards source pin

GENERATED — DO NOT EDIT. Everything in this directory except `lock.json`,
`project-capabilities.json` and `project-exceptions.json` is produced by the canonical
dev-standards consumer bootstrap. Regenerate it instead of editing it.

## Pinned canonical identity

- Source repository: `amir42com/dev-standards`
- Policy ref: `v0.6.0` (annotated tag)
- Policy commit: `f35e1025bf6cc0fcedbf7528b41a00ceaebf04d8`
- Source bundle SHA-256: `d885508cd89e21f53577c4b43a1210e812220af91e77c720d001437703d93694`
- Effective policy hash: `sha256:b671fdd9a246661e047d243a5611baecca1aaaa0baf85aa2398caee48c6da692`
- Resolver version: `2`
- Effective policy artifact schema: `2`
- Bundle format version: `2`
- Lock schema version: `3`

Complete verified identity is the tuple (policy commit, source bundle SHA-256, resolver
version, effective policy hash). The effective policy hash identifies the resolved semantic
payload only — the applicable Rules (identity, status, severity, bypassability, exact
targeting, Conformance mode, resolved parameters) and the granted Exceptions (id, rule,
expires). It does not cover the policy commit, the source bundle digest, the resolver
version, the Capability set, or an Exception's `approved_by`, `approved_on`,
`justification` or `decision`: those provenance fields are bound by this repository's Git
commit like any tracked file, never by the hash.

## Contents

- `bundle/` — the byte-exact canonical source files read from the pinned commit's Git objects.
- `manifest.json` — generated evidence: per-file SHA-256, byte lengths and the aggregate digest.
- `effective-policy.json` — generated: the Effective Policy resolved from the pinned canonical
  Policy for the Capability set in `project-capabilities.json` and the Exceptions in
  `project-exceptions.json`, with its semantic payload and `effectivePolicyHash`.
- `verify-dev-standards.mjs` — generated, dependency-free verifier.
- `project-capabilities.json` — OWNER INPUT, not generated: the Capabilities this repository
  declares true of itself, in byte-wise ascending order. Changing it is a governance change;
  regenerate afterwards, and review the resulting `effective-policy.json` (and `lock.json`,
  when the effective policy hash changed) diff with it.
- `project-exceptions.json` — OWNER INPUT, not generated: the whole-Rule Project Exceptions
  this repository holds (decision 0022). Each is an explicitly approved, expiring deviation
  from one applicable Rule whose canonical `non_bypassable` is `false`; no Exception is ever
  created automatically. Granting, renewing, retargeting or removing an Exception is a
  governance change: regenerate afterwards and review the `effective-policy.json` and
  `lock.json` diff with it. Editing only `approved_by`, `approved_on`, `justification` or
  `decision` changes this file and the repository commit, not the effective policy hash.
- `lock.json` — the external trust anchor. It is **not** generated: it records the source
  identity and the effective policy hash this repository has deliberately decided to trust,
  and every other artifact is verified against it. Changing it is a governance change and
  must be reviewed on its own.

This directory is closed: these entries and nothing else. Verification fails on an extra,
missing or renamed artifact anywhere under it.

## Verification

```
node .governance/dev-standards/verify-dev-standards.mjs
node .governance/dev-standards/verify-dev-standards.mjs --staged
```

Verification reads only files vendored here. It requires no network, no GitHub
authentication, no access to the canonical source repository and no secret. The `--staged`
form verifies the exact Git index snapshot, so a pre-commit hook checks what is actually
about to be committed.

The verifier proves the consumer layout, lock integrity, the source bundle digest, the
canonical representation of `project-capabilities.json` (id syntax, order, no duplicate),
the canonical representation of `project-exceptions.json` (closed whole-Rule records, valid
dates, unique ids, at most one Exception per Rule), the canonical representation of
`effective-policy.json`, a supported resolver version, the binding of the artifact's
Capability set to the Capability input, the binding of the artifact's semantic Exceptions
(id, rule, expires) to the Exception input, that every carried Exception names a carried
Rule with `non_bypassable: false`, that no Exception is expired at the current UTC time,
the binding of the artifact's provenance to the lock, and that the artifact payload hashes
to the lock's effective policy hash.

It does **not** prove that the declared Capabilities are members of the canonical
vocabulary, that the payload is the fresh resolution of the vendored canonical Policy, or
that resolved parameters satisfy the resolver-side parameter schemas: those are proven by
the full generator from a dev-standards checkout, which refuses an artifact that does not
equal fresh resolution. It does not prove that any review or attestation a Rule's
Conformance mode requires was performed or recorded, and it does not authenticate
`approved_by` cryptographically.

Expiry is judged against this machine's clock. A manipulated local clock can change a local
expiry verdict; independently executed CI is additional evidence, not a trusted-time
source, and no `--as-of`, environment-variable or configuration override exists.

## What this does not claim

This is a source identity, byte integrity and effective-policy identity pin only. Pinning
and verifying identity is **not** behavioural enforcement. This directory does not claim:

- that ATTR-001, SEC-001, NAME-001, META-001 or any conditional rule (ACC-001 to ACC-005,
  SEC-002 to SEC-005, REC-001, DATA-001, PRED-001) is enforced in this repository;
- that any hook or CI step reads `effective-policy.json` or `project-exceptions.json` — none
  does;
- that a Project Exception disables, weakens or bypasses any hook, detector or CI check —
  it changes this repository's governed Effective Policy identity and nothing at runtime;
- that any Rule's review or attestation obligation (`conformance.mode`) is satisfied, or
  that Conformance evidence exists anywhere — Conformance reporting is not part of this pin;
- profiles, presets or any second policy layer;
- mandatory merge protection in the hosting platform.

META-001, ACC-002 to ACC-005, SEC-002 to SEC-005, REC-001, DATA-001 and PRED-001 are active
canonical policy with zero executable targets and a non-machine Conformance obligation
(`attestation` for META-001, ACC-003, SEC-002 and REC-001; `review` for the others). Their
technical enforcement is not implemented anywhere, including here, and nothing here
collects or checks that review or attestation.

Every rule outside the four universal ones is CONDITIONAL on exactly one Capability:
ACC-001 to ACC-004 on `web-interface`; SEC-002, REC-001 and SEC-003 on `operated-service`;
DATA-001 on `data-analysis`; PRED-001 on `predictive-model`; SEC-004, SEC-005 and ACC-005 on
`mobile-app`. A conditional rule is carried in `effective-policy.json` only when
`project-capabilities.json` declares its Capability, and no Capability implies another:
declare every one that is true of this project. Read that artifact for the rules this
repository is actually bound by. Applicability decides which rules bind a project and
which Conformance obligations it has; it decides nothing about whether any detector runs
anywhere.

## Upgrading the pin

Upgrades are a separate reviewed pull request: regenerate from the new immutable annotated
tag, update `lock.json` deliberately, review the complete governance diff, and run both
worktree and staged verification before merge.
