// Persistence. Two objects are ever stored, both in the browser's local
// extension storage: the preferences and the reading marks. Nothing leaves the
// device.

import { MARKS_KEY, PREFERENCES_KEY, normalizeMarks, normalizePreferences } from "../core/index.js";
import { api } from "./api.js";

export async function loadPreferences() {
  const stored = await api.storage.local.get(PREFERENCES_KEY);
  return normalizePreferences(stored[PREFERENCES_KEY]);
}

export async function savePreferences(preferences) {
  await api.storage.local.set({ [PREFERENCES_KEY]: normalizePreferences(preferences) });
}

export async function saveMarks(marks) {
  await api.storage.local.set({ [MARKS_KEY]: normalizeMarks(marks) });
}

// Call `listener` with the stored value of `key` now and after every change.
function watch(key, normalize, listener) {
  const onChanged = (changes, area) => {
    if (area === "local" && key in changes) listener(normalize(changes[key].newValue));
  };
  api.storage.onChanged.addListener(onChanged);
  api.storage.local.get(key).then(
    (stored) => listener(normalize(stored[key])),
    () => listener(normalize(undefined)),
  );
  return () => api.storage.onChanged.removeListener(onChanged);
}

/**
 * Call `listener` with the stored preferences now and after every change.
 *
 * @param {(preferences: ReturnType<typeof normalizePreferences>) => void} listener
 * @returns {() => void} stops watching
 */
export function watchPreferences(listener) {
  return watch(PREFERENCES_KEY, normalizePreferences, listener);
}

/**
 * Call `listener` with the stored reading marks now and after every change.
 *
 * @param {(marks: ReturnType<typeof normalizeMarks>) => void} listener
 * @returns {() => void} stops watching
 */
export function watchMarks(listener) {
  return watch(MARKS_KEY, normalizeMarks, listener);
}
