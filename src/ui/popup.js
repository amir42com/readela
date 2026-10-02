// Popup controls. They read and write the shared preferences; the page
// reacts to the stored change, so the popup never talks to a tab directly.

import { loadPreferences, savePreferences } from "../browser/storage.js";
import { resetPreferences } from "../core/index.js";

const enabled = document.getElementById("enabled");
const enabledLabel = document.getElementById("enabled-label");
const stateNote = document.getElementById("state-note");
const status = document.getElementById("status");
const selects = ["font", "size", "spacing"].map((id) => document.getElementById(id));
const directions = [...document.querySelectorAll('input[name="direction"]')];

let preferences;

function render() {
  enabled.checked = preferences.enabled;
  enabledLabel.textContent = preferences.enabled ? "On" : "Off";
  stateNote.textContent = preferences.enabled
    ? ""
    : "Readela is off. The page is shown exactly as the site presents it.";
  for (const radio of directions) radio.checked = radio.value === preferences.direction;
  for (const select of selects) select.value = preferences[select.id];
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

enabled.addEventListener("change", () => update({ enabled: enabled.checked }));
for (const radio of directions) {
  radio.addEventListener("change", () => radio.checked && update({ direction: radio.value }));
}
for (const select of selects) {
  select.addEventListener("change", () => update({ [select.id]: select.value }));
}
document.getElementById("reset").addEventListener("click", () => {
  update(resetPreferences(preferences), "Reading settings were reset.");
});

loadPreferences().then((stored) => {
  preferences = stored;
  render();
});
