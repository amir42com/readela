// The one command the browser manages for Readela: bookmark the reading
// position, or update the bookmark. It has no key until the reader assigns
// one in the browser's own shortcut settings. The browser stores the key,
// refuses combinations it does not allow and delivers the command; Readela
// records no key and listens for none.

import { api } from "./api.js";

/** The command's name in the manifest. */
export const BOOKMARK_COMMAND = "bookmark";

/**
 * The key the reader assigned to the command: a string such as "Alt+Shift+B",
 * an empty string when none is assigned, or null where the browser offers no
 * commands here.
 *
 * @returns {Promise<string | null>}
 */
export async function assignedShortcut() {
  try {
    const commands = await api.commands.getAll();
    const command = commands.find((entry) => entry.name === BOOKMARK_COMMAND);
    return command ? (command.shortcut ?? "") : null;
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
