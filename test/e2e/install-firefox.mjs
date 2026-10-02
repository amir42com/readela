// Downloads the current stable Firefox build from Mozilla's release archive
// into .cache/browsers/ (ignored by Git) for the end-to-end tests. Nothing is
// installed system-wide and no existing browser profile is touched. Delete
// .cache/ to remove it.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { Browser, detectBrowserPlatform, install, resolveBuildId } from "@puppeteer/browsers";

const cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".cache", "browsers");
const platform = detectBrowserPlatform();
const buildId = await resolveBuildId(Browser.FIREFOX, platform, "stable");
const installed = await install({ browser: Browser.FIREFOX, buildId, cacheDir });
console.log(`Firefox ${buildId} at ${installed.executablePath}`);
