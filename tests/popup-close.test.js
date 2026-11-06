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
