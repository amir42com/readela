// The commands the browser manages for Readela: save or update the bookmark,
// return to it, remove it. None has a key until the reader assigns one in the
// browser's own shortcut settings. The browser stores the keys, refuses
// combinations it does not allow and delivers the commands; Readela records
// no key and listens for none.

import { api } from "./api.js";

/**
 * Each command's name in the manifest, with the request it makes of the page
 * and the word the popup shows for it.
 */
export const COMMANDS = Object.freeze([
  Object.freeze({ name: "bookmark", request: "quick", label: "Save" }),
  Object.freeze({ name: "bookmark-return", request: "go", label: "Return" }),
  Object.freeze({ name: "bookmark-remove", request: "clear", label: "Remove" }),
]);

/**
 * The keys the reader assigned: for each command, a string such as
 * "Alt+Shift+B", or an empty string when none is assigned. Null where the
 * browser offers no commands here.
 *
 * @returns {Promise<{ name: string, label: string, keys: string }[] | null>}
 */
export async function assignedShortcuts() {
  try {
    const held = await api.commands.getAll();
    const found = COMMANDS.map(({ name, label }) => {
      const command = held.find((entry) => entry.name === name);
      return command ? { name, label, keys: command.shortcut ?? "" } : null;
    });
    return found.includes(null) ? null : found;
  } catch {
    return null;
  }
}

/**
 * Open the browser's own settings for extension shortcuts. Firefox offers a
 * call for it; in Chrome the settings are a page of the browser's that an
 * extension may open in a tab. Neither needs a permission.
 *
 * @returns {Promise<boolean>} whether the settings were opened
 */
export async function openShortcutSettings() {
  try {
    if (typeof api.commands?.openShortcutSettings === "function") {
      await api.commands.openShortcutSettings();
    } else {
      await api.tabs.create({ url: "chrome://extensions/shortcuts" });
    }
    return true;
  } catch {
    return false;
  }
}
