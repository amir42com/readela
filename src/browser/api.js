// The one place that names the browser's extension namespace.
//
// Firefox provides `browser`; Chrome provides `chrome` (and `browser` in recent
// versions). Under Manifest V3 both return promises from the storage calls
// used here.

export const api = globalThis.browser ?? globalThis.chrome;

/** False once the extension has been disabled, removed or reloaded under a running page. */
export function isExtensionAlive() {
  try {
    return Boolean(api?.runtime?.id);
  } catch {
    return false;
  }
}
