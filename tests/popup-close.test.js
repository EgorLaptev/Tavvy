import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));
for (const succeeds of [true, false])
  test(`popup ${succeeds ? "closes on success" : "stays open on error"} after group selection`, async () => {
    const dom = new JSDOM(await readFile("build/firefox/popup.html", "utf8"), {
      url: "http://localhost",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const { window } = dom;
    let closed = 0;
    window.close = () => {
      closed++;
    };
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    const snapshot = {
      groups: [
        { id: "inbox", title: "Основная", color: "#398dff", parentId: null },
      ],
      tabs: [],
      archive: [],
      activeGroupId: "inbox",
      settings: {
        theme: "Чёрная",
        animations: true,
        width: 440,
        height: 300,
        position: "right",
      },
    };
    window.browser = {
      storage: { local: { get: async () => ({ "tavvy:tab-manager-notice:v1": true }), set: async () => {} } },
      windows: { getCurrent: async () => ({ id: 1 }) },
      runtime: {
        getURL: (path) => path,
        onMessage: { addListener() {} },
        sendMessage: async (message) =>
          message.command.type === "snapshot"
            ? { ok: true, snapshot }
            : succeeds
              ? { ok: true, snapshot }
              : { ok: false, error: "Ошибка переключения" },
      },
      tabs: { create: async () => {} },
    };
    window.eval(await readFile("build/test/popup.js", "utf8"));
    await wait();
    window.document.querySelector(".group-header").click();
    await wait();
    assert.equal(closed, succeeds ? 1 : 0);
    if (!succeeds)
      assert.equal(
        window.document.querySelector(".extension-status").textContent,
        "Ошибка переключения",
      );
    dom.window.close = () => {};
  });

for (const succeeds of [true, false])
  test(`popup ${succeeds ? "closes" : "stays open"} when opening settings ${succeeds ? "succeeds" : "fails"}`, async () => {
    const dom = new JSDOM(await readFile("build/firefox/popup.html", "utf8"), { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
    const { window } = dom;
    let closed = 0;
    window.close = () => { closed++; };
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    const snapshot = { groups: [{ id: "inbox", title: "Main", color: "#398dff", parentId: null }], tabs: [], activeGroupId: "inbox", settings: { theme: "Чёрная", animations: true, width: 440, height: 300 } };
    window.browser = {
      storage: { local: { get: async () => ({ "tavvy:tab-manager-notice:v1": true }), set: async () => {} } },
      windows: { getCurrent: async () => ({ id: 1 }) },
      runtime: { getURL: (path) => path, onMessage: { addListener() {} }, sendMessage: async () => ({ ok: true, snapshot }), openOptionsPage: async () => { if (!succeeds) throw new Error("Settings unavailable"); } },
      tabs: { create: async () => {} },
    };
    window.eval(await readFile("build/test/popup.js", "utf8"));
    await wait();
    window.document.querySelector(".settings-button").click();
    await wait();
    assert.equal(closed, succeeds ? 1 : 0);
    if (!succeeds) assert.equal(window.document.querySelector(".extension-status").textContent, "Settings unavailable");
    dom.window.close = () => {};
  });

test("tabs without a group are listed in a separate card and open on click", async () => {
  const dom = new JSDOM(await readFile("build/firefox/popup.html", "utf8"), {
    url: "http://localhost",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.close = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  const tab = (id, groupId) => ({ id, windowId: 1, groupId, title: "Tab " + id, url: "https://example.com/" + id, faviconUrl: "", pinned: false, index: id });
  const snapshot = {
    groups: [{ id: "inbox", title: "Основная", color: "#398dff", parentId: null }],
    tabs: [tab(1, null), tab(2, null), tab(3, "inbox")],
    archive: [],
    activeGroupId: null,
    settings: { theme: "Чёрная", animations: false, width: 440, height: 300, position: "right" },
  };
  const sent = [];
  window.browser = {
    storage: { local: { get: async () => ({ "tavvy:tab-manager-notice:v1": true }), set: async () => {} } },
    windows: { getCurrent: async () => ({ id: 1 }) },
    runtime: {
      getURL: (path) => path,
      onMessage: { addListener() {} },
      sendMessage: async (message) => {
        sent.push(message.command);
        return { ok: true, snapshot };
      },
    },
    tabs: { create: async () => {} },
  };
  window.eval(await readFile("build/test/popup.js", "utf8"));
  await wait();
  const doc = window.document;
  const card = doc.querySelector(".groups > .ungrouped");
  assert.ok(card, "the card is the first one in the panel");
  assert.equal(doc.querySelector(".groups").firstElementChild, card);
  assert.equal(card.querySelector(".count").textContent, "2");
  assert.equal(card.classList.contains("active"), true, "the window shows no group");
  assert.equal(doc.querySelector('[data-group-id="inbox"]').classList.contains("active"), false);
  card.querySelector(".group-header").click();
  await wait();
  const rows = card.querySelectorAll(".tab-row");
  assert.deepEqual([...rows].map((row) => row.dataset.tabId), ["1", "2"]);
  rows[1].click();
  await wait();
  assert.equal(JSON.stringify(sent.at(-1)), JSON.stringify({ type: "activateTab", tabId: 2 }));
});
