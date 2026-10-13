// Popup controls. Settings are read from and written to the shared
// preferences; the page reacts to the stored change. A bookmark belongs to
// the conversation in the active tab, so those three buttons ask that page.
//
// Each thing the popup has to say is said beside what it is about: about the
// bookmark under the bookmark's buttons, about the settings under the
// settings. The footer says nothing.

import { api } from "../browser/api.js";
import { askPage } from "../browser/messages.js";
import { assignedShortcuts, openShortcutSettings } from "../browser/shortcut.js";
import { loadPreferences, savePreferences, watchMarks } from "../browser/storage.js";
import { MARK_LIMIT, resetPreferences } from "../core/index.js";

const GROUPS = ["theme", "direction", "font", "size", "spacing"];

// Under the name: what holds for every setting, or that Readela is off.
const STATE_NOTES = {
  on: ["Settings apply instantly.", "Original keeps the site’s setting."],
  off: ["Readela is off. Settings and bookmarks are kept."],
};

// What holds for the conversation in the tab, said under the buttons until an
// action has something of its own to say.
const PLACE_NOTES = {
  unavailable: "Open a ChatGPT or Claude conversation to use bookmarks.",
  nowhere: "Open a conversation to use bookmarks.",
  off: "Turn Readela on to use bookmarks.",
  none: "Save your place in this conversation.",
  saved: "A bookmark is saved in this conversation.",
};

// What an action did. Each is said only when the page reports it as true. A
// save that failed may still have been written before its answer was lost,
// so it is not said that nothing changed.
const PLACE_RESULTS = {
  set: {
    saved: "Bookmark saved.",
    nothing: "No response paragraph is in view. Scroll to one or select text in one.",
    ambiguous: "This paragraph matches another one. Choose a different paragraph.",
    failed: "Could not confirm the bookmark was saved.",
    full: `All ${MARK_LIMIT} bookmarks are in use. Open a bookmarked conversation and remove its bookmark to save a new one.`,
  },
  go: {
    arrived: "Returned to your bookmark.",
    approximate: "Returned near your bookmark. The paragraph has changed.",
    unresolved: "Your bookmark was not found. It is still saved.",
    stopped: "Return stopped. Your bookmark is still saved.",
    failed: "Return did not finish. Your bookmark is still saved.",
  },
  clear: {
    none: "Bookmark removed.",
    // Which of the two is true is known only from what is saved afterwards.
    failed: { saved: "Could not remove the bookmark. It is still saved.", other: "Could not confirm the bookmark was removed." },
  },
};

// The results that mean the action did not do what was asked. They are shown
// as warnings: a sign before the words, and a colour of their own.
const NOT_DONE = { set: ["nothing", "ambiguous", "failed", "full"], go: ["unresolved", "failed"], clear: ["failed"] };

const BUSY_NOTES = { go: "Looking for your bookmark…" };

const SETTINGS_NOTES = {
  reset: "Settings reset. Bookmarks kept.",
  failed: "Could not save your changes.",
};

const SHORTCUT_NOTE = "Open your browser’s extension shortcut settings to set or change shortcuts.";

const root = document.documentElement;
const enabled = document.getElementById("enabled");
const enabledLabel = document.getElementById("enabled-label");
const stateNote = document.getElementById("state-note");
const settings = document.getElementById("settings");
const status = document.getElementById("status");
const placeNote = document.getElementById("place-note");
const placeTotal = document.getElementById("place-total");
const placeTotalName = document.getElementById("place-total-name");
const shortcutState = document.getElementById("shortcut-state");
const shortcutSet = document.getElementById("shortcut-set");
const placeButtons = {
  set: document.getElementById("place-save"),
  go: document.getElementById("place-return"),
  clear: document.getElementById("place-clear"),
};
const radios = Object.fromEntries(GROUPS.map((name) => [name, [...document.querySelectorAll(`input[name="${name}"]`)]]));

let preferences;
let place = "unavailable";
let total = null; // conversations with a bookmark, on every supported site, from what is stored
// What the last bookmark action has to say, until another replaces it; null
// while there is only what holds for the conversation to say.
let said = null;

// Requests to the page are answered one at a time and in the order they were
// made, so a slow first report can never overwrite the result of a later action.
let asked = Promise.resolve();
const ask = (request) => {
  const answer = asked.then(() => askPage(request));
  asked = answer.catch(() => {});
  return answer;
};

// One line of words in its place, as plain words or as a warning.
function say(element, text, warning = false) {
  element.textContent = text;
  if (warning) element.dataset.kind = "warning";
  else delete element.dataset.kind;
}

function render() {
  // The popup wears the appearance that is chosen: Paper, Night, or for
  // Original whatever the browser itself is set to. Off does not change it.
  if (preferences.theme === "page") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preferences.theme);

  enabled.checked = preferences.enabled;
  enabledLabel.textContent = preferences.enabled ? "On" : "Off";
  stateNote.replaceChildren(
    ...STATE_NOTES[preferences.enabled ? "on" : "off"].flatMap((line, index) => {
      const part = document.createElement("span");
      part.textContent = line;
      return index === 0 ? [part] : [" ", part];
    }),
  );
  settings.disabled = !preferences.enabled;
  for (const name of GROUPS) {
    for (const radio of radios[name]) radio.checked = radio.value === preferences[name];
  }
  renderPlace();
}

function renderPlace() {
  const state = preferences.enabled ? place : place === "unavailable" ? "unavailable" : "off";
  const usable = state !== "unavailable" && state !== "off" && state !== "nowhere";
  const saved = state === "saved";
  placeButtons.set.textContent = saved ? "Update" : "Save place";
  placeButtons.set.setAttribute("aria-label", saved ? "Update bookmark" : "Save place in this conversation");
  placeButtons.set.title = saved
    ? "Replaces this conversation’s bookmark with the first response paragraph in view, or the paragraph containing your selected text."
    : "Saves the first response paragraph in view, or the paragraph containing your selected text.";
  placeButtons.set.disabled = !usable;
  placeButtons.go.disabled = !(usable && saved);
  placeButtons.clear.disabled = !(usable && saved);
  // The action a reader most likely came for stands out: Return where there
  // is a bookmark, Save place where there is none.
  placeButtons.set.classList.toggle("primary", !saved);
  placeButtons.go.classList.toggle("primary", saved);
  say(placeNote, said?.text ?? PLACE_NOTES[state] ?? "", said?.warning ?? false);
  // The count is of what the browser has stored, never of what was asked for.
  placeTotal.textContent = total === null ? "" : `${total} total`;
  placeTotalName.textContent = total === null ? "" : `${total} bookmarked conversations in total`;
}

// The keys the browser holds for the three bookmark commands. The browser
// assigns and checks them; the popup only says what they are and opens the
// way there. Where the browser tells nothing, nothing is said.
async function renderShortcut() {
  const commands = await assignedShortcuts();
  shortcutState.hidden = commands === null;
  shortcutSet.hidden = commands === null;
  if (commands === null) return;
  const set = commands.filter((command) => command.keys !== "");
  shortcutState.textContent =
    set.length === 0 ? "Shortcuts: not set" : ["Shortcuts:", ...set.map((command) => `${command.label}: ${command.keys}`)].join("\n");
  shortcutSet.textContent = set.length === 0 ? "Set shortcuts" : "Change shortcuts";
}

// A change of settings is shown at once and said nothing about when it is
// stored. Only a failure is said, and what Reset did.
async function update(change, message = "") {
  preferences = { ...preferences, ...change };
  render();
  try {
    await savePreferences(preferences);
    say(status, message);
  } catch {
    say(status, SETTINGS_NOTES.failed, true);
  }
}

const known = (answer) => (answer in PLACE_NOTES ? answer : "unavailable");

async function refreshPlace() {
  place = known((await ask("status")).status);
  said = null;
  renderPlace();
}

// What an action has to say, from its answer and from what is saved now.
function resultOf(request, answer, had) {
  if (request === "set" && answer === "saved" && had) return { text: "Bookmark updated.", warning: false };
  const result = PLACE_RESULTS[request][answer];
  if (result === undefined) return null;
  const text = typeof result === "string" ? result : result[place === "saved" ? "saved" : "other"];
  return { text, warning: NOT_DONE[request].includes(answer) };
}

// Counts the reader's own saved-place actions, so a report asked for before
// an action never replaces that action's result.
let acted = 0;

async function act(request) {
  acted += 1;
  if (request in BUSY_NOTES) {
    said = { text: BUSY_NOTES[request], warning: false };
    renderPlace();
  }
  const had = place === "saved";
  const answer = (await ask(request)).status;
  // What the action did is said in its own words; what is saved now is asked
  // again, so the buttons never run ahead of the page.
  place = known((await ask("status")).status);
  said = resultOf(request, answer, had);
  renderPlace();
  // A button that has just switched itself off hands the keyboard on.
  if (placeButtons[request].disabled && !placeButtons.set.disabled) placeButtons.set.focus();
}

enabled.addEventListener("change", async () => {
  await update({ enabled: enabled.checked });
  // The page applies the stored change a moment later.
  const before = acted;
  setTimeout(() => before === acted && refreshPlace(), 150);
});
for (const name of GROUPS) {
  for (const radio of radios[name]) {
    radio.addEventListener("change", () => radio.checked && update({ [name]: radio.value }));
  }
}
document.getElementById("reset").addEventListener("click", () => {
  update(resetPreferences(preferences), SETTINGS_NOTES.reset);
});
for (const [request, button] of Object.entries(placeButtons)) {
  button.addEventListener("click", () => act(request));
}

shortcutSet.addEventListener("click", async () => {
  if (!(await openShortcutSettings())) {
    said = { text: SHORTCUT_NOTE, warning: false };
    renderPlace();
  }
});

const version = api.runtime.getManifest?.().version ?? "";
document.getElementById("version").textContent = version;
document.getElementById("version-line").hidden = version === "";
renderShortcut();

loadPreferences().then((stored) => {
  preferences = stored;
  render();
  refreshPlace();
  // The stored places, now and whenever they change, here or in another tab.
  // What an action reported stays on screen; the state beside it follows.
  watchMarks(async (marks) => {
    total = marks.items.length;
    const before = acted;
    const answer = known((await ask("status")).status);
    if (before === acted) place = answer;
    renderPlace();
  });
});
