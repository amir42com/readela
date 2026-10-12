// Background component. It does two things, both for the bookmark:
//
// - it hears the commands the browser manages for Readela (save or update the
//   bookmark, return to it, remove it) and passes each to the page in the tab
//   it was given for; the page does the work, by the same functions the
//   popup's buttons call;
// - it is the one writer of the stored bookmarks. A page asks for a change
//   and this component makes it, one change after another, each against what
//   is stored at that moment, and answers once the browser has stored it. Two
//   tabs that save at the same moment therefore cannot lose one another's
//   bookmark.
//
// It keeps nothing between two changes but their order, sets no timer, makes
// no request and asks for no permission beyond the storage the extension
// already has. The browser starts it when a command or a request arrives and
// lets it go afterwards; one that starts again starts from what is stored.

import { api } from "../browser/api.js";
import { answerMarkChanges, askTab } from "../browser/messages.js";
import { COMMANDS } from "../browser/shortcut.js";
import { createMarkWriter } from "../browser/storage.js";

/**
 * Pass a command to the tab it was given in: the tab the browser names, or
 * the active tab of the window last in front. A tab that is not a supported
 * page has no one to answer, and nothing happens.
 *
 * @param {string} command
 * @param {{ id?: number } | undefined} tab
 */
export async function onCommand(command, tab) {
  const request = COMMANDS.find((entry) => entry.name === command)?.request;
  if (request === undefined) return { status: "unavailable" };
  let target = tab?.id ?? null;
  if (target === null) {
    try {
      const [active] = await api.tabs.query({ active: true, lastFocusedWindow: true });
      target = active?.id ?? null;
    } catch {
      target = null;
    }
  }
  return askTab(target, request);
}

api.commands.onCommand.addListener(onCommand);
answerMarkChanges(createMarkWriter());
// Reachable by name inside this component only, so that the handler can be
// called where a key the browser manages cannot be pressed: in the tests.
globalThis.readelaOnCommand = onCommand;
