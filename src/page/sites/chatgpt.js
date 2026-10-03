// ChatGPT page adapter: the only place that knows this site's structure.
//
// The conversation is read structurally (paragraph-like elements inside the
// main region) rather than through the site's styling class names, which
// change between front-end versions.

import { NEVER_TOUCHED } from "./common.js";

export const chatgpt = Object.freeze({
  name: "ChatGPT",

  // Exact host names this adapter serves. The manifest match patterns are
  // these hosts and nothing else.
  hosts: Object.freeze(["chatgpt.com"]),

  // Region that holds the conversation. Falls back to <body> when absent.
  scope: "main",

  // Text containers that are not paragraph-like elements: a reader's own
  // message is rendered as one pre-wrapped block in some layouts.
  extraBlocks: '[data-message-author-role="user"] .whitespace-pre-wrap',

  exclude: NEVER_TOUCHED,
});
