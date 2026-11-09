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
      getWindowValue: async (id, key) => windows.get(`${id}:${key}`),
      setWindowValue: async (id, key, value) => windows.set(`${id}:${key}`, value),
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
        if (typeof options.muted === "boolean") tab.mutedInfo = { muted: options.muted };
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
test("background refresh restores the saved toolbar marker before opening the popup", async () => {
  const f = fixture();
  const initial = f.service();
  let snap = await initial.dispatch({ type: "snapshot" }, 1);
  snap = await initial.dispatch({ type: "createGroup", title: "Work" }, 1);
  const work = snap.groups[1];
  snap = await initial.dispatch({ type: "activateGroup", groupId: work.id }, 1);
  await initial.dispatch({ type: "saveSettings", settings: { ...snap.settings, markerStyle: "letters2" } }, 1);
  const calls = [];
  const toolbar = {
    setDynamic: async (value) => calls.push(["dynamic", value]),
    setStyle: async (value) => calls.push(["style", value]),
    update: async (windowId, group) => calls.push(["update", windowId, group.id]),
  };
  const restarted = createWorkspaceService(f.api, undefined, toolbar);
  await restarted.refresh();
  assert.ok(calls.some((call) => call[0] === "style" && call[1] === "letters2"));
  assert.ok(calls.some((call) => call[0] === "update" && call[1] === 1 && call[2] === work.id));
  assert.ok(calls.findIndex((call) => call[0] === "style") < calls.findIndex((call) => call[0] === "update"));
});
test("switching groups manages real tabs in only one window and preserves pinned tabs", async () => {
  const f = fixture(),
    service = f.service();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.tabs.length, 3);
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
test("context menu moves an active tab without switching its current group", async () => {
  const f = fixture();
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "Work" }, 1);
  const work = snap.groups[1].id;
  snap = await service.dispatch({ type: "moveTab", tabId: 1, groupId: work, keepActiveGroup: true }, 1);
  assert.equal(snap.activeGroupId, "inbox");
  assert.equal(snap.tabs.find((tab) => tab.id === 1).groupId, work);
  assert.equal(f.records.find((tab) => tab.id === 1).hidden, true);
  assert.equal(f.records.find((tab) => tab.id === 2).active, true);
  assert.equal(f.records.find((tab) => tab.id === 4).active, true);
});

test("moving the last active group tab creates a replacement in the current group", async () => {
  const f = fixture();
  f.records.splice(1, 1);
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "Work" }, 1);
  const work = snap.groups[1].id;
  snap = await service.dispatch({ type: "moveTab", tabId: 1, groupId: work, keepActiveGroup: true }, 1);
  assert.equal(snap.activeGroupId, "inbox");
  assert.equal(f.records.find((tab) => tab.id === 1).hidden, true);
  const replacement = snap.tabs.find((tab) => tab.active && tab.id !== 1);
  assert.equal(replacement.groupId, "inbox");
  assert.equal(replacement.url, "about:newtab");
});

test("context menu keeps an active tab visible when its destination is already visible", async () => {
  const f = fixture();
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "Child", parentId: "inbox" }, 1);
  const child = snap.groups[1].id;
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, nestedTabsVisibility: "children" } }, 1);
  snap = await service.dispatch({ type: "moveTab", tabId: 1, groupId: child, keepActiveGroup: true }, 1);
  assert.equal(snap.activeGroupId, "inbox");
  assert.equal(f.records.find((tab) => tab.id === 1).active, true);
  assert.notEqual(f.records.find((tab) => tab.id === 1).hidden, true);
});
test("tab mute and unpin commands work for audible and group-pinned tabs", async () => {
  const f = fixture();
  f.records[1].audible = true;
  const service = f.service();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.ok(snap.tabs.find((tab) => tab.id === 3).pinned);
  snap = await service.dispatch({ type: "toggleTabMute", tabId: 2 }, 1);
  assert.equal(snap.tabs.find((tab) => tab.id === 2).muted, true);
  snap = await service.dispatch({ type: "toggleTabMute", tabId: 2 }, 1);
  assert.equal(snap.tabs.find((tab) => tab.id === 2).muted, false);
  await assert.rejects(service.dispatch({ type: "unpinTab", tabId: 4 }, 1));
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, groupPinnedTabs: true } }, 1);
  snap = await service.dispatch({ type: "createGroup", title: "Other" }, 1);
  const other = snap.groups[1].id;
  snap = await service.dispatch({ type: "activateGroup", groupId: other }, 1);
  assert.equal(snap.tabs.find((tab) => tab.id === 3).managedPinned, true);
  snap = await service.dispatch({ type: "unpinTab", tabId: 3 }, 1);
  assert.equal(snap.tabs.find((tab) => tab.id === 3).managedPinned, false);
  assert.equal(f.records.find((tab) => tab.id === 3).hidden, true);
});
test("renaming a group preserves its tabs and children across restarts", async () => {
  const f = fixture();
  let service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "Work" }, 1);
  const groupId = snap.groups[1].id;
  snap = await service.dispatch({ type: "createGroup", title: "Child", parentId: groupId }, 1);
  const childId = snap.groups[2].id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId }, 1);
  snap = await service.dispatch({ type: "renameGroup", groupId, title: "  Projects  " }, 1);
  assert.equal(snap.groups.find((g) => g.id === groupId).title, "Projects");
  assert.equal(snap.groups.find((g) => g.id === childId).parentId, groupId);
  assert.equal(snap.tabs.find((tab) => tab.id === 2).groupId, groupId);
  service = f.service();
  assert.equal((await service.dispatch({ type: "snapshot" }, 1)).groups.find((g) => g.id === groupId).title, "Projects");
  await assert.rejects(service.dispatch({ type: "renameGroup", groupId, title: " " }, 1));
  await assert.rejects(service.dispatch({ type: "renameGroup", groupId, title: "x".repeat(101) }, 1));
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
test("accent color survives a service restart and backup export", async () => {
  const f = fixture();
  let service = f.service();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, accentColor: "#f15d63" } }, 1);
  service = f.service();
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.settings.accentColor, "#f15d63");
  const backup = await service.dispatch({ type: "exportBackup" }, 1);
  assert.equal(backup.settings.accentColor, "#f15d63");
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
test("nested visibility modes and disabling preserve groups and safely update open windows", async () => {
  const f = fixture(), service = f.service();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.settings.nestedGroups, true);
  assert.equal(snap.settings.nestedTabsVisibility, "parents");
  snap = await service.dispatch({ type: "createGroup", title: "Parent", parentId: "inbox" }, 1);
  const parent = snap.groups.find((g) => g.title === "Parent").id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId: parent }, 1);
  snap = await service.dispatch({ type: "createGroup", title: "Child", parentId: parent }, 1);
  const child = snap.groups.find((g) => g.title === "Child").id;
  await service.dispatch({ type: "activateGroup", groupId: child }, 1);
  assert.notEqual(f.records.find((t) => t.id === 1).hidden, true);
  assert.notEqual(f.records.find((t) => t.id === 2).hidden, true);
  await f.api.tabs.update(2, { active: true });
  service.invalidate({ type: "activated", tabId: 2, windowId: 1 });
  await service.refresh();
  snap = await service.dispatch({ type: "snapshot" }, 1);
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, nestedTabsVisibility: "children" } }, 1);
  assert.equal(snap.activeGroupId, child);
  assert.equal(f.records.find((t) => t.id === 1).hidden, true);
  assert.equal(f.records.find((t) => t.id === 2).hidden, true);
  await service.dispatch({ type: "activateGroup", groupId: parent }, 1);
  assert.equal(f.records.find((t) => t.id === 1).hidden, true);
  assert.equal(f.records.find((t) => t.id === 2).hidden, false);
  const childTab = (await service.dispatch({ type: "snapshot" }, 1)).tabs.find((t) => t.groupId === child);
  assert.equal(f.records.find((t) => t.id === childTab.id).hidden, false);
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, nestedTabsVisibility: "children", nestedGroups: false } }, 1);
  assert.equal(f.records.find((t) => t.id === childTab.id).hidden, true);
  snap = await service.dispatch({ type: "moveGroup", groupId: child, parentId: null }, 1);
  assert.equal(snap.groups.find((g) => g.id === child).parentId, parent);
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, nestedGroups: true } }, 1);
  assert.equal(snap.groups.find((g) => g.id === child).parentId, parent);
  assert.equal(f.records.find((t) => t.id === childTab.id).hidden, false);
  const restored = await f.service().dispatch({ type: "snapshot" }, 1);
  assert.equal(restored.settings.nestedTabsVisibility, "children");
  assert.equal(restored.settings.nestedGroups, true);
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
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, closeTabsOnGroupDelete: false } }, 1);
  snap = await service.dispatch({ type: "deleteGroup", groupId: parent }, 1);
  assert.ok(snap.tabs.some((t) => t.id === 2 && t.groupId === "inbox"));
  assert.equal(snap.groups.find((g) => g.id === child).parentId, null);
  await assert.rejects(
    service.dispatch({ type: "deleteGroup", groupId: "inbox" }, 1),
  );
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

test("STG import replaces groups and preserves empty groups, titles, colors and URLs", async () => {
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
          { title: "Дополнения", url: "about:addons" },
          { title: "Расширение", url: "moz-extension://12345678-1234-1234-1234-123456789abc/page.html#state" },
        ],
      },
    ],
    pinnedTabs: [{ title: "Почта", url: "https://example.test/mail" }],
  };
  await service.dispatch({ type: "createGroup", title: "Old group" }, 1);
  let snapshot = await service.dispatch({ type: "importStg", backup }, 1);
  assert.equal(snapshot.groups.length, 3);
  assert.ok(!snapshot.groups.some((group) => group.title === "Old group"));
  const count = f.records.length;
  await service.dispatch({ type: "createGroup", title: "Added later" }, 1);
  snapshot = await service.dispatch({ type: "importStg", backup }, 1);
  assert.equal(f.records.length, count + 5);
  assert.ok(!snapshot.groups.some((group) => group.title === "Added later"));
  assert.equal(snapshot.groups[1].title, "Пустая");
  assert.equal(snapshot.groups[1].color, "hsla(150, 100%, 50%, 1)");
  assert.equal(snapshot.importReport.localFiles, 1);
  assert.equal(snapshot.importReport.browserPages, 2);
  const extensionUrl = "moz-extension://12345678-1234-1234-1234-123456789abc/page.html#state";
  const savedExtensionPage = (tab) => tab.url.includes("local-file.html#") && JSON.parse(decodeURIComponent(tab.url.split("#")[1])).url === extensionUrl;
  assert.ok(f.records.some(savedExtensionPage));
  assert.ok(f.records.some((tab) => tab.url.includes("local-file.html#") && JSON.parse(decodeURIComponent(tab.url.split("#")[1])).url === "about:addons"));
  const exported = await service.dispatch({ type: "exportBackup" }, 1);
  assert.ok(exported.tabs.some((tab) => tab.url === extensionUrl));
  assert.ok(exported.tabs.some((tab) => tab.url === "about:addons"));
  await service.dispatch({ type: "importBackup", backup: exported }, 1);
  assert.equal(f.records.filter(savedExtensionPage).length, 4);
  assert.equal(f.records.filter((tab) => tab.url.includes("local-file.html#") && JSON.parse(decodeURIComponent(tab.url.split("#")[1])).url === "about:addons").length, 4);
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
  assert.equal((await service.dispatch({ type: "snapshot" }, 1)).groups.length, 3);
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

async function attachTestSpace(f, service, name = "Work") {
  const identity = await f.api.contextualIdentities.create({ name, color: "blue", icon: "fingerprint" });
  f.api.contextualIdentities.query = async () => [identity];
  const current = await service.dispatch({ type: "snapshot" }, 1);
  await service.dispatch({ type: "saveSettings", settings: { ...current.settings, experimentalSpaces: true } }, 1);
  const selected = await service.dispatch({ type: "activateSpace", spaceId: `container:${identity.cookieStoreId}` }, 1);
  return service.dispatch({ type: "createGroup", title: name, spaceId: selected.activeSpaceId }, 1);
}

test("experimental spaces open new tabs in their container and preserve existing groups", async () => {
  const f = fixture();
  const identities = new Map();
  let nextIdentity = 1;
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    async create({ name }) { const item = { name, cookieStoreId: `firefox-container-${nextIdentity++}` }; identities.set(item.cookieStoreId, item); return item; },
    async get(cookieStoreId) { if (!identities.has(cookieStoreId)) throw new Error("Missing container"); return identities.get(cookieStoreId); },
    async update(cookieStoreId, details) { Object.assign(identities.get(cookieStoreId), details); return identities.get(cookieStoreId); },
  };
  let service = f.service();
  let snap = await attachTestSpace(f, service);
  const spaceId = snap.activeSpaceId;
  const workGroup = snap.activeGroupId;
  const workTab = snap.tabs.find((tab) => tab.active);
  assert.notEqual(spaceId, "default");
  assert.equal(workTab.cookieStoreId, "firefox-container-1");
  assert.equal(snap.groups.filter((group) => group.spaceId === spaceId).length, 1);
  assert.ok(snap.groups.some((group) => group.id === "inbox"));
  assert.equal(f.records.find((tab) => tab.id === 1).hidden, true);
  snap = await service.dispatch({ type: "createGroup", title: "Project", spaceId }, 1);
  const projectId = snap.groups.find((group) => group.title === "Project").id;
  snap = await service.dispatch({ type: "createTab", groupId: projectId }, 1);
  assert.equal(snap.tabs.find((tab) => tab.active).cookieStoreId, "firefox-container-1");
  snap = await service.dispatch({ type: "activateSpace", spaceId: "default" }, 1);
  assert.equal(snap.activeGroupId, "inbox");
  assert.equal(snap.groups.some((group) => group.id === workGroup), true);
  assert.equal(f.records.find((tab) => tab.id === 1).hidden, false);
  await assert.rejects(service.dispatch({ type: "moveTab", tabId: 1, groupId: workGroup }, 1), /пространств/);
  service = f.service();
  snap = await service.dispatch({ type: "activateSpace", spaceId }, 1);
  assert.equal(snap.activeSpaceId, spaceId);
  assert.equal(snap.groups.filter((group) => group.spaceId === spaceId).length, 2);
  const backup = await service.dispatch({ type: "exportBackup" }, 1);
  assert.equal(backup.version, 2);
  assert.deepEqual(backup.spaces, [{ id: spaceId, name: "Work", icon: "fingerprint" }]);
  assert.equal(backup.groups.find((group) => group.id === workGroup).spaceId, spaceId);
  assert.equal(JSON.stringify(backup).includes("firefox-container-1"), false);
});

test("legacy spaces setting does not hide groups or change the active group", async () => {
  const f = fixture();
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    create: async ({ name }) => ({ name, cookieStoreId: "firefox-container-1" }),
    get: async (cookieStoreId) => ({ cookieStoreId }),
  };
  const service = f.service();
  let snap = await attachTestSpace(f, service);
  const spaceId = snap.activeSpaceId, groupId = snap.activeGroupId;
  const tabIds = f.records.map((item) => item.id);
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, experimentalSpaces: false } }, 1);
  assert.equal(snap.activeSpaceId, spaceId);
  assert.equal(snap.settings.experimentalSpaces, false);
  assert.ok(snap.spaces.some((item) => item.id === spaceId));
  assert.deepEqual(f.records.map((item) => item.id), tabIds);
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, experimentalSpaces: true } }, 1);
  snap = await service.dispatch({ type: "activateSpace", spaceId }, 1);
  assert.equal(snap.activeGroupId, groupId);
});

test("legacy disabled space setting preserves the active group after restart", async () => {
  const f = fixture();
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    create: async ({ name }) => ({ name, cookieStoreId: "firefox-container-1" }),
    get: async (cookieStoreId) => ({ cookieStoreId }),
  };
  let service = f.service();
  const work = await attachTestSpace(f, service);
  const key = "tavvy:workspace:v1";
  const saved = await f.api.storage.local.get(key);
  saved[key].settings.experimentalSpaces = false;
  await f.api.storage.local.set(saved);
  service = f.service();
  const snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.activeSpaceId, work.activeSpaceId);
  assert.ok(snap.spaces.some((item) => item.id === work.activeSpaceId));
});

test("a missing container can be reconnected to an existing unassigned Firefox container", async () => {
  const f = fixture();
  const identities = [
    { name: "Old", icon: "fingerprint", cookieStoreId: "firefox-container-7" },
    { name: "Work", icon: "briefcase", cookieStoreId: "firefox-container-2" },
  ];
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    query: async () => structuredClone(identities),
    get: async (id) => {
      const item = identities.find((value) => value.cookieStoreId === id);
      if (!item) throw new Error(`Invalid contextual identity: ${id}`);
      return item;
    },
  };
  let service = f.service();
  let snap = await service.dispatch({ type: "snapshot" }, 1);
  snap = await service.dispatch({ type: "saveSettings", settings: { ...snap.settings, experimentalSpaces: true } }, 1);
  snap = await service.dispatch({ type: "activateSpace", spaceId: "container:firefox-container-7" }, 1);
  const spaceId = snap.activeSpaceId;
  snap = await service.dispatch({ type: "createGroup", title: "Project", spaceId }, 1);
  const groupId = snap.activeGroupId;
  await service.dispatch({ type: "activateSpace", spaceId: "default" }, 1);
  identities.shift();
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.spaces.find((item) => item.id === spaceId).unavailable, true);
  assert.ok(snap.spaces.some((item) => item.id === "container:firefox-container-2"));
  snap = await service.dispatch({ type: "rebindSpace", spaceId, cookieStoreId: "firefox-container-2" }, 1);
  assert.equal(snap.activeSpaceId, spaceId);
  assert.equal(snap.activeGroupId, groupId);
  assert.ok(snap.groups.some((item) => item.title === "Project"));
  assert.equal(snap.spaces.find((item) => item.id === spaceId).name, "Work");
  snap = await service.dispatch({ type: "createTab", groupId }, 1);
  assert.equal(snap.tabs.find((item) => item.active).cookieStoreId, "firefox-container-2");
  await assert.rejects(service.dispatch({ type: "rebindSpace", spaceId, cookieStoreId: "firefox-container-2" }, 1), /уже существует/);
  service = f.service();
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.spaces.find((item) => item.id === spaceId).unavailable, undefined);
});

test("deleting a space preserves its groups, tabs and container", async () => {
  const f = fixture();
  let removed = false;
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    create: async () => ({ cookieStoreId: "firefox-container-1" }),
    get: async (cookieStoreId) => ({ cookieStoreId }),
    remove: async () => { removed = true; },
  };
  const service = f.service();
  let snap = await attachTestSpace(f, service);
  const spaceId = snap.activeSpaceId;
  const groupId = snap.activeGroupId;
  const tab = snap.tabs.find((item) => item.active);
  snap = await service.dispatch({ type: "deleteSpace", spaceId }, 1);
  assert.equal(snap.activeSpaceId, "default");
  assert.equal(snap.spaces.length, 2);
  assert.ok(snap.groups.some((item) => item.id === groupId));
  assert.ok(snap.tabs.some((item) => item.id === tab.id));
  assert.equal(removed, false);
  await assert.rejects(service.dispatch({ type: "deleteSpace", spaceId: "default" }, 1));
});

test("space backup restores tabs into matching existing containers", async () => {
  function addContainers(f, first) {
    let next = first;
    const identities = new Map();
    f.api.permissions = { contains: async () => true };
    f.api.contextualIdentities = {
      async create({ name }) { const item = { name, cookieStoreId: `firefox-container-${next++}` }; identities.set(item.cookieStoreId, item); return item; },
      async get(id) { if (!identities.has(id)) throw new Error("Missing container"); return identities.get(id); },
    };
  }
  const original = fixture();
  addContainers(original, 1);
  const source = original.service();
  let snap = await attachTestSpace(original, source);
  snap = await source.dispatch({ type: "createGroup", title: "Project", spaceId: snap.activeSpaceId }, 1);
  const groupId = snap.groups.find((group) => group.title === "Project").id;
  snap = await source.dispatch({ type: "createTab", groupId }, 1);
  const backup = await source.dispatch({ type: "exportBackup" }, 1);
  const restored = fixture();
  addContainers(restored, 50);
  await restored.api.contextualIdentities.create({ name: "Work" });
  restored.api.contextualIdentities.query = async () => [{ name: "Work", cookieStoreId: "firefox-container-50" }];
  const destination = restored.service();
  await destination.dispatch({ type: "importBackup", backup }, 1);
  const allTabs = restored.records;
  assert.ok(allTabs.some((tab) => tab.cookieStoreId === "firefox-container-50"));
  assert.equal(allTabs.some((tab) => tab.cookieStoreId === "firefox-container-1"), false);
  assert.ok(allTabs.some((tab) => tab.id === 1));
  const state = await destination.dispatch({ type: "snapshot" }, 1);
  const importedSpace = state.spaces.find((item) => item.name === "Work");
  const work = await destination.dispatch({ type: "activateSpace", spaceId: importedSpace.id }, 1);
  assert.ok(work.groups.some((group) => group.title === "Project"));
  const workGroups = new Set(work.groups.filter((group) => group.spaceId === importedSpace.id).map((group) => group.id));
  assert.ok(work.tabs.filter((tab) => workGroups.has(tab.groupId)).every((tab) => tab.cookieStoreId === "firefox-container-50"));
});

test("ambiguous backup container names do not modify the workspace", async () => {
  const f = fixture();
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    query: async () => [
      { name: "Work", cookieStoreId: "firefox-container-1" },
      { name: "Work", cookieStoreId: "firefox-container-2" },
    ],
    create: async () => { throw new Error("must not create containers"); },
  };
  const service = f.service();
  const backup = { format: "tavvy-backup", version: 2, spaces: [{ id: "w", name: "Work" }], groups: [{ id: "inbox", title: "Main", color: "#398dff", parentId: null }, { id: "g", title: "Work", color: "#398dff", parentId: null, spaceId: "w" }], tabs: [{ groupId: "g", url: "https://example.test", title: "Page" }], archive: [], settings: {} };
  await assert.rejects(service.dispatch({ type: "importBackup", backup }, 1), /один существующий контейнер/);
  const snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.groups.length, 1);
  assert.equal(f.records.length, 4);
});

test("missing container permission does not alter existing tabs", async () => {
  const f = fixture();
  let created = false;
  f.api.permissions = { contains: async () => false };
  f.api.contextualIdentities = { create: async () => { created = true; } };
  const service = f.service();
  await assert.rejects(service.dispatch({ type: "createSpace", name: "Work" }, 1), /недоступно/);
  assert.equal(created, false);
  const snapshot = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snapshot.spaces.length, 1);
  assert.equal(snapshot.groups.length, 1);
  assert.equal(f.records.length, 4);
});

test("workspace backup restore refuses missing permission before creating containers or tabs", async () => {
  const f = fixture();
  let created = false;
  f.api.permissions = { contains: async () => false };
  f.api.contextualIdentities = { create: async () => { created = true; } };
  const service = f.service();
  const backup = { format: "tavvy-backup", version: 2, spaces: [{ id: "w", name: "Work" }], groups: [{ id: "inbox", title: "Main", color: "#398dff", parentId: null }, { id: "g", title: "Work", color: "#398dff", parentId: null, spaceId: "w" }], tabs: [{ groupId: "g", url: "https://example.test", title: "Page" }], archive: [], settings: {} };
  await assert.rejects(service.dispatch({ type: "importBackup", backup }, 1), /разрешение/);
  assert.equal(created, false);
  assert.equal(f.records.length, 4);
  const snapshot = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snapshot.spaces.length, 1);
  assert.equal(snapshot.groups.length, 1);
});

test("missing or invalid space container never falls back to the default cookie store", async () => {
  const f = fixture();
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = { create: async () => ({ cookieStoreId: "firefox-default" }) };
  const service = f.service();
  await assert.rejects(service.dispatch({ type: "activateSpace", spaceId: "container:firefox-default" }, 1), /недоступен/);
  assert.equal(f.records.length, 4);
  const snapshot = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snapshot.spaces.length, 1);
});

test("each space remembers the last selected group in each window", async () => {
  const f = fixture();
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    create: async ({ name }) => ({ name, cookieStoreId: "firefox-container-1" }),
    get: async (cookieStoreId) => ({ cookieStoreId }),
  };
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "Personal" }, 1);
  const personal = snap.groups.find((item) => item.title === "Personal").id;
  await service.dispatch({ type: "activateGroup", groupId: personal }, 1);
  snap = await attachTestSpace(f, service);
  const work = snap.activeSpaceId;
  snap = await service.dispatch({ type: "createGroup", title: "Project", spaceId: work }, 1);
  const project = snap.groups.find((item) => item.title === "Project").id;
  await service.dispatch({ type: "activateGroup", groupId: project }, 1);
  snap = await service.dispatch({ type: "activateSpace", spaceId: "default" }, 1);
  assert.equal(snap.activeGroupId, personal);
  snap = await service.dispatch({ type: "activateSpace", spaceId: work }, 1);
  assert.equal(snap.activeGroupId, project);
});

test("untagged tabs follow their Firefox container rather than the previous space", async () => {
  const f = fixture();
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    create: async ({ name }) => ({ name, cookieStoreId: "firefox-container-1" }),
    get: async (cookieStoreId) => ({ cookieStoreId }),
  };
  const service = f.service();
  let snap = await attachTestSpace(f, service);
  const workId = snap.activeSpaceId;
  const workGroup = snap.activeGroupId;
  await service.dispatch({ type: "activateSpace", spaceId: "default" }, 1);
  const external = await f.api.tabs.create({ windowId: 1, active: true, cookieStoreId: "firefox-container-1" });
  for (const tab of f.records) if (tab.windowId === 1 && tab.id !== external.id) tab.active = false;
  service.invalidate({ type: "tab", tabId: external.id });
  await service.refresh();
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.activeSpaceId, workId);
  assert.equal(snap.tabs.find((tab) => tab.id === external.id).groupId, workGroup);
  const ordinary = await f.api.tabs.create({ windowId: 1, active: true, cookieStoreId: "firefox-default" });
  for (const tab of f.records) if (tab.windowId === 1 && tab.id !== ordinary.id) tab.active = false;
  service.invalidate({ type: "tab", tabId: ordinary.id });
  await service.refresh();
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.activeSpaceId, "default");
  assert.equal(snap.tabs.find((tab) => tab.id === ordinary.id).groupId, "inbox");
});

test("a normal new tab opens in the active group's container", async () => {
  const f = fixture();
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    create: async ({ name }) => ({ name, cookieStoreId: "firefox-container-1" }),
    get: async (cookieStoreId) => ({ cookieStoreId }),
  };
  const service = f.service();
  const before = await attachTestSpace(f, service);
  const groupId = before.activeGroupId;
  const ordinary = await f.api.tabs.create({ windowId: 1, active: true, cookieStoreId: "firefox-default" });
  for (const tab of f.records) if (tab.windowId === 1 && tab.id !== ordinary.id) tab.active = false;
  service.invalidate({ type: "tab", tabId: ordinary.id });
  await service.created(ordinary);
  await service.refresh();
  const snapshot = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snapshot.activeGroupId, groupId);
  assert.equal(f.records.some((tab) => tab.id === ordinary.id), false);
  assert.ok(snapshot.tabs.some((tab) => tab.active && tab.groupId === groupId && tab.cookieStoreId === "firefox-container-1"));
});

test("opening a page or explicitly choosing a container does not replace the tab", async () => {
  const f = fixture();
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    create: async ({ name }) => ({ name, cookieStoreId: "firefox-container-1" }),
    get: async (cookieStoreId) => ({ cookieStoreId }),
  };
  const service = f.service();
  await attachTestSpace(f, service);
  for (const options of [{ url: "https://example.org/", cookieStoreId: "firefox-default" }, { cookieStoreId: "firefox-container-2" }, { cookieStoreId: "firefox-default", openerTabId: 1 }]) {
    const tab = await f.api.tabs.create({ windowId: 1, active: true, ...options });
    await service.created(tab);
    assert.ok(f.records.some((item) => item.id === tab.id));
  }
});

test("a new tab navigated while its replacement opens is preserved", async () => {
  const f = fixture();
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = {
    create: async ({ name }) => ({ name, cookieStoreId: "firefox-container-1" }),
    get: async (cookieStoreId) => ({ cookieStoreId }),
  };
  const service = f.service();
  await attachTestSpace(f, service);
  const tab = await f.api.tabs.create({ windowId: 1, active: true, cookieStoreId: "firefox-default" });
  for (const item of f.records) if (item.windowId === 1 && item.id !== tab.id) item.active = false;
  service.invalidate({ type: "tab", tabId: tab.id });
  const originalIds = f.records.map((item) => item.id).sort();
  const create = f.api.tabs.create;
  f.api.tabs.create = async (options) => {
    f.records.find((item) => item.id === tab.id).pendingUrl = "https://example.org/";
    return create(options);
  };
  await service.created(tab);
  assert.equal(f.records.find((item) => item.id === tab.id).pendingUrl, "https://example.org/");
  assert.deepEqual(f.records.map((item) => item.id).sort(), originalIds);
});

test("deleting a group closes its own tabs by default and keeps children", async () => {
  const f = fixture(), service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "Parent" }, 1);
  const parent = snap.groups.find((g) => g.title === "Parent").id;
  snap = await service.dispatch({ type: "createGroup", title: "Child", parentId: parent }, 1);
  const child = snap.groups.find((g) => g.title === "Child").id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId: parent }, 1);
  snap = await service.dispatch({ type: "deleteGroup", groupId: parent }, 1);
  assert.equal(snap.tabs.some((tab) => tab.id === 2), false);
  assert.equal(snap.groups.find((g) => g.id === child).parentId, null);
  assert.ok(snap.tabs.some((tab) => tab.id === 3 && tab.pinned));
  assert.ok(f.records.some((tab) => tab.id === 4));
});

test("legacy archived entries remain in backups without collecting newly closed tabs", async () => {
  const f = fixture();
  const oldArchive = [{ id: "old", groupId: "inbox", title: "Saved", url: "https://old.example", closedAt: 123 }];
  await f.api.storage.local.set({ "tavvy:workspace:v1": { version: 1, groups: [{ id: "inbox", title: "Main", color: "#398dff", parentId: null }], archive: oldArchive, settings: {} } });
  let service = f.service();
  await service.dispatch({ type: "closeTab", tabId: 2 }, 1);
  await service.removed(2, false);
  service = f.service();
  const backup = await service.dispatch({ type: "exportBackup" }, 1);
  assert.deepEqual(backup.archive.map((entry) => entry.url), ["https://old.example"]);
});


test("group actions reload and clear only their own tabs", async () => {
  const f = fixture();
  const reloaded = [];
  f.api.tabs.reload = async (id) => reloaded.push(id);
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "Work" }, 1);
  const groupId = snap.groups.find((item) => item.title === "Work").id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId }, 1);
  await service.dispatch({ type: "reloadGroup", groupId }, 1);
  assert.deepEqual(reloaded, [2]);
  snap = await service.dispatch({ type: "clearGroup", groupId }, 1);
  assert.ok(snap.groups.some((item) => item.id === groupId));
  assert.ok(!f.records.some((item) => item.id === 2));
  assert.ok(f.records.some((item) => item.id === 1));
});

test("moving a group reopens its tabs in the chosen container", async () => {
  const f = fixture();
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = { query: async () => [{ name: "Work", cookieStoreId: "firefox-container-1" }] };
  const service = f.service();
  let snap = await service.dispatch({ type: "saveSettings", settings: { experimentalSpaces: true } }, 1);
  snap = await service.dispatch({ type: "createGroup", title: "Project" }, 1);
  const groupId = snap.groups.find((item) => item.title === "Project").id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId }, 1);
  snap = await service.dispatch({ type: "moveGroupToSpace", groupId, spaceId: "container:firefox-container-1" }, 1);
  assert.ok(snap.groups.some((item) => item.id === groupId && item.spaceId));
  assert.ok(!f.records.some((item) => item.id === 2));
  assert.ok(f.records.some((item) => item.url === "https://mozilla.org" && item.cookieStoreId === "firefox-container-1"));
  const destination = snap.spaces.find((item) => item.name === "Work");
  snap = await service.dispatch({ type: "activateSpace", spaceId: destination.id }, 1);
  assert.ok(snap.groups.some((item) => item.id === groupId));
});


test("moving the last group from a container preserves the source space and new tabs", async () => {
  const f = fixture();
  const identities = [{ name: "Work", cookieStoreId: "firefox-container-1" }];
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = { query: async () => identities, get: async (store) => identities.find((item) => item.cookieStoreId === store) };
  const create = f.api.tabs.create;
  f.api.tabs.create = async (options) => {
    if (options.url === "about:newtab") throw new Error("Illegal URL: about:newtab");
    return create(options);
  };
  const service = f.service();
  await service.dispatch({ type: "saveSettings", settings: { experimentalSpaces: true } }, 1);
  let snap = await service.dispatch({ type: "activateSpace", spaceId: "container:firefox-container-1" }, 1);
  const sourceId = snap.activeSpaceId;
  assert.equal(snap.groups.filter((item) => item.spaceId === sourceId).length, 0);
  snap = await service.dispatch({ type: "createGroup", title: "Work", spaceId: sourceId }, 1);
  const movingId = snap.activeGroupId;
  assert.ok(snap.tabs.some((item) => item.groupId === movingId && item.url === "about:newtab"));
  snap = await service.dispatch({ type: "moveGroupToSpace", groupId: movingId, spaceId: "default" }, 1);
  assert.equal(snap.activeGroupId, movingId);
  assert.equal(snap.activeSpaceId, "default");
  assert.equal(snap.groups.filter((item) => item.spaceId === sourceId).length, 0);
  snap = await service.dispatch({ type: "activateSpace", spaceId: "default" }, 1);
  assert.ok(snap.groups.some((item) => item.id === movingId));
  assert.ok(snap.tabs.some((item) => item.groupId === movingId && item.url === "about:newtab"));
});


test("empty containers remain selectable after deleting their last group and in backups", async () => {
  const f = fixture();
  const identity = { name: "Work", cookieStoreId: "firefox-container-1" };
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = { query: async () => [identity], get: async () => identity };
  let service = f.service();
  await service.dispatch({ type: "saveSettings", settings: { experimentalSpaces: true } }, 1);
  let snap = await service.dispatch({ type: "activateSpace", spaceId: "container:firefox-container-1" }, 1);
  const spaceId = snap.activeSpaceId;
  assert.equal(snap.groups.filter((item) => item.spaceId === spaceId).length, 0);
  snap = await service.dispatch({ type: "createGroup", title: "Only group", spaceId }, 1);
  snap = await service.dispatch({ type: "deleteGroup", groupId: snap.activeGroupId }, 1);
  assert.equal(snap.activeSpaceId, spaceId);
  assert.equal(snap.groups.filter((item) => item.spaceId === spaceId).length, 0);
  service = f.service();
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.activeSpaceId, spaceId);
  assert.equal(snap.groups.filter((item) => item.spaceId === spaceId).length, 0);
  const backup = await service.dispatch({ type: "exportBackup" }, 1);
  assert.ok(backup.spaces.some((item) => item.id === spaceId));
  assert.ok(!backup.groups.some((item) => item.spaceId === spaceId));
  await service.dispatch({ type: "activateSpace", spaceId: "default" }, 1);
  snap = await service.dispatch({ type: "activateSpace", spaceId }, 1);
  assert.equal(snap.activeSpaceId, spaceId);
  assert.equal(snap.groups.filter((item) => item.spaceId === spaceId).length, 0);
});


test("pinning a tab respects grouped and global pinned-tab behavior", async () => {
  for (const grouped of [false, true]) {
    const f = fixture(), service = f.service();
    let snap = await service.dispatch({ type: "saveSettings", settings: { groupPinnedTabs: grouped } }, 1);
    snap = await service.dispatch({ type: "createGroup", title: "Work" }, 1);
    const work = snap.groups.find((item) => item.title === "Work").id;
    await service.dispatch({ type: "moveTab", tabId: 2, groupId: work }, 1);
    assert.equal(f.records.find((item) => item.id === 2).hidden, true);
    snap = await service.dispatch({ type: "pinTab", tabId: 2 }, 1);
    const tab = snap.tabs.find((item) => item.id === 2);
    if (grouped) {
      assert.equal(tab.managedPinned, true);
      assert.equal(f.records.find((item) => item.id === 2).hidden, true);
      snap = await service.dispatch({ type: "activateGroup", groupId: work }, 1);
      assert.equal(snap.tabs.find((item) => item.id === 2).pinned, true);
    } else {
      assert.equal(tab.pinned, true);
      assert.equal(f.records.find((item) => item.id === 2).hidden, false);
    }
    await assert.rejects(service.dispatch({ type: "pinTab", tabId: 4 }, 1), /другом окне/);
  }
});


test("assigning a container changes only the selected group and preserves mixed-space hierarchy in backups", async () => {
  const f = fixture();
  const identity = { name: "Work", cookieStoreId: "firefox-container-1", icon: "briefcase" };
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = { query: async () => [identity], get: async () => identity };
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "Parent" }, 1);
  const parent = snap.groups.find((item) => item.title === "Parent").id;
  snap = await service.dispatch({ type: "createGroup", title: "Child", parentId: parent }, 1);
  const child = snap.groups.find((item) => item.title === "Child").id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId: child }, 1);
  await service.dispatch({ type: "createTab", groupId: parent }, 1);
  snap = await service.dispatch({ type: "moveGroupToSpace", groupId: parent, spaceId: "container:firefox-container-1" }, 1);
  const work = snap.spaces.find((item) => item.name === "Work");
  assert.equal(snap.groups.find((item) => item.id === parent).spaceId, work.id);
  assert.equal(snap.groups.find((item) => item.id === child).spaceId, undefined);
  assert.equal(snap.groups.find((item) => item.id === child).parentId, parent);
  assert.equal(snap.activeGroupId, parent);
  assert.ok(snap.tabs.some((item) => item.groupId === parent && item.cookieStoreId === identity.cookieStoreId));
  assert.ok(snap.tabs.some((item) => item.id === 2 && item.groupId === child));
  snap = await service.dispatch({ type: "createGroup", title: "New root" }, 1);
  assert.equal(snap.groups.find((item) => item.title === "New root").spaceId, undefined);
  const backup = await service.dispatch({ type: "exportBackup" }, 1);
  const restored = fixture();
  restored.api.permissions = { contains: async () => true };
  restored.api.contextualIdentities = { query: async () => [identity], get: async () => identity };
  const destination = restored.service();
  const result = await destination.dispatch({ type: "importBackup", backup }, 1);
  const restoredParent = result.groups.find((item) => item.title === "Parent");
  const restoredChild = result.groups.find((item) => item.title === "Child");
  assert.equal(restoredChild.parentId, restoredParent.id);
  assert.ok(restoredParent.spaceId);
  assert.equal(restoredChild.spaceId, undefined);
});

test("failed container reassignment preserves the original group and tabs", async () => {
  const f = fixture();
  const identity = { name: "Work", cookieStoreId: "firefox-container-1" };
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = { query: async () => [identity], get: async () => identity };
  const create = f.api.tabs.create;
  let attempts = 0;
  f.api.tabs.create = async (options) => { if (options.cookieStoreId && ++attempts === 2) throw new Error("create failed"); return create(options); };
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "Parent" }, 1);
  const groupId = snap.groups.find((item) => item.title === "Parent").id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId }, 1);
  await service.dispatch({ type: "createTab", groupId }, 1);
  const before = f.records.filter((item) => item.windowId === 1).map((item) => item.id).sort();
  await assert.rejects(service.dispatch({ type: "moveGroupToSpace", groupId, spaceId: "container:firefox-container-1" }, 1), /create failed/);
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.groups.find((item) => item.id === groupId).spaceId, undefined);
  assert.deepEqual(f.records.filter((item) => item.windowId === 1).map((item) => item.id).sort(), before);
});

test("moving a group drops unsupported tabs and retains transferable tabs", async () => {
  const f = fixture();
  const identity = { name: "Work", cookieStoreId: "firefox-container-1" };
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = { query: async () => [identity], get: async () => identity };
  f.records.find((tab) => tab.id === 2).url = "about:addons";
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "Project" }, 1);
  const groupId = snap.groups.find((group) => group.title === "Project").id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId }, 1);
  await service.dispatch({ type: "createTab", groupId }, 1);
  snap = await service.dispatch({ type: "moveGroupToSpace", groupId, spaceId: "container:firefox-container-1" }, 1);
  assert.equal(f.records.some((tab) => tab.id === 2), false);
  assert.ok(f.records.some((tab) => tab.url === "about:newtab" && tab.cookieStoreId === "firefox-container-1"));
  assert.equal(snap.groups.find((group) => group.id === groupId).spaceId, snap.spaces.find((space) => space.name === "Work").id);
});

test("moving a group with only an active unsupported tab opens a replacement", async () => {
  const f = fixture();
  const identity = { name: "Work", cookieStoreId: "firefox-container-1" };
  f.api.permissions = { contains: async () => true };
  f.api.contextualIdentities = { query: async () => [identity], get: async () => identity };
  const service = f.service();
  await service.dispatch({ type: "snapshot" }, 1);
  f.records.find((tab) => tab.id === 1).url = "about:addons";
  f.records.find((tab) => tab.id === 2).url = "about:config";
  const snap = await service.dispatch({ type: "moveGroupToSpace", groupId: "inbox", spaceId: "container:firefox-container-1" }, 1);
  assert.ok(!f.records.some((tab) => tab.id === 1 || tab.id === 2));
  assert.ok(snap.tabs.some((tab) => tab.groupId === "inbox" && tab.active && tab.cookieStoreId === "firefox-container-1"));
});
