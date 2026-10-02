// Preference persistence. Only the preferences object is ever stored, in the
// browser's local extension storage; nothing leaves the device.

import { PREFERENCES_KEY, normalizePreferences } from "../core/index.js";
import { api } from "./api.js";

export async function loadPreferences() {
  const stored = await api.storage.local.get(PREFERENCES_KEY);
  return normalizePreferences(stored[PREFERENCES_KEY]);
}

export async function savePreferences(preferences) {
  await api.storage.local.set({ [PREFERENCES_KEY]: normalizePreferences(preferences) });
}

/**
 * Call `listener` with the stored preferences now and after every change.
 *
 * @param {(preferences: ReturnType<typeof normalizePreferences>) => void} listener
 * @returns {() => void} stops watching
 */
export function watchPreferences(listener) {
  const onChanged = (changes, area) => {
    if (area === "local" && PREFERENCES_KEY in changes) {
      listener(normalizePreferences(changes[PREFERENCES_KEY].newValue));
    }
  };
  api.storage.onChanged.addListener(onChanged);
  loadPreferences().then(listener, () => listener(normalizePreferences(undefined)));
  return () => api.storage.onChanged.removeListener(onChanged);
}
