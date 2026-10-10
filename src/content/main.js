// Content script entry: connects stored preferences and saved places to the
// page reader, and answers the popup's saved-place requests.

import { isExtensionAlive } from "../browser/api.js";
import { answerMarkRequests } from "../browser/messages.js";
import { changeMarks, watchMarks, watchPreferences } from "../browser/storage.js";
import { createReader } from "../page/reader.js";
import { siteFor } from "../page/sites/index.js";

const site = siteFor(location.hostname);

if (site !== null) {
  const reader = createReader({ document, site, isAlive: isExtensionAlive, store: changeMarks });

  // Marks left by an earlier instance (the extension was reloaded under an
  // open page) are removed before this one starts.
  reader.stop();

  watchMarks((marks) => reader.setMarks(marks));
  watchPreferences((preferences) => reader.apply(preferences));

  // Each answer is given when it is true: a place is reported as saved once
  // the browser has stored it, and as reached once it is seen in view.
  const actions = {
    status: reader.placeStatus,
    set: reader.savePlace,
    go: reader.returnToPlace,
    clear: reader.clearPlace,
  };
  answerMarkRequests(async (request) => ({ ...(await actions[request]()), site: site.name }));
}
