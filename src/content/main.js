// Content script entry: connects stored preferences to the page reader.

import { isExtensionAlive } from "../browser/api.js";
import { watchPreferences } from "../browser/storage.js";
import { createReader } from "../page/reader.js";
import { chatgpt } from "../page/sites/chatgpt.js";

const reader = createReader({ document, site: chatgpt, isAlive: isExtensionAlive });

// Marks left by an earlier instance (the extension was reloaded under an open
// page) are removed before this one starts.
reader.stop();

watchPreferences((preferences) => reader.apply(preferences));
