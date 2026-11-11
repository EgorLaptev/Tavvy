import test from "node:test";
import assert from "node:assert/strict";
import { parseStgBackup, stgFingerprint } from "../src/domain/stg-import.js";
const backup = {
  version: "5.3.2",
  groups: [
    {
      id: 1,
      title: "Group",
      iconColor: "#00ff00",
      tabs: [
        { title: "One", url: "https://example.com" },
        { title: "Two", url: "https://example.com" },
      ],
    },
    { id: 2, title: "Empty", tabs: [] },
  ],
  pinnedTabs: [],
};
test("STG parser keeps order, repeated URLs and empty groups", () => {
  const plan = parseStgBackup(backup);
  assert.equal(plan.groups.length, 2);
  assert.equal(plan.groups[0].tabs.length, 2);
  assert.equal(plan.groups[1].tabs.length, 0);
  assert.equal(plan.tabCount, 2);
});
test("STG parser rejects executable URLs before importing", () => {
  assert.throws(() =>
    parseStgBackup({
      version: "5",
      groups: [{ title: "Bad", tabs: [{ url: "javascript:alert(1)" }] }],
    }),
  );
});
test("fingerprint is stable regardless of backup time and STG settings", async () => {
  assert.equal(
    await stgFingerprint(parseStgBackup(backup)),
    await stgFingerprint(
      parseStgBackup({
        ...backup,
        theme: "dark",
        autoBackupLastBackupTimeStamp: 10,
      }),
    ),
  );
});

test("STG parser preserves Firefox pages in groups and pinned tabs", () => {
  const plan = parseStgBackup({
    version: "5",
    groups: [{ title: "Group", tabs: [{ url: "about:addons" }] }],
    pinnedTabs: [{ url: "about:config" }],
  });
  assert.equal(plan.groups[0].tabs[0].url, "about:addons");
  assert.equal(plan.browserPages, 2);
});
