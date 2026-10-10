// Content script entry: connects stored preferences and reading marks to the
// page reader, and answers the popup's reading-mark requests.

import { isExtensionAlive } from "../browser/api.js";
import { answerMarkRequests } from "../browser/messages.js";
import { saveMarks, watchMarks, watchPreferences } from "../browser/storage.js";
import { createReader } from "../page/reader.js";
import { siteFor } from "../page/sites/index.js";

const site = siteFor(location.hostname);

if (site !== null) {
  // The last write of the reading marks, so an answer to the popup can wait
  // until what it reports has really been stored.
  let stored = Promise.resolve();
  const reader = createReader({
    document,
    site,
    isAlive: isExtensionAlive,
    saveMarks: (marks) => {
      stored = saveMarks(marks);
      stored.catch(() => {});
    },
  });

  // Marks left by an earlier instance (the extension was reloaded under an
  // open page) are removed before this one starts.
  reader.stop();

  watchMarks((marks) => reader.setMarks(marks));
  watchPreferences((preferences) => reader.apply(preferences));

  const actions = { status: reader.markStatus, set: reader.markHere, go: reader.goToMark, clear: reader.clearMark };
  answerMarkRequests(async (request) => {
    const answer = { ...actions[request](), site: site.name };
    await stored;
    return answer;
  });
}
