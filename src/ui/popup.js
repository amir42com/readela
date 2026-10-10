// Popup controls. Settings are read from and written to the shared
// preferences; the page reacts to the stored change. The saved place belongs
// to the conversation in the active tab, so those three buttons ask that page.

import { api } from "../browser/api.js";
import { askPage } from "../browser/messages.js";
import { loadPreferences, savePreferences } from "../browser/storage.js";
import { resetPreferences } from "../core/index.js";

const GROUPS = ["theme", "font", "size", "spacing", "direction"];

// One plain sentence for the choice that is selected. Original needs none:
// the line under the heading says what it means everywhere.
const HINTS = {
  theme: {
    page: "",
    paper: "Warm, light paper colours for responses.",
    night: "Warm, dark colours for responses.",
  },
  font: {
    page: "",
    sans: "Built-in Vazirmatn for Persian and Arabic.",
  },
  direction: {
    page: "",
    auto: "Chosen for each paragraph from its words.",
    rtl: "All text reads right-to-left.",
    ltr: "All text reads left-to-right.",
  },
};

// What is known about the conversation in the tab.
const PLACE_NOTES = {
  unavailable: "Open a ChatGPT or Claude conversation to save a place.",
  nowhere: "Open a conversation to save a place.",
  off: "Turn Readela on to use saved places.",
  none: "",
  saved: "A place is saved in this conversation.",
};

// What an action did. Each is said only when the page reports it as true.
const PLACE_RESULTS = {
  set: {
    saved: "Place saved.",
    nothing: "No response paragraph is in view to save.",
    ambiguous: "This paragraph cannot be told apart from an identical one beside it. Choose another.",
    failed: "The place could not be saved. Nothing was changed.",
  },
  go: {
    arrived: "Returned to your saved place.",
    approximate: "Returned close to your saved place. Its paragraph has changed.",
    unresolved: "Your saved place was not found. It is still saved.",
    stopped: "Return was stopped. Your place is still saved.",
    failed: "Return did not finish. Your place is still saved.",
  },
  clear: {
    none: "Saved place cleared.",
    failed: "The place could not be cleared. It is still saved.",
  },
};

const BUSY_NOTES = { go: "Looking for your saved place…" };

const enabled = document.getElementById("enabled");
const enabledLabel = document.getElementById("enabled-label");
const stateNote = document.getElementById("state-note");
const settings = document.getElementById("settings");
const status = document.getElementById("status");
const placeNote = document.getElementById("place-note");
const placeButtons = {
  set: document.getElementById("place-save"),
  go: document.getElementById("place-return"),
  clear: document.getElementById("place-clear"),
};
const radios = Object.fromEntries(GROUPS.map((name) => [name, [...document.querySelectorAll(`input[name="${name}"]`)]]));

let preferences;
let place = "unavailable";

// Requests to the page are answered one at a time and in the order they were
// made, so a slow first report can never overwrite the result of a later action.
let asked = Promise.resolve();
const ask = (request) => {
  const answer = asked.then(() => askPage(request));
  asked = answer.catch(() => {});
  return answer;
};

function render() {
  enabled.checked = preferences.enabled;
  enabledLabel.textContent = preferences.enabled ? "On" : "Off";
  stateNote.textContent = preferences.enabled
    ? "Original keeps that part as the site shows it."
    : "Readela is off. Pages look exactly as the site shows them. Your settings and saved places are kept.";
  settings.disabled = !preferences.enabled;
  for (const name of GROUPS) {
    for (const radio of radios[name]) radio.checked = radio.value === preferences[name];
    const hint = document.getElementById(`${name}-hint`);
    if (hint) hint.textContent = HINTS[name][preferences[name]];
  }
  renderPlace();
}

function renderPlace(message) {
  const state = preferences.enabled ? place : place === "unavailable" ? "unavailable" : "off";
  const usable = state !== "unavailable" && state !== "off" && state !== "nowhere";
  const saved = state === "saved";
  placeButtons.set.textContent = saved ? "Update place" : "Save place";
  placeButtons.set.disabled = !usable;
  placeButtons.go.disabled = !(usable && saved);
  placeButtons.clear.disabled = !(usable && saved);
  placeNote.textContent = message ?? PLACE_NOTES[state] ?? "";
}

async function update(change, message = "") {
  preferences = { ...preferences, ...change };
  render();
  try {
    await savePreferences(preferences);
    status.textContent = message;
  } catch {
    status.textContent = "The setting could not be saved.";
  }
}

const known = (answer) => (answer in PLACE_NOTES ? answer : "unavailable");

async function refreshPlace() {
  place = known((await ask("status")).status);
  renderPlace();
}

// Counts the reader's own saved-place actions, so a report asked for before
// an action never replaces that action's result.
let acted = 0;

async function act(request) {
  acted += 1;
  if (request in BUSY_NOTES) renderPlace(BUSY_NOTES[request]);
  const answer = (await ask(request)).status;
  // What the action did is said in its own words; what is saved now is asked
  // again, so the buttons never run ahead of the page.
  const result = PLACE_RESULTS[request][answer];
  place = known((await ask("status")).status);
  renderPlace(result ?? PLACE_NOTES[place]);
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
  update(resetPreferences(preferences), "Settings were reset. Your saved places are kept.");
});
for (const [request, button] of Object.entries(placeButtons)) {
  button.addEventListener("click", () => act(request));
}

document.getElementById("version").textContent = api.runtime.getManifest?.().version ?? "";

loadPreferences().then((stored) => {
  preferences = stored;
  render();
  refreshPlace();
});
