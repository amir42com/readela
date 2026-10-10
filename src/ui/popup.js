// Popup controls. Settings are read from and written to the shared
// preferences; the page reacts to the stored change. The reading mark belongs
// to the conversation in the active tab, so those three buttons ask that page.

import { api } from "../browser/api.js";
import { askPage } from "../browser/messages.js";
import { loadPreferences, savePreferences } from "../browser/storage.js";
import { resetPreferences } from "../core/index.js";

const GROUPS = ["direction", "theme", "font", "size", "spacing"];

// One plain sentence for the choice that is selected. Original needs none:
// the line under the heading says what it means everywhere.
const HINTS = {
  direction: {
    page: "",
    auto: "Chosen for each paragraph from its words.",
    rtl: "All text reads right-to-left.",
    ltr: "All text reads left-to-right.",
  },
  theme: {
    page: "",
    paper: "Warm, light paper colours for responses.",
    night: "Warm, dark colours for responses.",
  },
  font: {
    page: "",
    sans: "Built-in Vazirmatn for Persian and Arabic.",
  },
};

const MARK_NOTES = {
  unavailable: "Open a ChatGPT or Claude conversation to use the reading mark.",
  off: "Turn Readela on to use the reading mark.",
  none: "Nothing is marked in this conversation yet.",
  exact: "A place is marked in this conversation.",
  approximate: "A place is marked. Its paragraph has changed, so the mark is approximate.",
  missing: "Saved place not found. It may not be loaded yet, or the text has changed.",
  nothing: "There is no paragraph in view to mark.",
  failed: "The mark could not be saved. Please try again.",
};

const MARK_RESULTS = {
  set: { exact: "Marked. Go to mark brings you back here." },
  go: {
    exact: "You are at your mark.",
    approximate: "This is close to your mark. The paragraph itself has changed.",
  },
  clear: { none: "Mark cleared." },
};

const enabled = document.getElementById("enabled");
const enabledLabel = document.getElementById("enabled-label");
const stateNote = document.getElementById("state-note");
const settings = document.getElementById("settings");
const status = document.getElementById("status");
const markNote = document.getElementById("mark-note");
const markButtons = {
  set: document.getElementById("mark-set"),
  go: document.getElementById("mark-go"),
  clear: document.getElementById("mark-clear"),
};
const radios = Object.fromEntries(GROUPS.map((name) => [name, [...document.querySelectorAll(`input[name="${name}"]`)]]));

let preferences;
let mark = "unavailable";

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
    : "Readela is off. Pages look exactly as the site shows them. Your settings and reading marks are kept.";
  settings.disabled = !preferences.enabled;
  for (const name of GROUPS) {
    for (const radio of radios[name]) radio.checked = radio.value === preferences[name];
    const hint = document.getElementById(`${name}-hint`);
    if (hint) hint.textContent = HINTS[name][preferences[name]];
  }
  renderMark();
}

function renderMark(message) {
  const state = preferences.enabled ? mark : mark === "unavailable" ? "unavailable" : "off";
  const usable = state !== "unavailable" && state !== "off";
  const saved = state === "exact" || state === "approximate" || state === "missing";
  markButtons.set.disabled = !usable;
  markButtons.go.disabled = !(usable && saved);
  markButtons.clear.disabled = !(usable && saved);
  markNote.textContent = message ?? MARK_NOTES[state] ?? "";
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

async function refreshMark() {
  mark = (await ask("status")).status;
  renderMark();
}

// Bring the buttons in line with the page without replacing the message shown.
async function refreshMarkQuietly() {
  const shown = markNote.textContent;
  mark = (await ask("status")).status;
  renderMark(shown);
}

// Counts the reader's own reading-mark actions, so a report asked for before
// an action never replaces that action's result.
let acted = 0;

async function act(request) {
  acted += 1;
  const answer = (await ask(request)).status;
  // "nothing" and "failed" report that nothing changed; what was saved before still is.
  if (answer === "nothing" || answer === "failed") {
    renderMark(MARK_NOTES[answer]);
    refreshMarkQuietly();
    return;
  }
  mark = answer;
  renderMark(MARK_RESULTS[request][answer] ?? MARK_NOTES[answer]);
}

enabled.addEventListener("change", async () => {
  await update({ enabled: enabled.checked });
  // The page applies the stored change a moment later.
  const before = acted;
  setTimeout(() => before === acted && refreshMark(), 150);
});
for (const name of GROUPS) {
  for (const radio of radios[name]) {
    radio.addEventListener("change", () => radio.checked && update({ [name]: radio.value }));
  }
}
document.getElementById("reset").addEventListener("click", () => {
  update(resetPreferences(preferences), "Settings were reset. Your reading marks are kept.");
});
for (const [request, button] of Object.entries(markButtons)) {
  button.addEventListener("click", () => act(request));
}

document.getElementById("version").textContent = api.runtime.getManifest?.().version ?? "";

loadPreferences().then((stored) => {
  preferences = stored;
  render();
  refreshMark();
});
