// The one exchange between the popup and a page: the reading mark.
//
// Settings never travel this way; the page reacts to stored preferences. A
// reading mark belongs to the conversation in one tab, so the popup asks that
// tab's content script directly. Sending a message to a tab that runs this
// extension's content script needs no permission.

import { api } from "./api.js";

export const MARK_REQUESTS = Object.freeze(["status", "set", "go", "clear"]);

const isRequest = (message) =>
  message !== null && typeof message === "object" && MARK_REQUESTS.includes(message.readelaMark);

/**
 * Answer reading-mark requests in a content script. The answer may be a
 * promise, so that "saved" is said only once it is true.
 *
 * @param {(request: "status" | "set" | "go" | "clear") => object | Promise<object>} answer
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
 * Ask the page in the target tab about its reading mark.
 *
 * @param {"status" | "set" | "go" | "clear"} request
 * @returns {Promise<{ status: string }>} `unavailable` when the tab is not a
 *   supported page or cannot be reached
 */
export async function askPage(request) {
  try {
    const tab = await targetTab();
    if (tab === null) return { status: "unavailable" };
    const answer = await api.tabs.sendMessage(tab, { readelaMark: request });
    return answer && typeof answer.status === "string" ? answer : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
