// Builds one loadable extension directory per browser from the shared source:
//
//   dist/chrome/    load with chrome://extensions > Load unpacked
//   dist/firefox/   load with about:debugging > Load Temporary Add-on
//
// With --package it also writes evaluation archives to dist/packages/.
// The only difference between the two outputs is the manifest.

import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { buildCss } from "../src/page/style.js";
import { createZip } from "./lib/zip.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src");
const dist = path.join(root, "dist");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const { version } = readJson(path.join(root, "package.json"));

const BROWSERS = ["chrome", "firefox"];

async function buildFor(browser) {
  const output = path.join(dist, browser);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(path.join(output, "popup"), { recursive: true });

  // One classic script per entry: content scripts cannot be ES modules.
  // Output is left unminified so the shipped code stays inspectable.
  await build({
    entryPoints: {
      content: path.join(source, "content", "main.js"),
      "popup/popup": path.join(source, "ui", "popup.js"),
    },
    outdir: output,
    bundle: true,
    format: "iife",
    target: ["chrome121", "firefox140"],
    charset: "utf8",
    legalComments: "none",
    logLevel: "warning",
  });

  writeFileSync(path.join(output, "content.css"), buildCss());
  cpSync(path.join(source, "ui", "popup.html"), path.join(output, "popup", "popup.html"));
  cpSync(path.join(source, "ui", "popup.css"), path.join(output, "popup", "popup.css"));
  cpSync(path.join(source, "icons"), path.join(output, "icons"), { recursive: true });

  const manifest = {
    ...readJson(path.join(source, "manifest", "base.json")),
    version,
    ...readJson(path.join(source, "manifest", `${browser}.json`)),
  };
  writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return output;
}

function listFiles(directory, prefix = "") {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    return statSync(full).isDirectory() ? listFiles(full, relative) : [{ name: relative, data: readFileSync(full) }];
  });
}

function packageFor(browser, directory) {
  const packages = path.join(dist, "packages");
  mkdirSync(packages, { recursive: true });
  const file = path.join(packages, `readela-${version}-${browser}.zip`);
  const archive = createZip(listFiles(directory));
  writeFileSync(file, archive);
  const digest = createHash("sha256").update(archive).digest("hex");
  console.log(`${path.relative(root, file)}  sha256 ${digest}`);
}

const withPackages = process.argv.includes("--package");
for (const browser of BROWSERS) {
  const directory = await buildFor(browser);
  console.log(`built ${path.relative(root, directory)}`);
  if (withPackages) packageFor(browser, directory);
}
