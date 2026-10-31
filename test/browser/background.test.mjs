import assert from "node:assert/strict";
import { test } from "node:test";

// Firefox for Android offers no `commands` namespace. The background
// component must still load there and answer the page's requests to change
// the stored bookmarks, which are its other duty.
test("the background component loads and writes bookmarks where the browser has no commands", async () => {
  const listeners = [];
  const data = {};
  globalThis.browser = {
    runtime: { id: "readela@test", onMessage: { addListener: (listener) => listeners.push(listener) } },
    storage: {
      local: {
        async get(key) {
          return key in data ? { [key]: structuredClone(data[key]) } : {};
        },
        async set(values) {
          Object.assign(data, structuredClone(values));
        },
      },
    },
    tabs: { query: async () => [], sendMessage: async () => undefined },
  };
  try {
    await import("../../src/background/main.js");
    assert.equal(listeners.length, 1, "the bookmark writer listens for the page");
    assert.equal(typeof globalThis.readelaOnCommand, "function");
    const answer = await globalThis.readelaOnCommand("bookmark", { id: 7 });
    assert.deepEqual(answer, { status: "unavailable" }, "a tab without Readela has no one to answer");
    const ignored = listeners[0]({ readelaStore: {} }, { id: "another-extension" }, () => {});
    assert.equal(ignored, false, "a message from elsewhere is not answered");
  } finally {
    delete globalThis.browser;
    delete globalThis.readelaOnCommand;
  }
});
