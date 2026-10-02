// ChatGPT page adapter: the only place that knows this site's structure.
//
// The conversation is read structurally (paragraph-like elements inside the
// main region) rather than through the site's styling class names, which
// change between front-end versions.

export const chatgpt = Object.freeze({
  name: "ChatGPT",

  // Region that holds the conversation. Falls back to <body> when absent.
  scope: "main",

  // Text containers that are not paragraph-like elements: a reader's own
  // message is rendered as one pre-wrapped block in some layouts.
  extraBlocks: '[data-message-author-role="user"] .whitespace-pre-wrap',

  // Never read or changed: the message composer and every other editable
  // field, page controls, navigation and dialogs.
  exclude: [
    "form",
    "nav",
    "aside",
    "header",
    "footer",
    "button",
    "label",
    "textarea",
    "input",
    "select",
    '[contenteditable]:not([contenteditable="false"])',
    '[role="textbox"]',
    '[role="dialog"]',
    '[role="menu"]',
    '[role="navigation"]',
  ].join(", "),
});
