// Shared by every site adapter: what Readela never reads or changes on any
// site — the message composer and every other editable field, page controls,
// navigation and dialogs.

export const NEVER_TOUCHED = [
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
].join(", ");
