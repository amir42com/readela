// Canonical consumer verifier for an immutable dev-standards source pin.
//
// GENERATED — DO NOT EDIT. This file is emitted byte-for-byte by the canonical
// dev-standards consumer bootstrap. Regenerate it instead of editing it.
//
// What it proves: source identity and byte integrity of the vendored canonical policy
// source; that the consumer root carries exactly the closed layout the bootstrap produces —
// nothing missing, nothing renamed, nothing added; that the owner's project Capability input
// and project Exception input are in their canonical representations; that the generated
// Effective Policy artifact is canonical, bound to both inputs (its Capability set equals the
// Capability input; its semantic Exceptions equal the { id, rule, expires } projection of the
// Exception input), bound to the pinned source identity, and that its semantic payload hashes to
// the effectivePolicyHash the trust anchor records; that every carried Exception names a carried
// Rule with `non_bypassable: false`; and that no Exception is expired at the current UTC time.
//
// What it does NOT prove — deliberately, so it can stay dependency-free: that the declared
// Capabilities are members of the canonical Capability vocabulary; that the artifact's payload
// is the fresh resolution of the vendored canonical Policy for that Capability set and those
// Exceptions; that the resolved parameters satisfy the resolver-side closed parameter schemas.
// Those require the canonical YAML parser, the schema validator and the resolver, and are proven
// by the full generator (`node scripts/generate-consumer-bundle.mjs` from a dev-standards
// checkout), which refuses an artifact that does not equal fresh resolution. It does not prove
// that any review or attestation a Rule's `conformance` requires was performed or recorded, it
// does not authenticate `approved_by` cryptographically, and `effectivePolicyHash` does not bind
// an Exception's provenance or justification bytes — the project's Git commit binds the whole
// tracked input file. Nor does it prove that any behavioural rule is active in this repository:
// pinning and verifying identity is not enforcement. The canonical rules — the universal
// ATTR-001, SEC-001, NAME-001 and META-001, and the conditional ACC-001 to ACC-005, SEC-002 to
// SEC-005, REC-001, DATA-001 and PRED-001 — are
// activated, if at all, by separate reviewed work in this repository, nothing at runtime reads
// effective-policy.json or project-exceptions.json, and a Project Exception never disables a
// hook, a detector or a CI check.
//
// Expiry is evaluated against the real system clock inside `verifyConsumerPin`; there is no
// `--as-of` option, no environment-variable and no configuration override. A manipulated local
// clock can change a local expiry verdict — independently executed CI is additional evidence,
// not a trusted-time source. The internal check (`findExpiredExceptions`) takes its evaluation
// time as an explicit parameter so it can be tested deterministically.
//
// It is deliberately dependency-free and runs on a stock Node.js runtime, so a
// documentation-first repository does not have to adopt a package manifest, a test framework
// or an application stack in order to verify its pin. It reads only files vendored here: no
// network, no GitHub authentication, no access to the canonical source repository and no
// secret of any kind is required.
//
//   node .governance/dev-standards/verify-dev-standards.mjs
//   node .governance/dev-standards/verify-dev-standards.mjs --staged
//
// `--staged` verifies the exact Git index snapshot instead of the working tree, so a
// pre-commit hook checks what is actually about to be committed.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Closed layout contract. These names are part of the canonical bootstrap; a repository that
// renames them is no longer running the canonical bootstrap.
const CONSUMER_ROOT = ".governance/dev-standards";
const BUNDLE_ROOT = `${CONSUMER_ROOT}/bundle`;
const LOCK_PATH = `${CONSUMER_ROOT}/lock.json`;
const MANIFEST_PATH = `${CONSUMER_ROOT}/manifest.json`;
const README_PATH = `${CONSUMER_ROOT}/README.md`;
const VERIFIER_PATH = `${CONSUMER_ROOT}/verify-dev-standards.mjs`;
const PROJECT_INPUT_PATH = `${CONSUMER_ROOT}/project-capabilities.json`;
const PROJECT_EXCEPTIONS_PATH = `${CONSUMER_ROOT}/project-exceptions.json`;
const EFFECTIVE_POLICY_PATH = `${CONSUMER_ROOT}/effective-policy.json`;

const BUNDLE_FORMAT_VERSION = 2;
const LOCK_SCHEMA_VERSION = 3;
const PROJECT_INPUT_SCHEMA_VERSION = 1;
const PROJECT_EXCEPTIONS_SCHEMA_VERSION = 1;
const EFFECTIVE_POLICY_ARTIFACT_SCHEMA_VERSION = 2;
const SUPPORTED_RESOLVER_VERSIONS = [2];
const SOURCE_REPOSITORY = "amir42com/dev-standards";
const DOMAIN_SEPARATOR = "dev-standards.source-bundle.v2\n";
const EFFECTIVE_POLICY_DOMAIN_SEPARATOR = "dev-standards.effective-policy\n";

// The consumer contract this verifier accepts. The generator reads this from the verifier
// shipped at the tagged commit and refuses to produce a package that verifier would reject.
export const CONSUMER_CONTRACT = Object.freeze({
  lockSchemaVersion: LOCK_SCHEMA_VERSION,
  effectivePolicyArtifactSchemaVersion: EFFECTIVE_POLICY_ARTIFACT_SCHEMA_VERSION,
  supportedResolverVersions: Object.freeze([...SUPPORTED_RESOLVER_VERSIONS]),
});

// The exact canonical source closure, in canonical order.
const CANONICAL_SOURCE_PATHS = [
  "policy/enforcement-coverage.json",
  "policy/global-policy.yaml",
  "schemas/global-policy.schema.json",
  "tools/gitleaks.lock.json",
];

// The complete consumer-root layout, stated once. Every file the bootstrap produces, the trust
// anchor and the two owner inputs, and nothing else: the root is closed in both directions, so an
// extra, missing or renamed artifact anywhere under it is a failure rather than a curiosity.
const ROOT_FILE_PATHS = [LOCK_PATH, MANIFEST_PATH, README_PATH, VERIFIER_PATH, PROJECT_INPUT_PATH, PROJECT_EXCEPTIONS_PATH, EFFECTIVE_POLICY_PATH];
const EXPECTED_CONSUMER_LAYOUT = [
  ...ROOT_FILE_PATHS,
  ...CANONICAL_SOURCE_PATHS.map((p) => `${BUNDLE_ROOT}/${p}`),
].sort(comparePaths);

// Every path whose bytes must survive checkout unmodified on every platform. Everything here is
// compared byte-for-byte against a digest or a deterministic rebuild.
const BYTE_EXACT_PATHS = EXPECTED_CONSUMER_LAYOUT;

// Every metadata contract is closed: an unexpected extra key is a failure, which is how a
// smuggled timestamp, hostname or absolute path is rejected rather than ignored.
const LOCK_KEYS = [
  "schemaVersion",
  "sourceRepository",
  "policyRef",
  "policyCommit",
  "sourceBundleSha256",
  "effectivePolicyHash",
];
const MANIFEST_KEYS = [
  "bundleFormatVersion",
  "generated",
  "doNotEdit",
  "sourceRepository",
  "policyRef",
  "policyCommit",
  "sourceBundleSha256",
  "files",
];
const MANIFEST_FILE_KEYS = ["path", "sha256", "bytes"];
const PROJECT_INPUT_KEYS = ["schemaVersion", "capabilities"];
const PROJECT_EXCEPTIONS_KEYS = ["schemaVersion", "exceptions"];
// The closed v1 Exception record in canonical field order; `decision` is optional. Exactly
// `id`, `rule` and `expires` are semantic (they enter the payload and the hash); the rest is
// provenance and rationale, tracked in the input and bound by the repository commit only.
const EXCEPTION_REQUIRED_KEYS = ["id", "rule", "expires", "approved_by", "approved_on", "justification"];
const EXCEPTION_KEYS = [...EXCEPTION_REQUIRED_KEYS, "decision"];
const SEMANTIC_EXCEPTION_KEYS = ["id", "rule", "expires"];
const ARTIFACT_KEYS = [
  "artifactSchemaVersion",
  "sourceRepository",
  "policyRef",
  "policyCommit",
  "sourceBundleSha256",
  "resolverVersion",
  "capabilities",
  "payload",
  "effectivePolicyHash",
];
const EFFECTIVE_RULE_KEYS = ["id", "status", "severity", "non_bypassable", "targeting", "conformance", "parameters"];
// The closed non-machine Conformance vocabulary (decision 0021). Orthogonal to targeting: an
// Effective Rule is never `unimplemented` with Conformance `none`, because such a rule would
// state no operative obligation.
const CONFORMANCE_MODES = ["none", "review", "attestation"];

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const CRLF = Buffer.from("\r\n");
const SHA256_HEX = /^[0-9a-f]{64}$/;
const COMMIT_HEX = /^[0-9a-f]{40}$/;
const POLICY_REF_RE = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
const EFFECTIVE_POLICY_HASH_RE = /^sha256:[0-9a-f]{64}$/;
const CAPABILITY_ID_RE = /^[a-z]+(-[a-z]+)*$/;
const RULE_ID_RE = /^[A-Z]+-[0-9]{3}$/;
// A stable project-local Exception identifier: uppercase ASCII letters and digits in
// `-`-separated segments, 1 to 64 bytes (decision 0028). ASCII-only and single-case by design —
// the id is grant identity, it enters `effectivePolicyHash`, and canonical ordering is byte-wise
// UTF-8, so byte-distinct but visually identical identifiers would be distinct grants. `EXC-NNN`
// (decision 0022 §4) is the preferred form and a member of this class.
//
// Exported so the repository can bind this shipped contract to its own parser and to the
// published JSON Schemas mechanically; a consumer never needs it.
export const EXCEPTION_ID_RE = /^(?=.{1,64}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const CALENDAR_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

class PinVerificationError extends Error {
  constructor(code, detail) {
    super(`dev-standards pin verification failed [${code}]: ${detail}`);
    this.name = "PinVerificationError";
    this.code = code;
  }
}

function check(condition, code, detail) {
  if (!condition) throw new PinVerificationError(code, detail);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runGit(root, args, code, detail) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  check(result.status === 0, code, detail);
  return result.stdout;
}

async function readWorktreeFile(root, repositoryPath) {
  const absolute = join(root, ...repositoryPath.split("/"));
  let stat;
  try {
    stat = await lstat(absolute);
  } catch {
    throw new PinVerificationError("file-missing", `${repositoryPath} is missing`);
  }
  check(stat.isFile(), "file-not-regular", `${repositoryPath} is not a regular file`);
  return readFile(absolute);
}

function readIndexFile(root, repositoryPath) {
  return runGit(
    root,
    ["show", `:${repositoryPath}`],
    "file-missing",
    `${repositoryPath} is missing from the Git index`,
  );
}

async function readPinnedFile(root, repositoryPath, source) {
  return source === "index"
    ? readIndexFile(root, repositoryPath)
    : readWorktreeFile(root, repositoryPath);
}

function assertCanonicalBytes(bytes, label) {
  check(!bytes.subarray(0, 3).equals(UTF8_BOM), "bom-drift", `${label} carries a UTF-8 byte-order mark`);
  check(!bytes.includes(CRLF), "crlf-drift", `${label} contains CRLF bytes`);
}

// Strict UTF-8 decoding. `Buffer.toString("utf8")` silently substitutes U+FFFD for an invalid
// byte sequence, which would let malformed bytes pass as text the contract promises is valid
// UTF-8. A fatal decoder rejects them instead, before anything is parsed.
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

function decodeStrictUtf8(bytes, label) {
  try {
    return STRICT_UTF8.decode(bytes);
  } catch {
    throw new PinVerificationError("invalid-utf8", `${label} bytes are not valid UTF-8`);
  }
}

function parseCanonicalJson(bytes, label) {
  assertCanonicalBytes(bytes, label);
  const text = decodeStrictUtf8(bytes, label);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PinVerificationError("json-malformed", `${label} bytes are not valid JSON`);
  }
  check(
    `${JSON.stringify(parsed, null, 2)}\n` === text,
    "json-not-canonical",
    `${label} is not canonically serialized JSON`,
  );
  check(
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed),
    "json-not-object",
    `${label} root is not a JSON object`,
  );
  return parsed;
}

function assertClosedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    check(allowed.includes(key), "unknown-field", `${label} carries an unknown field: ${key}`);
  }
  for (const key of allowed) {
    check(
      Object.prototype.hasOwnProperty.call(value, key),
      "missing-field",
      `${label} is missing the required field: ${key}`,
    );
  }
}

// Parses the external trust anchor. The lock is authority: every other artifact is compared
// against it, never the other way round. Only the current schema is accepted: a historical
// schema-2 anchor needs a reviewed upgrade through the generator, and no future schema is
// guessed at.
function parseLock(bytes) {
  const root = parseCanonicalJson(bytes, "lock.json");
  check(root.schemaVersion === LOCK_SCHEMA_VERSION, "lock-schema-version", `unsupported lock schema version ${JSON.stringify(root.schemaVersion)}; this verifier accepts schema ${LOCK_SCHEMA_VERSION}`);
  assertClosedKeys(root, LOCK_KEYS, "lock");
  check(root.sourceRepository === SOURCE_REPOSITORY, "lock-source-repository", "unexpected source repository");
  check(POLICY_REF_RE.test(String(root.policyRef)), "lock-policy-ref", "policyRef is not a release label");
  check(COMMIT_HEX.test(String(root.policyCommit)), "lock-policy-commit", "policyCommit is not a commit id");
  check(
    SHA256_HEX.test(String(root.sourceBundleSha256)),
    "lock-aggregate-hash",
    "sourceBundleSha256 is not a SHA-256 digest",
  );
  check(
    EFFECTIVE_POLICY_HASH_RE.test(String(root.effectivePolicyHash)),
    "lock-effective-policy-hash",
    "effectivePolicyHash is not sha256:<64 lowercase hex digits>",
  );
  return root;
}

// Parses the generated manifest and binds every identity field to the lock.
function parseManifest(bytes, lock) {
  const root = parseCanonicalJson(bytes, "manifest.json");
  assertClosedKeys(root, MANIFEST_KEYS, "manifest");
  check(
    root.bundleFormatVersion === BUNDLE_FORMAT_VERSION,
    "manifest-format-version",
    "unsupported bundle format version",
  );
  check(root.generated === true, "manifest-generated-flag", "manifest must mark the bundle generated");
  check(root.doNotEdit === true, "manifest-do-not-edit-flag", "manifest must mark the bundle do-not-edit");
  check(
    root.sourceRepository === lock.sourceRepository,
    "manifest-source-repository",
    "manifest source repository does not match the trust anchor",
  );
  check(root.policyRef === lock.policyRef, "manifest-policy-ref", "manifest policyRef does not match the trust anchor");
  check(
    root.policyCommit === lock.policyCommit,
    "manifest-policy-commit",
    "manifest policyCommit does not match the trust anchor",
  );
  check(
    root.sourceBundleSha256 === lock.sourceBundleSha256,
    "manifest-aggregate-hash",
    "manifest sourceBundleSha256 does not match the trust anchor",
  );

  check(Array.isArray(root.files), "manifest-files-not-array", "manifest files is not an array");
  check(
    root.files.length === CANONICAL_SOURCE_PATHS.length,
    "manifest-file-count",
    `manifest declares ${root.files.length} files, expected ${CANONICAL_SOURCE_PATHS.length}`,
  );

  const seen = new Set();
  for (const entry of root.files) {
    check(
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
      "manifest-file-not-object",
      "a manifest files entry is not a JSON object",
    );
    assertClosedKeys(entry, MANIFEST_FILE_KEYS, "manifest files entry");
    check(
      CANONICAL_SOURCE_PATHS.includes(entry.path),
      "manifest-unknown-source-path",
      `manifest declares a path outside the canonical source closure: ${entry.path}`,
    );
    check(!seen.has(entry.path), "manifest-duplicate-path", `manifest declares ${entry.path} twice`);
    seen.add(entry.path);
    check(SHA256_HEX.test(String(entry.sha256)), "manifest-file-hash", `${entry.path} sha256 is malformed`);
    check(
      Number.isSafeInteger(entry.bytes) && entry.bytes >= 0,
      "manifest-file-bytes",
      `${entry.path} bytes is not a non-negative integer`,
    );
  }
  for (let index = 1; index < root.files.length; index += 1) {
    check(
      comparePaths(root.files[index - 1].path, root.files[index].path) < 0,
      "manifest-file-order",
      "manifest files are not in byte-wise ascending path order",
    );
  }
  return root;
}

// Rebuilds the exact canonical manifest bytes from the trust anchor plus the bytes actually
// present, so any manifest formatting or ordering drift is a byte-level failure.
function serializeManifest({ lock, entries }) {
  return Buffer.from(
    `${JSON.stringify(
      {
        bundleFormatVersion: BUNDLE_FORMAT_VERSION,
        generated: true,
        doNotEdit: true,
        sourceRepository: lock.sourceRepository,
        policyRef: lock.policyRef,
        policyCommit: lock.policyCommit,
        sourceBundleSha256: lock.sourceBundleSha256,
        files: entries.map((entry) => ({ path: entry.path, sha256: entry.sha256, bytes: entry.bytes })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

// --- Project Capability input ----------------------------------------------------------------

// Describe the first defect of a Capability list as a committed representation, or null:
// an array of well-formed ids, no duplicate, byte-wise ascending. Membership in the canonical
// vocabulary is NOT judged here — that needs the pinned canonical Policy and the full resolver.
function findCapabilityListFailure(capabilities) {
  if (!Array.isArray(capabilities)) return "capabilities is not an array";
  for (let index = 0; index < capabilities.length; index += 1) {
    const value = capabilities[index];
    if (typeof value !== "string" || !CAPABILITY_ID_RE.test(value)) {
      return `capabilities[${index}] is not a flat lower-case kebab-case Capability id`;
    }
  }
  const seen = new Set();
  for (const value of capabilities) {
    if (seen.has(value)) return `capabilities declares ${value} more than once`;
    seen.add(value);
  }
  for (let index = 1; index < capabilities.length; index += 1) {
    if (comparePaths(capabilities[index - 1], capabilities[index]) >= 0) {
      return `capabilities is not in byte-wise ascending order (${capabilities[index - 1]} precedes ${capabilities[index]})`;
    }
  }
  return null;
}

function serializeProjectInput(input) {
  return Buffer.from(`${JSON.stringify({ schemaVersion: input.schemaVersion, capabilities: [...input.capabilities] }, null, 2)}\n`, "utf8");
}

// Parses the owner's project Capability input: closed keys, schema version, a canonical
// Capability list, and the exact canonical bytes rebuilt and compared — alternative key order,
// whitespace and duplicated JSON keys are refused, never normalized.
function parseProjectInput(bytes) {
  const root = parseCanonicalJson(bytes, "project-capabilities.json");
  assertClosedKeys(root, PROJECT_INPUT_KEYS, "project input");
  check(
    root.schemaVersion === PROJECT_INPUT_SCHEMA_VERSION,
    "project-input-schema-version",
    `unsupported project input schema version ${JSON.stringify(root.schemaVersion)}`,
  );
  const failure = findCapabilityListFailure(root.capabilities);
  check(failure === null, "project-input-capabilities", `project-capabilities.json: ${failure}`);
  check(
    serializeProjectInput(root).equals(bytes),
    "project-input-not-canonical",
    "project-capabilities.json is not its exact canonical representation",
  );
  return root;
}

// --- Project Exception input ---------------------------------------------------------------------

// Interprets a YYYY-MM-DD value as a UTC calendar date, or returns null: `startUtcMs` is
// 00:00:00Z on that date and `nextDayUtcMs` the first instant of the following day — the moment
// an Exception expiring on that date becomes expired. Impossible dates fail the round trip.
function parseCalendarDate(value) {
  if (typeof value !== "string" || !CALENDAR_DATE_RE.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const startUtcMs = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(startUtcMs);
  if (roundTrip.getUTCFullYear() !== year || roundTrip.getUTCMonth() !== month - 1 || roundTrip.getUTCDate() !== day) return null;
  return { startUtcMs, nextDayUtcMs: startUtcMs + MS_PER_DAY };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Describe the first defect of an Exception record list as a committed representation, or null:
// closed whole-Rule records with every required field, well-formed id, Rule id and calendar
// dates, approval not after expiry, unique ids, at most one Exception per Rule. Whether the Rule
// exists, is applicable and is bypassable is NOT judged here — that is eligibility, decided by
// the resolver and re-checked below against the Rules the artifact actually carries.
function findExceptionListFailure(exceptions) {
  if (!Array.isArray(exceptions)) return "exceptions is not an array";
  for (let index = 0; index < exceptions.length; index += 1) {
    const record = exceptions[index];
    const where = `exceptions[${index}]`;
    if (!isPlainObject(record)) return `${where} is not a JSON object`;
    for (const key of Object.keys(record)) if (!EXCEPTION_KEYS.includes(key)) return `${where} carries an unknown field: ${key}; a v1 Exception is whole-Rule only`;
    for (const key of EXCEPTION_REQUIRED_KEYS) if (!Object.prototype.hasOwnProperty.call(record, key)) return `${where} is missing the required field: ${key}`;
    if (typeof record.id !== "string" || !EXCEPTION_ID_RE.test(record.id)) return `${where}.id is not a stable project-local identifier (uppercase ASCII letters and digits in '-'-separated segments, at most 64 bytes)`;
    if (typeof record.rule !== "string" || !RULE_ID_RE.test(record.rule)) return `${where}.rule is not a rule identity`;
    const expires = parseCalendarDate(record.expires);
    if (expires === null) return `${where}.expires is not a valid YYYY-MM-DD calendar date`;
    if (!isNonEmptyString(record.approved_by)) return `${where}.approved_by is not a non-empty string`;
    const approvedOn = parseCalendarDate(record.approved_on);
    if (approvedOn === null) return `${where}.approved_on is not a valid YYYY-MM-DD calendar date`;
    if (!isNonEmptyString(record.justification)) return `${where}.justification is not a non-empty string`;
    if (Object.prototype.hasOwnProperty.call(record, "decision") && !isNonEmptyString(record.decision)) return `${where}.decision is present but not a non-empty string`;
    if (approvedOn.startUtcMs > expires.startUtcMs) return `${where} is approved after it expires`;
  }
  const ids = new Set();
  for (const record of exceptions) {
    if (ids.has(record.id)) return `exceptions declares the id ${record.id} more than once`;
    ids.add(record.id);
  }
  const rules = new Set();
  for (const record of exceptions) {
    if (rules.has(record.rule)) return `exceptions grants ${record.rule} more than once; at most one whole-Rule Exception per Rule`;
    rules.add(record.rule);
  }
  return null;
}

// Rebuilds the exact canonical bytes: fixed top-level and per-record field order, record order
// exactly as committed (record order is not semantic), two-space indentation, one trailing LF.
function serializeProjectExceptions(input) {
  const exceptions = input.exceptions.map((record) => {
    const out = {};
    for (const key of EXCEPTION_KEYS) if (Object.prototype.hasOwnProperty.call(record, key)) out[key] = record[key];
    return out;
  });
  return Buffer.from(`${JSON.stringify({ schemaVersion: input.schemaVersion, exceptions }, null, 2)}\n`, "utf8");
}

// Parses the owner's project Exception input: closed keys, schema version, a valid record list,
// and the exact canonical bytes rebuilt and compared — alternative key order, whitespace and
// duplicated JSON keys are refused, never normalized, and provenance text is never rewritten.
function parseProjectExceptions(bytes) {
  const root = parseCanonicalJson(bytes, "project-exceptions.json");
  assertClosedKeys(root, PROJECT_EXCEPTIONS_KEYS, "project exceptions");
  check(
    root.schemaVersion === PROJECT_EXCEPTIONS_SCHEMA_VERSION,
    "project-exceptions-schema-version",
    `unsupported project exceptions schema version ${JSON.stringify(root.schemaVersion)}`,
  );
  const failure = findExceptionListFailure(root.exceptions);
  check(failure === null, "project-exceptions-invalid", `project-exceptions.json: ${failure}`);
  check(
    serializeProjectExceptions(root).equals(bytes),
    "project-exceptions-not-canonical",
    "project-exceptions.json is not its exact canonical representation",
  );
  return root;
}

// The semantic projection of a valid Exception list — exactly { id, rule, expires } per record,
// in byte-wise ascending UTF-8 order of `id`. This is what the artifact payload must carry.
function projectSemanticExceptions(exceptions) {
  return exceptions
    .map((record) => ({ id: record.id, rule: record.rule, expires: record.expires }))
    .sort((left, right) => comparePaths(left.id, right.id));
}

/**
 * The Exceptions of a valid record list that are expired at `now`, as { id, rule, expires }.
 *
 * `expires` is the LAST UTC calendar date on which an Exception is valid: valid throughout that
 * date, expired from 00:00:00Z of the following day. `now` is an explicit parameter so the
 * verdict is deterministic under test; `verifyConsumerPin` passes the real system clock and
 * nothing else can supply another instant.
 *
 * @param {Array<object>} exceptions  A valid Exception record list.
 * @param {Date} now                  The evaluation instant.
 */
export function findExpiredExceptions(exceptions, now) {
  const failure = findExceptionListFailure(exceptions);
  check(failure === null, "project-exceptions-invalid", failure ?? "");
  check(now instanceof Date && Number.isFinite(now.getTime()), "exception-evaluation-time", "the evaluation time must be a valid Date");
  const at = now.getTime();
  return exceptions
    .filter((record) => at >= parseCalendarDate(record.expires).nextDayUtcMs)
    .map((record) => ({ id: record.id, rule: record.rule, expires: record.expires }));
}

// --- Effective Policy artifact -----------------------------------------------------------------

// Rebuilds a semantic value in canonical form: plain objects with byte-wise sorted keys, arrays
// in their own order, strings and booleans verbatim. Anything else is not representable.
function canonicalizeSemanticValue(value, where) {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((member, index) => canonicalizeSemanticValue(member, `${where}[${index}]`));
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort(comparePaths)) out[key] = canonicalizeSemanticValue(value[key], `${where}.${key}`);
    return out;
  }
  throw new PinVerificationError("artifact-payload", `${where} is not a canonical semantic value`);
}

function serializeSemanticPayload(payload) {
  return Buffer.from(`${JSON.stringify(canonicalizeSemanticValue(payload, "payload"), null, 2)}\n`, "utf8");
}

function computeEffectivePolicyHash(payloadBytes) {
  const hash = createHash("sha256");
  hash.update(Buffer.from(EFFECTIVE_POLICY_DOMAIN_SEPARATOR, "utf8"));
  hash.update(payloadBytes);
  return `sha256:${hash.digest("hex")}`;
}

// The closed Conformance record an Effective Rule carries: exactly `mode`, in the closed
// vocabulary. A shape check only; it proves nothing about review or attestation evidence.
function findConformanceFailure(conformance) {
  if (!isPlainObject(conformance)) return "record is missing";
  if (!CONFORMANCE_MODES.includes(conformance.mode)) return `mode ${JSON.stringify(conformance.mode)} is outside the closed vocabulary`;
  for (const key of Object.keys(conformance)) if (key !== "mode") return `carries an unknown field: ${key}`;
  return null;
}

// Basic shape of the semantic payload: exactly a rules array of closed Effective Rule objects
// with well-formed ids, unique and byte-wise ordered, each carrying a closed Conformance record.
// Deeper semantics — closed vocabularies, sound targeting, parameter schemas — belong to the
// resolver side.
function findSemanticPayloadFailure(payload) {
  if (!isPlainObject(payload)) return "payload is not a JSON object";
  const keys = [...Object.keys(payload)].sort(comparePaths);
  if (keys.length !== 2 || keys[0] !== "exceptions" || keys[1] !== "rules") return "payload must carry exactly the rules and exceptions arrays";
  if (!Array.isArray(payload.rules)) return "payload.rules is not an array";
  if (!Array.isArray(payload.exceptions)) return "payload.exceptions is not an array";
  const seen = new Set();
  for (let index = 0; index < payload.rules.length; index += 1) {
    const rule = payload.rules[index];
    if (!isPlainObject(rule)) return `payload.rules[${index}] is not a JSON object`;
    for (const key of Object.keys(rule)) if (!EFFECTIVE_RULE_KEYS.includes(key)) return `payload.rules[${index}] carries an unknown field: ${key}`;
    for (const key of EFFECTIVE_RULE_KEYS) if (!Object.prototype.hasOwnProperty.call(rule, key)) return `payload.rules[${index}] is missing the required field: ${key}`;
    if (typeof rule.id !== "string" || !RULE_ID_RE.test(rule.id)) return `payload.rules[${index}].id is not a rule identity`;
    if (seen.has(rule.id)) return `payload.rules[${index}] repeats the rule ${rule.id}`;
    seen.add(rule.id);
    if (typeof rule.non_bypassable !== "boolean") return `payload.rules[${index}].non_bypassable is not a boolean`;
    if (!isPlainObject(rule.targeting) || !isPlainObject(rule.parameters)) return `payload.rules[${index}] targeting and parameters must be objects`;
    const conformanceFailure = findConformanceFailure(rule.conformance);
    if (conformanceFailure) return `payload.rules[${index}].conformance ${conformanceFailure}`;
    if (rule.targeting.state === "unimplemented" && rule.conformance.mode === "none") {
      return `payload.rules[${index}] is unimplemented with conformance none, which states no operative obligation`;
    }
  }
  for (let index = 1; index < payload.rules.length; index += 1) {
    if (comparePaths(payload.rules[index - 1].id, payload.rules[index].id) >= 0) return "payload.rules is not in byte-wise ascending id order";
  }
  // Semantic Exceptions: closed { id, rule, expires }, unique, at most one per Rule, byte-wise
  // ordered, each naming a carried Rule that is `non_bypassable: false` — the eligibility the
  // artifact itself can prove. Applicability is the resolver's, which carries applicable Rules only.
  const carried = new Map(payload.rules.map((rule) => [rule.id, rule]));
  const exceptionIds = new Set();
  const exceptionRules = new Set();
  for (let index = 0; index < payload.exceptions.length; index += 1) {
    const exception = payload.exceptions[index];
    const where = `payload.exceptions[${index}]`;
    if (!isPlainObject(exception)) return `${where} is not a JSON object`;
    for (const key of Object.keys(exception)) if (!SEMANTIC_EXCEPTION_KEYS.includes(key)) return `${where} carries an unknown field: ${key}; provenance never enters the payload`;
    for (const key of SEMANTIC_EXCEPTION_KEYS) if (!Object.prototype.hasOwnProperty.call(exception, key)) return `${where} is missing the required field: ${key}`;
    if (typeof exception.id !== "string" || !EXCEPTION_ID_RE.test(exception.id)) return `${where}.id is not a stable identifier`;
    if (typeof exception.rule !== "string" || !RULE_ID_RE.test(exception.rule)) return `${where}.rule is not a rule identity`;
    if (parseCalendarDate(exception.expires) === null) return `${where}.expires is not a valid YYYY-MM-DD calendar date`;
    if (exceptionIds.has(exception.id)) return `${where} repeats the Exception ${exception.id}`;
    exceptionIds.add(exception.id);
    if (exceptionRules.has(exception.rule)) return `${where} grants ${exception.rule} a second time`;
    exceptionRules.add(exception.rule);
    const rule = carried.get(exception.rule);
    if (rule === undefined) return `${where} names ${exception.rule}, which the payload does not carry as an applicable Rule`;
    if (rule.non_bypassable !== false) return `${where} names ${exception.rule}, which is non_bypassable; Project Exceptions are forbidden for it`;
  }
  for (let index = 1; index < payload.exceptions.length; index += 1) {
    if (comparePaths(payload.exceptions[index - 1].id, payload.exceptions[index].id) >= 0) return "payload.exceptions is not in byte-wise ascending id order";
  }
  return null;
}

function serializeArtifact(artifact) {
  return Buffer.from(
    `${JSON.stringify(
      {
        artifactSchemaVersion: artifact.artifactSchemaVersion,
        sourceRepository: artifact.sourceRepository,
        policyRef: artifact.policyRef,
        policyCommit: artifact.policyCommit,
        sourceBundleSha256: artifact.sourceBundleSha256,
        resolverVersion: artifact.resolverVersion,
        capabilities: [...artifact.capabilities],
        payload: canonicalizeSemanticValue(artifact.payload, "payload"),
        effectivePolicyHash: artifact.effectivePolicyHash,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

// Parses the generated Effective Policy artifact and binds it to the trust anchor and to the
// owner's project inputs: provenance equals the lock, the Capability set equals the Capability
// input, the semantic Exceptions equal the projection of the Exception input, the resolver
// version is supported, the carried payload hashes to the carried hash, that hash equals the
// lock's effectivePolicyHash, and the exact bytes rebuild.
function parseArtifact(bytes, lock, projectInput, projectExceptions) {
  const root = parseCanonicalJson(bytes, "effective-policy.json");
  assertClosedKeys(root, ARTIFACT_KEYS, "effective-policy artifact");
  check(
    root.artifactSchemaVersion === EFFECTIVE_POLICY_ARTIFACT_SCHEMA_VERSION,
    "artifact-schema-version",
    `unsupported effective-policy artifact schema version ${JSON.stringify(root.artifactSchemaVersion)}`,
  );
  check(root.sourceRepository === lock.sourceRepository, "artifact-source-repository", "artifact source repository does not match the trust anchor");
  check(root.policyRef === lock.policyRef, "artifact-policy-ref", "artifact policyRef does not match the trust anchor");
  check(root.policyCommit === lock.policyCommit, "artifact-policy-commit", "artifact policyCommit does not match the trust anchor");
  check(root.sourceBundleSha256 === lock.sourceBundleSha256, "artifact-aggregate-hash", "artifact sourceBundleSha256 does not match the trust anchor");
  check(
    SUPPORTED_RESOLVER_VERSIONS.includes(root.resolverVersion),
    "artifact-resolver-version",
    `artifact resolverVersion ${JSON.stringify(root.resolverVersion)} is not supported by this verifier (supported: ${SUPPORTED_RESOLVER_VERSIONS.join(", ")})`,
  );
  const listFailure = findCapabilityListFailure(root.capabilities);
  check(listFailure === null, "artifact-capabilities", `effective-policy.json: ${listFailure}`);
  check(
    root.capabilities.length === projectInput.capabilities.length &&
      root.capabilities.every((id, index) => id === projectInput.capabilities[index]),
    "artifact-capabilities-binding",
    "the artifact was resolved for a different Capability set than project-capabilities.json declares; regenerate it",
  );
  const payloadFailure = findSemanticPayloadFailure(root.payload);
  check(payloadFailure === null, "artifact-payload", payloadFailure ?? "");
  check(
    EFFECTIVE_POLICY_HASH_RE.test(String(root.effectivePolicyHash)),
    "artifact-hash-format",
    "artifact effectivePolicyHash is not sha256:<64 lowercase hex digits>",
  );

  const payloadBytes = serializeSemanticPayload(root.payload);
  const recomputed = computeEffectivePolicyHash(payloadBytes);
  check(recomputed === root.effectivePolicyHash, "artifact-hash-mismatch", "the artifact effectivePolicyHash is not the hash of the payload it carries");
  // The semantic Exception binding: the artifact carries exactly the { id, rule, expires }
  // projection of the committed Exception input, in canonical order. An Exception added to,
  // removed from or retargeted in the artifact without the input — or in the input without
  // regeneration — fails here. Provenance edits are invisible by design.
  const expectedExceptions = projectSemanticExceptions(projectExceptions.exceptions);
  const carriedExceptions = root.payload.exceptions;
  check(
    carriedExceptions.length === expectedExceptions.length &&
      carriedExceptions.every((exception, index) => {
        const expected = expectedExceptions[index];
        return exception.id === expected.id && exception.rule === expected.rule && exception.expires === expected.expires;
      }),
    "artifact-exceptions-binding",
    "the artifact's semantic Exceptions are not the projection of project-exceptions.json; regenerate it",
  );
  // The decisive semantic check: the payload actually present hashes to the semantic identity
  // the trust anchor records, so rewriting artifact and hash together still fails — the lock
  // was not rewritten with them.
  check(recomputed === lock.effectivePolicyHash, "effective-policy-hash", "the Effective Policy payload does not hash to the effectivePolicyHash in the trust anchor");
  check(serializeArtifact(root).equals(bytes), "artifact-not-canonical-rebuild", "effective-policy.json is not the exact canonical serialization of its content");
  return root;
}

// Rebuilds the exact generated README bytes from the trust anchor.
//
// The README is generated output, so it is a pure function of the identity the consumer has
// decided to trust: no timestamp, path, host, account or other environment-dependent value
// appears in it. That is what lets the verifier compare it byte-for-byte rather than merely
// noting that some file by that name exists.
export function buildConsumerReadme({ sourceRepository, policyRef, policyCommit, sourceBundleSha256, effectivePolicyHash }) {
  return Buffer.from(
    [
      "# dev-standards source pin",
      "",
      "GENERATED — DO NOT EDIT. Everything in this directory except `lock.json`,",
      "`project-capabilities.json` and `project-exceptions.json` is produced by the canonical",
      "dev-standards consumer bootstrap. Regenerate it instead of editing it.",
      "",
      "## Pinned canonical identity",
      "",
      `- Source repository: \`${sourceRepository}\``,
      `- Policy ref: \`${policyRef}\` (annotated tag)`,
      `- Policy commit: \`${policyCommit}\``,
      `- Source bundle SHA-256: \`${sourceBundleSha256}\``,
      `- Effective policy hash: \`${effectivePolicyHash}\``,
      `- Resolver version: \`${SUPPORTED_RESOLVER_VERSIONS.join(", ")}\``,
      `- Effective policy artifact schema: \`${EFFECTIVE_POLICY_ARTIFACT_SCHEMA_VERSION}\``,
      `- Bundle format version: \`${BUNDLE_FORMAT_VERSION}\``,
      `- Lock schema version: \`${LOCK_SCHEMA_VERSION}\``,
      "",
      "Complete verified identity is the tuple (policy commit, source bundle SHA-256, resolver",
      "version, effective policy hash). The effective policy hash identifies the resolved semantic",
      "payload only — the applicable Rules (identity, status, severity, bypassability, exact",
      "targeting, Conformance mode, resolved parameters) and the granted Exceptions (id, rule,",
      "expires). It does not cover the policy commit, the source bundle digest, the resolver",
      "version, the Capability set, or an Exception's `approved_by`, `approved_on`,",
      "`justification` or `decision`: those provenance fields are bound by this repository's Git",
      "commit like any tracked file, never by the hash.",
      "",
      "## Contents",
      "",
      "- `bundle/` — the byte-exact canonical source files read from the pinned commit's Git objects.",
      "- `manifest.json` — generated evidence: per-file SHA-256, byte lengths and the aggregate digest.",
      "- `effective-policy.json` — generated: the Effective Policy resolved from the pinned canonical",
      "  Policy for the Capability set in `project-capabilities.json` and the Exceptions in",
      "  `project-exceptions.json`, with its semantic payload and `effectivePolicyHash`.",
      "- `verify-dev-standards.mjs` — generated, dependency-free verifier.",
      "- `project-capabilities.json` — OWNER INPUT, not generated: the Capabilities this repository",
      "  declares true of itself, in byte-wise ascending order. Changing it is a governance change;",
      "  regenerate afterwards, and review the resulting `effective-policy.json` (and `lock.json`,",
      "  when the effective policy hash changed) diff with it.",
      "- `project-exceptions.json` — OWNER INPUT, not generated: the whole-Rule Project Exceptions",
      "  this repository holds (decision 0022). Each is an explicitly approved, expiring deviation",
      "  from one applicable Rule whose canonical `non_bypassable` is `false`; no Exception is ever",
      "  created automatically. Granting, renewing, retargeting or removing an Exception is a",
      "  governance change: regenerate afterwards and review the `effective-policy.json` and",
      "  `lock.json` diff with it. Editing only `approved_by`, `approved_on`, `justification` or",
      "  `decision` changes this file and the repository commit, not the effective policy hash.",
      "- `lock.json` — the external trust anchor. It is **not** generated: it records the source",
      "  identity and the effective policy hash this repository has deliberately decided to trust,",
      "  and every other artifact is verified against it. Changing it is a governance change and",
      "  must be reviewed on its own.",
      "",
      "This directory is closed: these entries and nothing else. Verification fails on an extra,",
      "missing or renamed artifact anywhere under it.",
      "",
      "## Verification",
      "",
      "```",
      `node ${VERIFIER_PATH}`,
      `node ${VERIFIER_PATH} --staged`,
      "```",
      "",
      "Verification reads only files vendored here. It requires no network, no GitHub",
      "authentication, no access to the canonical source repository and no secret. The `--staged`",
      "form verifies the exact Git index snapshot, so a pre-commit hook checks what is actually",
      "about to be committed.",
      "",
      "The verifier proves the consumer layout, lock integrity, the source bundle digest, the",
      "canonical representation of `project-capabilities.json` (id syntax, order, no duplicate),",
      "the canonical representation of `project-exceptions.json` (closed whole-Rule records, valid",
      "dates, unique ids, at most one Exception per Rule), the canonical representation of",
      "`effective-policy.json`, a supported resolver version, the binding of the artifact's",
      "Capability set to the Capability input, the binding of the artifact's semantic Exceptions",
      "(id, rule, expires) to the Exception input, that every carried Exception names a carried",
      "Rule with `non_bypassable: false`, that no Exception is expired at the current UTC time,",
      "the binding of the artifact's provenance to the lock, and that the artifact payload hashes",
      "to the lock's effective policy hash.",
      "",
      "It does **not** prove that the declared Capabilities are members of the canonical",
      "vocabulary, that the payload is the fresh resolution of the vendored canonical Policy, or",
      "that resolved parameters satisfy the resolver-side parameter schemas: those are proven by",
      "the full generator from a dev-standards checkout, which refuses an artifact that does not",
      "equal fresh resolution. It does not prove that any review or attestation a Rule's",
      "Conformance mode requires was performed or recorded, and it does not authenticate",
      "`approved_by` cryptographically.",
      "",
      "Expiry is judged against this machine's clock. A manipulated local clock can change a local",
      "expiry verdict; independently executed CI is additional evidence, not a trusted-time",
      "source, and no `--as-of`, environment-variable or configuration override exists.",
      "",
      "## What this does not claim",
      "",
      "This is a source identity, byte integrity and effective-policy identity pin only. Pinning",
      "and verifying identity is **not** behavioural enforcement. This directory does not claim:",
      "",
      "- that ATTR-001, SEC-001, NAME-001, META-001 or any conditional rule (ACC-001 to ACC-005,",
      "  SEC-002 to SEC-005, REC-001, DATA-001, PRED-001) is enforced in this repository;",
      "- that any hook or CI step reads `effective-policy.json` or `project-exceptions.json` — none",
      "  does;",
      "- that a Project Exception disables, weakens or bypasses any hook, detector or CI check —",
      "  it changes this repository's governed Effective Policy identity and nothing at runtime;",
      "- that any Rule's review or attestation obligation (`conformance.mode`) is satisfied, or",
      "  that Conformance evidence exists anywhere — Conformance reporting is not part of this pin;",
      "- profiles, presets or any second policy layer;",
      "- mandatory merge protection in the hosting platform.",
      "",
      "META-001, ACC-002 to ACC-005, SEC-002 to SEC-005, REC-001, DATA-001 and PRED-001 are active",
      "canonical policy with zero executable targets and a non-machine Conformance obligation",
      "(`attestation` for META-001, ACC-003, SEC-002 and REC-001; `review` for the others). Their",
      "technical enforcement is not implemented anywhere, including here, and nothing here",
      "collects or checks that review or attestation.",
      "",
      "Every rule outside the four universal ones is CONDITIONAL on exactly one Capability:",
      "ACC-001 to ACC-004 on `web-interface`; SEC-002, REC-001 and SEC-003 on `operated-service`;",
      "DATA-001 on `data-analysis`; PRED-001 on `predictive-model`; SEC-004, SEC-005 and ACC-005 on",
      "`mobile-app`. A conditional rule is carried in `effective-policy.json` only when",
      "`project-capabilities.json` declares its Capability, and no Capability implies another:",
      "declare every one that is true of this project. Read that artifact for the rules this",
      "repository is actually bound by. Applicability decides which rules bind a project and",
      "which Conformance obligations it has; it decides nothing about whether any detector runs",
      "anywhere.",
      "",
      "## Upgrading the pin",
      "",
      "Upgrades are a separate reviewed pull request: regenerate from the new immutable annotated",
      "tag, update `lock.json` deliberately, review the complete governance diff, and run both",
      "worktree and staged verification before merge.",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function collectWorktreeInventory(root) {
  const absoluteConsumerRoot = join(root, ...CONSUMER_ROOT.split("/"));
  const paths = [];

  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      const missing = relative(root, directory).split(sep).join(posix.sep);
      throw new PinVerificationError("consumer-root-unreadable", `${missing} is missing or unreadable`);
    }
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const repositoryPath = relative(root, absolute).split(sep).join(posix.sep);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else {
        check(entry.isFile(), "file-not-regular", `${repositoryPath} is not a regular file`);
        paths.push(repositoryPath);
      }
    }
  }

  await visit(absoluteConsumerRoot);
  return paths.sort(comparePaths);
}

function collectIndexInventory(root) {
  const output = decodeStrictUtf8(
    runGit(
      root,
      ["ls-files", "--stage", "--", CONSUMER_ROOT],
      "index-unreadable",
      "the governance index inventory could not be read from Git",
    ),
    "the governance index inventory",
  )
    .replace(/\r\n/g, "\n")
    .trim();

  const entries =
    output === ""
      ? []
      : output.split("\n").map((line) => {
          const match = /^(\d{6}) ([0-9a-f]{40,64}) (\d)\t(.+)$/.exec(line);
          check(match !== null, "index-malformed", "the governance index inventory is malformed");
          return { mode: match[1], stage: match[3], path: match[4] };
        });

  for (const entry of entries) {
    check(entry.stage === "0", "index-unresolved-stage", `${entry.path} has an unresolved index stage`);
    check(
      entry.mode === "100644",
      "index-file-mode",
      `${entry.path} is not a regular non-executable file in the index`,
    );
  }

  return entries.map((entry) => entry.path).sort(comparePaths);
}

// Verifies the complete consumer-root layout, not merely the bundle. The root is closed: the
// seven root-level artifacts and the canonical closure under `bundle/`, and nothing else.
async function verifyInventory(root, source) {
  const actual = source === "index" ? collectIndexInventory(root) : await collectWorktreeInventory(root);
  const missing = EXPECTED_CONSUMER_LAYOUT.filter((p) => !actual.includes(p));
  const extra = actual.filter((p) => !EXPECTED_CONSUMER_LAYOUT.includes(p));
  const duplicated = actual.filter((p, index) => actual.indexOf(p) !== index);
  check(
    missing.length === 0,
    "inventory-missing-file",
    `missing from ${CONSUMER_ROOT}: ${missing.join(", ")}`,
  );
  check(
    extra.length === 0,
    "inventory-extra-file",
    `not part of the closed consumer layout: ${extra.join(", ")}`,
  );
  check(
    duplicated.length === 0,
    "inventory-duplicate-file",
    `declared more than once: ${duplicated.join(", ")}`,
  );
}

// Confirms the byte-preserving Git attributes are still in force. Losing them would let a
// checkout rewrite line endings and silently invalidate every recorded digest.
function verifyGitAttributes(root, source) {
  const args = ["check-attr"];
  if (source === "index") args.push("--cached");
  args.push("text", "--", ...BYTE_EXACT_PATHS);
  const actual = runGit(root, args, "attributes-unreadable", "Git attributes could not be read")
    .toString("utf8")
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n");
  const expected = BYTE_EXACT_PATHS.map((repositoryPath) => `${repositoryPath}: text: unset`);
  for (let index = 0; index < expected.length; index += 1) {
    check(
      actual[index] === expected[index],
      "attributes-not-byte-preserving",
      `${BYTE_EXACT_PATHS[index]} is not protected by the required -text Git attribute`,
    );
  }
}

/**
 * Verifies the immutable dev-standards source pin and the Effective Policy pin in `root`.
 *
 * @param {{ root?: string, source?: "worktree" | "index" }} options
 * @returns {Promise<{ sourceRepository: string, policyRef: string, policyCommit: string, sourceBundleSha256: string, effectivePolicyHash: string, resolverVersion: number, capabilities: string[] }>}
 */
export async function verifyConsumerPin({ root = process.cwd(), source = "worktree" } = {}) {
  check(source === "worktree" || source === "index", "bad-source", "source must be worktree or index");

  // The closed layout is established first, so a missing, extra or renamed artifact is reported
  // as layout drift rather than surfacing later as an incidental read failure.
  await verifyInventory(root, source);

  const lock = parseLock(await readPinnedFile(root, LOCK_PATH, source));
  const manifestBytes = await readPinnedFile(root, MANIFEST_PATH, source);
  const manifest = parseManifest(manifestBytes, lock);

  const readmeBytes = await readPinnedFile(root, README_PATH, source);
  assertCanonicalBytes(readmeBytes, README_PATH);
  check(
    buildConsumerReadme(lock).equals(readmeBytes),
    "readme-not-canonical-rebuild",
    "README.md is not the exact generated text for the identity recorded in the trust anchor",
  );

  verifyGitAttributes(root, source);

  const aggregate = createHash("sha256");
  aggregate.update(Buffer.from(DOMAIN_SEPARATOR, "utf8"));
  aggregate.update(Buffer.from(`${CANONICAL_SOURCE_PATHS.length}\n`, "utf8"));

  const entries = [];
  for (const canonicalPath of CANONICAL_SOURCE_PATHS) {
    const repositoryPath = `${BUNDLE_ROOT}/${canonicalPath}`;
    const bytes = await readPinnedFile(root, repositoryPath, source);
    assertCanonicalBytes(bytes, repositoryPath);

    const declared = manifest.files.find((entry) => entry.path === canonicalPath);
    check(declared !== undefined, "manifest-missing-file-entry", `manifest has no entry for ${canonicalPath}`);
    check(
      bytes.length === declared.bytes,
      "file-byte-length",
      `${canonicalPath} is ${bytes.length} bytes, manifest declares ${declared.bytes}`,
    );
    const digest = sha256(bytes);
    check(digest === declared.sha256, "file-hash", `${canonicalPath} SHA-256 does not match the manifest`);

    aggregate.update(Buffer.from(`${canonicalPath}\n`, "utf8"));
    aggregate.update(Buffer.from(`${bytes.length}\n`, "utf8"));
    aggregate.update(bytes);
    entries.push({ path: canonicalPath, sha256: digest, bytes: bytes.length });
  }

  // The decisive source check. The aggregate is recomputed from the bytes actually present and
  // compared with the external trust anchor, so rewriting the bundle and the manifest
  // together still fails: the lock was not rewritten with them.
  check(
    aggregate.digest("hex") === lock.sourceBundleSha256,
    "aggregate-hash",
    "the aggregate source-bundle digest does not match the trust anchor",
  );

  check(
    serializeManifest({ lock, entries }).equals(manifestBytes),
    "manifest-not-canonical-rebuild",
    "the manifest is not the exact canonical serialization of the trust anchor and the vendored bytes",
  );

  // The Effective Policy pin: owner inputs, then the artifact bound to them and to the lock.
  const projectInput = parseProjectInput(await readPinnedFile(root, PROJECT_INPUT_PATH, source));
  const projectExceptions = parseProjectExceptions(await readPinnedFile(root, PROJECT_EXCEPTIONS_PATH, source));
  const artifact = parseArtifact(await readPinnedFile(root, EFFECTIVE_POLICY_PATH, source), lock, projectInput, projectExceptions);

  // Expiry VALIDITY at the real current UTC time — the only place this verifier reads a clock,
  // and it can only refuse. An expired Exception is still part of the identity just verified;
  // leaving the expired state is the owner's explicit, tracked change.
  const expired = findExpiredExceptions(projectExceptions.exceptions, new Date());
  check(
    expired.length === 0,
    "project-exception-expired",
    `${expired.map((exception) => `${exception.id} (${exception.rule}, expired after ${exception.expires} UTC)`).join("; ")}: remove, renew or replace the Exception in project-exceptions.json and regenerate`,
  );

  return {
    sourceRepository: lock.sourceRepository,
    policyRef: lock.policyRef,
    policyCommit: lock.policyCommit,
    sourceBundleSha256: lock.sourceBundleSha256,
    effectivePolicyHash: lock.effectivePolicyHash,
    resolverVersion: artifact.resolverVersion,
    capabilities: [...artifact.capabilities],
    exceptions: artifact.payload.exceptions.map((exception) => exception.id),
  };
}

// Repository root, derived from this file's own location rather than the working directory,
// so the verifier behaves identically however it is invoked.
export function repositoryRootFromHere() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

const isCli =
  typeof process.argv[1] === "string" &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isCli) {
  const source = process.argv.includes("--staged") ? "index" : "worktree";
  verifyConsumerPin({ root: repositoryRootFromHere(), source })
    .then((identity) => {
      console.log(
        `dev-standards source pin verified (${source}): ${identity.policyRef} at ${identity.policyCommit} (${identity.sourceBundleSha256}); effective policy ${identity.effectivePolicyHash} (resolver ${identity.resolverVersion}); exceptions ${identity.exceptions.length === 0 ? "none" : identity.exceptions.join(", ")}`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "dev-standards pin verification failed");
      process.exitCode = 1;
    });
}
