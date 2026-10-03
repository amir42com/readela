// Claude page adapter: the only place that knows this site's structure.
//
// The site marks every message with a stable test identifier and wraps
// rendered Markdown in a named container, so reading is limited to those.
// Text elsewhere on the page (start screen, settings, project pages) is left
// alone. Either hook is enough on its own, which tolerates one of them being
// renamed.

import { NEVER_TOUCHED } from "./common.js";

const MESSAGES = '[data-testid="assistant-message"], [data-testid="user-message"]';
const MARKDOWN = ".standard-markdown, .progressive-markdown";

export const claude = Object.freeze({
  name: "Claude",

  hosts: Object.freeze(["claude.ai"]),

  // The conversation is not guaranteed to sit in a <main> element.
  scope: "body",

  // Only blocks inside a message or a rendered-Markdown container are read.
  within: `${MESSAGES}, ${MARKDOWN}`,

  // A reader's own message can be one pre-wrapped block with no paragraphs.
  extraBlocks: '[data-testid="user-message"]',

  exclude: NEVER_TOUCHED,
});
