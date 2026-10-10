// The one exchange between the extension's own pages and a page: the saved
// place (the reader's bookmark).
//
// Settings never travel this way; the page reacts to stored preferences. A
// saved place belongs to the conversation in one tab, so the popup, and the
// background component for the browser's command, ask that tab's content
// script directly. Sending a message to a tab that runs this extension's
// content script needs no permission.

import { api } from "./api.js";

/**
 * Report whether a place is saved, save one, return to it, clear it; and
 * save one for a command that comes without the popup ("quick").
 */
export const MARK_REQUESTS = Object.freeze(["status", "set", "go", "clear", "quick"]);

const isRequest = (message) =>
  message !== null && typeof message === "object" && MARK_REQUESTS.includes(message.readelaMark);

/**
 * Answer saved-place requests in a content script. The answer may be a
 * promise, so that "saved" and "returned" are said only once they are true.
 *
 * @param {(request: "status" | "set" | "go" | "clear" | "quick") => object | Promise<object>} answer
 */
export function answerMarkRequests(answer) {
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== api.runtime.id || !isRequest(message)) return false;
    Promise.resolve()
      .then(() => answer(message.readelaMark))
      .then(sendResponse, () => sendResponse({ status: "failed" }));
    return true; // the answer follows
  });
}

// The tab the popup acts on: the active tab of its window. When the popup
// document is opened as a page of its own, the address can name the tab.
async function targetTab() {
  const named = Number(new URLSearchParams(globalThis.location?.search ?? "").get("tab"));
  if (Number.isInteger(named) && named > 0) return named;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

/**
 * Ask the page in one tab about its saved place.
 *
 * @param {number | null} tab the tab's identifier
 * @param {"status" | "set" | "go" | "clear" | "quick"} request
 * @returns {Promise<{ status: string }>} `unavailable` when the tab is not a
 *   supported page or cannot be reached
 */
export async function askTab(tab, request) {
  try {
    if (tab === null || tab === undefined) return { status: "unavailable" };
    const answer = await api.tabs.sendMessage(tab, { readelaMark: request });
    return answer && typeof answer.status === "string" ? answer : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Ask the page in the popup's target tab about its saved place.
 *
 * @param {"status" | "set" | "go" | "clear"} request
 * @returns {Promise<{ status: string }>}
 */
export async function askPage(request) {
  try {
    return askTab(await targetTab(), request);
  } catch {
    return { status: "unavailable" };
  }
}
