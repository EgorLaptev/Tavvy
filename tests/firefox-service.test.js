import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceService } from "../src/background/workspace-service.js";
function fixture() {
  let next = 10,
    counter = 0;
  const values = {},
    tags = new Map(),
    windows = new Map();
  const records = [
    {
      id: 1,
      windowId: 1,
      title: "Первая",
      url: "https://example.com",
      active: true,
      index: 0,
      pinned: false,
    },
    {
      id: 2,
      windowId: 1,
      title: "Вторая",
      url: "https://mozilla.org",
      active: false,
      index: 1,
      pinned: false,
    },
    {
      id: 3,
      windowId: 1,
      title: "Закреплённая",
      url: "https://example.org",
      active: false,
      index: 2,
      pinned: true,
    },
    {
      id: 4,
      windowId: 2,
      title: "Другое окно",
      url: "https://example.net",
      active: true,
      index: 0,
      pinned: false,
    },
  ];
  const api = {
    runtime: { getURL: (path) => `moz-extension://test/${path}` },
    storage: {
      local: {
        get: async (key) => structuredClone({ [key]: values[key] }),
        set: async (data) => Object.assign(values, structuredClone(data)),
      },
    },
    sessions: {
      getTabValue: async (id, key) => tags.get(`${id}:${key}`),
      setTabValue: async (id, key, value) => tags.set(`${id}:${key}`, value),
      getWindowValue: async (id) => windows.get(id),
      setWindowValue: async (id, key, value) => windows.set(id, value),
    },
    tabs: {
      query: async () => structuredClone(records),
      get: async (id) => structuredClone(records.find((tab) => tab.id === id)),
      discard: async (id) => {
        records.find((tab) => tab.id === id).discarded = true;
      },
      create: async (options) => {
        const tab = {
          id: next++,
          index: records.length,
          title: "Новая вкладка",
          url: "about:newtab",
          pinned: false,
          hidden: false,
          ...options,
        };
        records.push(tab);
        return { ...tab };
      },
      update: async (id, options) => {
        const tab = records.find((t) => t.id === id);
        if (options.active)
          records
            .filter((t) => t.windowId === tab.windowId)
            .forEach((t) => (t.active = false));
        Object.assign(tab, options);
        return { ...tab };
      },
      show: async (ids) =>
        ids.forEach((id) => (records.find((t) => t.id === id).hidden = false)),
      hide: async (ids) => {
        ids.forEach((id) => {
          const tab = records.find((t) => t.id === id);
          assert.equal(tab.active, false, "never hide an active tab");
          assert.equal(tab.pinned, false, "never hide a pinned tab");
          tab.hidden = true;
        });
        return ids;
      },
      remove: async (id) => {
        records.splice(
          records.findIndex((t) => t.id === id),
          1,
        );
      },
      move: async (id, { index }) => {
        records.find((t) => t.id === id).index = index;
      },
    },
  };
  const service = () => createWorkspaceService(api, () => `id-${++counter}`);
  return { api, records, tags, service };
}
test("switching groups manages real tabs in only one window and preserves pinned tabs", async () => {
  const f = fixture(),
    service = f.service();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.tabs.length, 2);
  snap = await service.dispatch({ type: "createGroup", title: "Работа" }, 1);
  const groupId = snap.groups[1].id;
  snap = await service.dispatch({ type: "activateGroup", groupId }, 1);
  assert.equal(snap.activeGroupId, groupId);
  assert.equal(snap.tabs.filter((t) => t.groupId === groupId).length, 1);
  assert.equal(f.records.find((t) => t.id === 1).hidden, true);
  assert.equal(f.records.find((t) => t.id === 3).hidden, undefined);
  assert.equal(f.records.find((t) => t.id === 4).hidden, undefined);
  await service.dispatch({ type: "activateGroup", groupId: "inbox" }, 1);
  assert.equal(f.records.find((t) => t.id === 1).hidden, false);
});
test("private tabs are excluded from storage, snapshots, archives and backups", async () => {
  const f = fixture();
  f.records.push({ id: 99, windowId: 9, incognito: true, title: "private-secret", url: "https://private.invalid/secret", active: true, index: 0 });
  const service = f.service();
  const snapshot = await service.dispatch({ type: "snapshot" }, 1);
  const backup = await service.dispatch({ type: "exportBackup" }, 1);
  assert.equal(JSON.stringify(snapshot).includes("private-secret"), false);
  assert.equal(JSON.stringify(backup).includes("private.invalid"), false);
  assert.equal([...f.tags.keys()].some((key) => key.startsWith("99:")), false);
  assert.equal(JSON.stringify(await f.api.storage.local.get("tavvy:known:v1")).includes("private.invalid"), false);
});
test("nested groups keep ancestor tabs visible, including grouped pinned tabs", async () => {
  const f = fixture();
  const service = f.service();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, groupPinnedTabs: true } }, 1);
  snap = await service.dispatch({ type: "createGroup", title: "Parent", parentId: "inbox" }, 1);
  const parent = snap.groups.find((g) => g.title === "Parent").id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId: parent }, 1);
  snap = await service.dispatch({ type: "createGroup", title: "Child", parentId: parent }, 1);
  const child = snap.groups.find((g) => g.title === "Child").id;
  await service.dispatch({ type: "activateGroup", groupId: child }, 1);
  assert.notEqual(f.records.find((t) => t.id === 1).hidden, true);
  assert.notEqual(f.records.find((t) => t.id === 2).hidden, true);
  assert.equal(f.records.find((t) => t.id === 3).pinned, true);
  await f.api.tabs.update(2, { active: true });
  service.invalidate({ type: "activated", tabId: 2, windowId: 1 });
  await service.refresh();
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.activeGroupId, child);
  assert.notEqual(f.records.find((t) => t.id === 1).hidden, true);
  await service.dispatch({ type: "activateGroup", groupId: parent }, 1);
  assert.notEqual(f.records.find((t) => t.id === 1).hidden, true);
  assert.notEqual(f.records.find((t) => t.id === 2).hidden, true);
  assert.equal(f.records.find((t) => t.id === 3).pinned, true);
});
test("grouped pinned tabs are restored across service restarts and when the setting is disabled", async () => {
  const f = fixture();
  let service = f.service();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, groupPinnedTabs: true } }, 1);
  assert.ok(snap.tabs.some((tab) => tab.id === 3));
  snap = await service.dispatch({ type: "createGroup", title: "Work" }, 1);
  const work = snap.groups.find((group) => group.title === "Work").id;
  await service.dispatch({ type: "activateGroup", groupId: work }, 1);
  assert.equal(f.records.find((tab) => tab.id === 3).pinned, false);
  assert.equal(f.records.find((tab) => tab.id === 3).hidden, true);
  assert.equal(f.tags.get("3:tavvy:group-pinned"), true);
  const backup = await service.dispatch({ type: "exportBackup" }, 1);
  assert.equal(backup.tabs.find((tab) => tab.url === "https://example.org").pinned, true);
  service = f.service();
  await service.dispatch({ type: "activateGroup", groupId: "inbox" }, 1);
  assert.equal(f.records.find((tab) => tab.id === 3).pinned, true);
  assert.equal(f.records.find((tab) => tab.id === 3).hidden, false);
  await service.dispatch({ type: "activateGroup", groupId: work }, 1);
  snap = await service.dispatch({ type: "snapshot" }, 1);
  await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, groupPinnedTabs: false } }, 1);
  assert.equal(f.records.find((tab) => tab.id === 3).pinned, true);
  assert.equal(f.records.find((tab) => tab.id === 3).hidden, false);
  assert.equal(f.tags.get("3:tavvy:group-pinned"), false);
});
test("a pinned tab that Firefox refuses to hide is pinned again", async () => {
  const f = fixture();
  const service = f.service();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, groupPinnedTabs: true } }, 1);
  snap = await service.dispatch({ type: "createGroup", title: "Work" }, 1);
  f.api.tabs.hide = async (ids) => {
    const hidden = ids.filter((id) => id !== 3);
    for (const id of hidden) f.records.find((tab) => tab.id === id).hidden = true;
    return hidden;
  };
  await assert.rejects(service.dispatch({ type: "activateGroup", groupId: snap.groups.find((g) => g.title === "Work").id }, 1), /не смог скрыть/);
  assert.equal(f.records.find((tab) => tab.id === 3).pinned, true);
  assert.equal(f.tags.get("3:tavvy:group-pinned"), false);
});
test("Tavvy backup restores nested groups and tabs without deleting existing tabs", async () => {
  const f = fixture();
  const source = f.service();
  let snap = await source.dispatch({ type: "createGroup", title: "Parent" }, 1);
  const parent = snap.groups.find((g) => g.title === "Parent").id;
  snap = await source.dispatch({ type: "createGroup", title: "Child", parentId: parent }, 1);
  const child = snap.groups.find((g) => g.title === "Child").id;
  await source.dispatch({ type: "moveTab", groupId: child, tabId: 2 }, 1);
  const backup = await source.dispatch({ type: "exportBackup" }, 1);
  assert.equal(backup.tabs.length, 4);
  const target = fixture();
  const restored = await target.service().dispatch({ type: "importBackup", backup }, 1);
  const restoredParent = restored.groups.find((g) => g.title === "Parent");
  const restoredChild = restored.groups.find((g) => g.title === "Child");
  assert.equal(restoredChild.parentId, restoredParent.id);
  assert.equal(target.records.length, 8);
  assert.ok(restored.tabs.some((tab) => tab.groupId === restoredChild.id && tab.url === "https://mozilla.org"));
});
test("archive survives service restart and restore removes exactly one entry", async () => {
  const f = fixture();
  let service = f.service();
  await service.dispatch({ type: "snapshot" }, 1);
  let snap = await service.dispatch({ type: "closeTab", tabId: 2 }, 1);
  await service.removed(2, false); // native event must not duplicate our own command
  service = f.service();
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.archive.length, 1);
  snap = await service.dispatch(
    { type: "restoreTab", entryId: snap.archive[0].id },
    1,
  );
  assert.equal(snap.archive.length, 0);
  assert.ok(snap.tabs.some((t) => t.url === "https://mozilla.org"));
});
test("cycles rejected; deleting a group keeps its tabs and reparents children", async () => {
  const f = fixture(),
    service = f.service();
  let snap = await service.dispatch(
    { type: "createGroup", title: "Родитель" },
    1,
  );
  const parent = snap.groups[1].id;
  snap = await service.dispatch(
    { type: "createGroup", title: "Ребёнок", parentId: parent },
    1,
  );
  const child = snap.groups[2].id;
  await assert.rejects(
    service.dispatch(
      { type: "moveGroup", groupId: parent, parentId: child },
      1,
    ),
    /саму себя/,
  );
  await service.dispatch({ type: "moveTab", tabId: 2, groupId: parent }, 1);
  snap = await service.dispatch({ type: "deleteGroup", groupId: parent }, 1);
  assert.ok(snap.tabs.some((t) => t.id === 2 && t.groupId === "inbox"));
  assert.equal(snap.groups.find((g) => g.id === child).parentId, null);
  await assert.rejects(
    service.dispatch({ type: "deleteGroup", groupId: "inbox" }, 1),
  );
});
test("external closure is archived; closing a window is not archived", async () => {
  const f = fixture(),
    service = f.service();
  await service.dispatch({ type: "snapshot" }, 1);
  await f.api.tabs.remove(2);
  await service.removed(2, false);
  await f.api.tabs.remove(4);
  await service.removed(4, true);
  const snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.archive.length, 1);
});
test("the archive is enabled by default and starts empty when re-enabled", async () => {
  const f = fixture(), service = f.service();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.settings.archiveEnabled, true);
  snap = await service.dispatch({ type: "closeTab", tabId: 2 }, 1);
  assert.equal(snap.archive.length, 1);
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, archiveEnabled: false } }, 1);
  snap = await service.dispatch({ type: "closeTab", tabId: 1 }, 1);
  await f.api.tabs.remove(4);
  await service.removed(4, false);
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.archive.length, 1);
  assert.equal(snap.settings.archiveEnabled, false);
  const restarted = f.service();
  snap = await restarted.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.archive.length, 1);
  assert.equal(snap.settings.archiveEnabled, false);
  snap = await restarted.dispatch({ type: "saveSettings", settings: { ...snap.settings, archiveEnabled: true } }, 1);
  assert.equal(snap.archive.length, 0);
  assert.equal(snap.settings.archiveEnabled, true);
  snap = await f.service().dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.archive.length, 0);
  assert.equal(snap.settings.archiveEnabled, true);
});
test("commands are serialized and tab operations reject another window", async () => {
  const service = fixture().service();
  await Promise.all([
    service.dispatch({ type: "createGroup", title: "A" }, 1),
    service.dispatch({ type: "createGroup", title: "B" }, 1),
  ]);
  const snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.groups.length, 3);
  await assert.rejects(
    service.dispatch({ type: "closeTab", tabId: 4 }, 1),
    /другом окне/,
  );
});

test("STG import preserves empty groups, titles, colors and URLs, and is idempotent", async () => {
  const f = fixture(),
    service = f.service();
  const backup = {
    version: "5.3.2",
    groups: [
      {
        id: 1,
        title: "Пустая",
        iconColor: "hsla(150, 100%, 50%, 1)",
        tabs: [],
      },
      {
        id: 2,
        title: "Работа",
        iconColor: "#ff7800",
        tabs: [
          { title: "Документ", url: "https://example.test/doc" },
          { title: "Файл", url: "file:///D:/notes.pdf" },
        ],
      },
    ],
    pinnedTabs: [{ title: "Почта", url: "https://example.test/mail" }],
  };
  let snapshot = await service.dispatch({ type: "importStg", backup }, 1);
  assert.equal(snapshot.groups.length, 3);
  assert.equal(snapshot.groups[1].title, "Пустая");
  assert.equal(snapshot.groups[1].color, "hsla(150, 100%, 50%, 1)");
  assert.equal(snapshot.importReport.localFiles, 1);
  assert.ok(
    f.records.some((tab) =>
      tab.url.startsWith("moz-extension://test/local-file.html#"),
    ),
  );
  assert.ok(
    f.records.some(
      (tab) => tab.url === "https://example.test/mail" && tab.pinned,
    ),
  );
  const count = f.records.length;
  snapshot = await service.dispatch({ type: "importStg", backup }, 1);
  assert.equal(f.records.length, count);
  assert.equal(snapshot.importReport.alreadyImported, true);
});

test("optional unloading affects only silent unpinned tabs in the previous group and window", async () => {
  const f = fixture(),
    service = f.service();
  f.records[0].audible = false;
  f.records[1].audible = true;
  f.records[2].audible = false;
  f.records[3].audible = false;
  await service.dispatch(
    { type: "saveSettings", settings: { discardInactiveTabs: true } },
    1,
  );
  let snap = await service.dispatch(
    { type: "createGroup", title: "Другая" },
    1,
  );
  const groupId = snap.groups[1].id;
  await service.dispatch({ type: "activateGroup", groupId }, 1);
  assert.equal(f.records.find((t) => t.id === 1).discarded, true);
  assert.notEqual(f.records.find((t) => t.id === 2).discarded, true);
  assert.notEqual(f.records.find((t) => t.id === 3).discarded, true);
  assert.notEqual(f.records.find((t) => t.id === 4).discarded, true);
});
test("unloading is disabled by default and ignores tabs with unknown sound state", async () => {
  const f = fixture(),
    service = f.service();
  f.records[0].audible = false;
  let snap = await service.dispatch(
    { type: "createGroup", title: "Другая" },
    1,
  );
  const groupId = snap.groups[1].id;
  await service.dispatch({ type: "activateGroup", groupId }, 1);
  assert.notEqual(f.records.find((t) => t.id === 1).discarded, true);
  await service.dispatch({ type: "activateGroup", groupId: "inbox" }, 1);
  await service.dispatch(
    { type: "saveSettings", settings: { discardInactiveTabs: true } },
    1,
  );
  delete f.records[0].audible;
  service.invalidate({ type: "tab", tabId: 1 });
  await service.dispatch({ type: "activateGroup", groupId }, 1);
  assert.notEqual(f.records.find((t) => t.id === 1).discarded, true);
});

test("discarded tabs retain their last favicon for the same URL across background restarts", async () => {
  const f = fixture();
  f.records[1].favIconUrl = "https://mozilla.org/favicon.ico";
  let service = f.service();
  await service.refresh();
  delete f.records[1].favIconUrl;
  f.records[1].discarded = true;
  service.invalidate({ type: "updated", tabId: 2, changes: { favIconUrl: "", discarded: true } });
  await service.refresh();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.tabs.find((tab) => tab.id === 2).faviconUrl, "https://mozilla.org/favicon.ico");
  service = f.service();
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.tabs.find((tab) => tab.id === 2).faviconUrl, "https://mozilla.org/favicon.ico");
  f.records[1].url = "https://other.example/";
  service.invalidate({ type: "updated", tabId: 2, changes: { url: f.records[1].url } });
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.tabs.find((tab) => tab.id === 2).faviconUrl, "");
});
