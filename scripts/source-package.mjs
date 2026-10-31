// Writes the source archive that accompanies a Firefox Add-ons submission.
//
//   dist/packages/readela-<version>-source.zip
//
// The archive is exactly the tracked tree of the current commit (git archive),
// so its bytes depend only on that commit, on any machine (see TZ below). It contains the readable source,
// package.json, the lockfile, the build scripts and the documentation, and
// nothing that is ignored or untracked: no node_modules, caches, build output
// or test results. The working tree must be clean so that the archive and the
// packages built from it describe the same source.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// A zip entry keeps its time as local time, and git archive writes the
// commit's time in the time zone of the machine. Fixing the zone to UTC makes
// the archive the same bytes on every machine.
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, TZ: "UTC" } }).trim();
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

const dirty = git("status", "--porcelain");
if (dirty) {
  console.error("the working tree has uncommitted or untracked changes; commit or remove them first:\n" + dirty);
  process.exit(1);
}

const commit = git("rev-parse", "HEAD");
const packages = path.join(root, "dist", "packages");
mkdirSync(packages, { recursive: true });
const file = path.join(packages, `readela-${version}-source.zip`);
git("archive", "--format=zip", `--prefix=readela-${version}-source/`, "-o", file, commit);

const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
console.log(`${path.relative(root, file)}  sha256 ${digest}  commit ${commit}`);
