// Background component: hears the one command the browser manages for
// Readela and passes it to the page in the tab it was given for.
//
// That is all it does. It keeps no state, sets no timer, makes no request and
// asks for no permission; the browser starts it when the command is given and
// lets it go afterwards. The page does the work, by the same function the
// popup's button calls.

import { api } from "../browser/api.js";
import { askTab } from "../browser/messages.js";
import { BOOKMARK_COMMAND } from "../browser/shortcut.js";

/**
 * Pass the command to the tab it was given in: the tab the browser names, or
 * the active tab of the window last in front. A tab that is not a supported
 * page has no one to answer, and nothing happens.
 *
 * @param {string} command
 * @param {{ id?: number } | undefined} tab
 */
export async function onCommand(command, tab) {
  if (command !== BOOKMARK_COMMAND) return { status: "unavailable" };
  let target = tab?.id ?? null;
  if (target === null) {
    try {
      const [active] = await api.tabs.query({ active: true, lastFocusedWindow: true });
      target = active?.id ?? null;
    } catch {
      target = null;
    }
  }
  return askTab(target, "quick");
}

api.commands.onCommand.addListener(onCommand);
// Reachable by name inside this component only, so that the handler can be
// called where a key the browser manages cannot be pressed: in the tests.
globalThis.readelaOnCommand = onCommand;
