// Claude page adapter: the only place that knows this site's structure.
//
// The site marks every message with a stable test identifier and wraps
// rendered Markdown in a named container, so reading is limited to those.
// Text elsewhere on the page (start screen, settings, project pages) is left
// alone. Either hook is enough on its own for direction and typography, which
// tolerates one of them being renamed. The hooks were observed on the site on
// 2026-10-10.

import { NEVER_TOUCHED } from "./common.js";

const USER = '[data-testid="user-message"]';
const MESSAGES = `[data-testid="assistant-message"], ${USER}`;
const MARKDOWN = ".standard-markdown, .progressive-markdown";

export const claude = Object.freeze({
  id: "claude",
  name: "Claude",

  hosts: Object.freeze(["claude.ai"]),

  exclude: NEVER_TOUCHED,

  // The conversation is not guaranteed to sit in a <main> element.
  scope: "body",

  conversation: Object.freeze([/(?:^|\/)chat\/([0-9a-z][0-9a-z-]{7,})(?:\/|$)/i]),

  // The transcript scrolls in a region of its own. It is a virtual list: only
  // the rows near the viewport are in the document.
  scroller: '[data-autoscroll-container="true"]',

  // Only blocks inside a message or a rendered-Markdown container are read.
  within: `${MESSAGES}, ${MARKDOWN}`,

  // The reader's own message can be one pre-wrapped block with no paragraphs.
  user: USER,
  extraBlocks: USER,

  // The text of a reply: rendered Markdown, not the message frame around it
  // (which also holds a heading for screen readers and controls).
  prose: MARKDOWN,

  // What the site itself marks as not prose inside a reply: a code block with
  // its header and controls.
  capsule: "[data-not-prose]",

  // Every message carries the identifier; every row of the transcript its index.
  turn: "data-turn-key",
  order: "data-index",
});
