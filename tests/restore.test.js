import test from "node:test";
import assert from "node:assert/strict";
import { createRestoreManager } from "../src/background/restore.js";

const backup = { version: "5", groups: [{ title: "Group", tabs: [{ url: "https://example.org" }] }] };
function fixture({ failBackup = false, failImport = false, alreadyImported = false } = {}) {
  const calls = [];
  const tabs = [{ id: 1, url: "https://before.test" }, { id: 2, url: "moz-extension://test/import.html" }, { id: 3, url: "moz-extension://other/page.html" }];
  const browser = { runtime: { getURL: (name) => "moz-extension://test/" + name }, tabs: {
    query: async () => tabs,
    remove: async (ids) => calls.push(["remove", ids]),
  }};
  const service = { dispatch: async (command) => {
    calls.push([command.type]);
    if (command.type === "importStg") {
      if (failImport) throw new Error("import failed");
      tabs.push({ id: 4, url: "https://restored.test" });
      return { importReport: { alreadyImported } };
    }
    return {};
  }};
  const backups = { download: async (window, options) => { calls.push(["backup", window, options]); if (failBackup) throw new Error("backup failed"); } };
  return { restore: createRestoreManager(browser, service, backups), calls };
}
test("restore saves a fresh backup before importing and closes only previous restorable tabs", async () => {
  const { restore, calls } = fixture();
  await restore({ type: "importStg", backup, closeExistingTabs: true }, 7);
  assert.deepEqual(calls, [["backup", 7, { fresh: true }], ["importStg"], ["remove", [1]], ["snapshot"]]);
});
test("restore can keep current tabs but still saves a backup", async () => {
  const { restore, calls } = fixture();
  await restore({ type: "importStg", backup, closeExistingTabs: false }, 7);
  assert.deepEqual(calls, [["backup", 7, { fresh: true }], ["importStg"]]);
});
test("failed backup, failed restore and repeated STG import never close current tabs", async () => {
  for (const options of [{ failBackup: true }, { failImport: true }, { alreadyImported: true }]) {
    const { restore, calls } = fixture(options);
    const result = restore({ type: "importStg", backup, closeExistingTabs: true }, 7);
    if (options.alreadyImported) await result; else await assert.rejects(result);
    assert.equal(calls.some(([name]) => name === "remove"), false);
    if (options.failBackup) assert.equal(calls.some(([name]) => name === "importStg"), false);
  }
});
test("invalid backup is rejected before saving or modifying tabs", async () => {
  const { restore, calls } = fixture();
  await assert.rejects(restore({ type: "importStg", backup: {}, closeExistingTabs: true }, 7));
  assert.deepEqual(calls, []);
});

test("restore keeps the window open if all surviving imported tabs are hidden", async () => {
  const calls = [];
  let tabs = [{ id: 1, url: "https://before.test", hidden: false }];
  const browser = { runtime: { getURL: (name) => "moz-extension://test/" + name }, tabs: {
    query: async () => tabs,
    create: async () => { calls.push("create visible tab"); tabs.push({ id: 3, hidden: false }); },
    remove: async (ids) => { calls.push(["remove", ids]); },
  }};
  const service = { dispatch: async (command) => {
    if (command.type === "importStg") tabs.push({ id: 2, hidden: true });
    return {};
  }};
  await createRestoreManager(browser, service, { download: async () => {} })({ type: "importStg", backup, closeExistingTabs: true }, 1);
  assert.deepEqual(calls, ["create visible tab", ["remove", [1]]]);
});
