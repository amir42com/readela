// ChatGPT page adapter: the only place that knows this site's structure.
//
// Direction and typography are read structurally (paragraph-like elements
// inside the conversation region), because the site's styling class names
// change between front-end versions. Appearance and saved places rely on the
// hooks below, observed on the site on 2026-10-10; where a hook is missing
// that part of the page simply stays the site's.

import { NEVER_TOUCHED } from "./common.js";

export const chatgpt = Object.freeze({
  id: "chatgpt",
  name: "ChatGPT",

  // Exact host names this adapter serves. The manifest match patterns are
  // these hosts and nothing else.
  hosts: Object.freeze(["chatgpt.com"]),

  exclude: NEVER_TOUCHED,

  // The site keeps conversations opened earlier in the document, each in a
  // hidden region of its own; the rendered one is the conversation shown.
  scope: "main",

  // /c/<id>, also inside a project or a custom assistant: /g/<name>/c/<id>.
  conversation: Object.freeze([/(?:^|\/)c\/([0-9a-z][0-9a-z-]{7,})(?:\/|$)/i]),

  // The conversation scrolls in a region of its own, not in the document. The
  // region is laid out from its end: it opens on the last few turns, loads the
  // ones before them when its beginning is scrolled into view, and keeps only
  // the turns near the viewport in the document.
  scroller: "[data-app-action-timeline-scroll]",

  // The reader's own message: one bubble holding one text container, with no
  // paragraphs.
  user: '[data-user-message-bubble="true"]',
  extraBlocks: '[data-user-message-bubble="true"] [dir="auto"]',

  // The text of a reply.
  prose: '[data-markdown-text-style="assistant-message"]',

  // A code block: a unit with its own background, header and controls, and no
  // pre element.
  capsule: '[data-markdown-copy="code-block"]',

  // A turn (the reader's message and the reply to it) carries the identifier.
  turn: "data-turn-key",

  // The link of a conversation in the site's sidebar.
  rows: "a[data-interactive-row-link][href]",
});
