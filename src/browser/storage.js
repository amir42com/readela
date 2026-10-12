// Persistence. Two objects are ever stored, both in the browser's local
// extension storage: the preferences and the saved places. Nothing leaves the
// device.

import { MARKS_KEY, PREFERENCES_KEY, changeFor, normalizeMarks, normalizePreferences } from "../core/index.js";
import { api } from "./api.js";

export async function loadPreferences() {
  const stored = await api.storage.local.get(PREFERENCES_KEY);
  return normalizePreferences(stored[PREFERENCES_KEY]);
}

export async function savePreferences(preferences) {
  await api.storage.local.set({ [PREFERENCES_KEY]: normalizePreferences(preferences) });
}

/**
 * Change the stored places and return what is stored afterwards.
 *
 * The stored object is read immediately before it is written, so a copy
 * taken earlier is never written back. It is read once more after the write,
 * and that reading is the answer, so a caller reports only what is really
 * stored. A failed read or write rejects and changes nothing here.
 *
 * The browser offers no transaction for this storage: two of these that run
 * at the same moment can interleave. They are therefore never run from a
 * page or from the popup, only by the one writer below.
 *
 * @param {(marks: ReturnType<typeof normalizeMarks>) => unknown} change
 * @param {{ get: Function, set: Function }} [area] the storage area
 * @returns {Promise<ReturnType<typeof normalizeMarks>>}
 */
export async function changeMarks(change, area = api.storage.local) {
  const read = async () => normalizeMarks((await area.get(MARKS_KEY))[MARKS_KEY]);
  const next = normalizeMarks(change(await read()));
  await area.set({ [MARKS_KEY]: next });
  return read();
}

/**
 * The one writer of the stored places. It takes requests (see `changeFor` in
 * the core) and makes their changes one after another, each against what is
 * stored when its turn comes, so two that are asked for at the same moment,
 * from two tabs, cannot overwrite one another. Each is answered with what is
 * stored after it, or rejected when it is not a request or the browser could
 * not store it; a failure does not hold up the changes behind it.
 *
 * Nothing is kept between changes but their order. A writer that is gone (the
 * browser stops the background component when it is idle) leaves nothing
 * undone: the next one starts from what is stored.
 *
 * @param {{ get: Function, set: Function }} [area] the storage area
 * @returns {(request: unknown) => Promise<ReturnType<typeof normalizeMarks>>}
 */
export function createMarkWriter(area = api.storage.local) {
  let last = Promise.resolve();
  return (request) => {
    const change = changeFor(request);
    if (change === null) return Promise.reject(new Error("not a change to the stored places"));
    const done = last.then(() => changeMarks(change, area));
    last = done.catch(() => {});
    return done;
  };
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
 * Call `listener` with the stored places now and after every change.
 *
 * @param {(marks: ReturnType<typeof normalizeMarks>) => void} listener
 * @returns {() => void} stops watching
 */
export function watchMarks(listener) {
  return watch(MARKS_KEY, normalizeMarks, listener);
}
