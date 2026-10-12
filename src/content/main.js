// Content script entry: connects stored preferences and saved places to the
// page reader, and answers the saved-place requests of the popup and of the
// browser's bookmark commands.

import { isExtensionAlive } from "../browser/api.js";
import { answerMarkRequests, askWriter } from "../browser/messages.js";
import { watchMarks, watchPreferences } from "../browser/storage.js";
import { createReader } from "../page/reader.js";
import { siteFor } from "../page/sites/index.js";

const site = siteFor(location.hostname);

// How long the page waits for the writer's answer. A change takes a few
// milliseconds, and a writer the browser has to start first a little longer.
const STORE_ANSWER_MS = 5000;

// The page never writes the stored places itself: it asks the one writer. A
// change that is not answered in time is not reported as made: the reader is
// told it failed. Whatever is stored shows itself, as every change of what is
// stored does.
function askStore(request) {
  return new Promise((resolve, reject) => {
    const late = setTimeout(() => reject(new Error("the writer did not answer")), STORE_ANSWER_MS);
    askWriter(request).then(
      (stored) => {
        clearTimeout(late);
        resolve(stored);
      },
      (error) => {
        clearTimeout(late);
        reject(error);
      },
    );
  });
}

if (site !== null) {
  const reader = createReader({ document, site, isAlive: isExtensionAlive, store: askStore });

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
    quick: reader.quickSave,
  };
  answerMarkRequests(async (request) => ({ status: (await actions[request]()).status, site: site.name }));
}
