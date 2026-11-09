import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/fake-browser.js";
import { chooseGroupForNewTab, resolveSelection } from "../src/domain/tab-assignment.js";

const GROUP = "tavvy:group";
const ACTIVE = "tavvy:active-group";

/** Simulates the user selecting a tab in Firefox's tab strip. */
async function selectInFirefox(f, service, tabId) {
  const tab = f.records.find((item) => item.id === tabId);
  for (const item of f.records) if (item.windowId === tab.windowId) item.active = item.id === tabId;
  tab.hidden = false;
  service.invalidate({ type: "activated", tabId, windowId: tab.windowId });
  service.invalidate({ type: "window", windowId: tab.windowId });
  await service.refresh();
}

function withContainers(f) {
  f.api.permissions = { contains: async () => true };
  const identity = { name: "Work", cookieStoreId: "firefox-container-1", icon: "briefcase" };
  f.api.contextualIdentities = { query: async () => [identity], get: async () => identity };
  return identity;
}

test("domain: tabs without a container stay in the current group", () => {
  const groups = [
    { id: "inbox", parentId: null },
    { id: "work", parentId: null, spaceId: "s1" },
  ];
  assert.equal(chooseGroupForNewTab({ groups, windowGroupId: "work", tabSpaceId: "default" }), "work");
  assert.equal(chooseGroupForNewTab({ groups, windowGroupId: "inbox", tabSpaceId: "s1" }), "work");
  assert.equal(chooseGroupForNewTab({ groups, windowGroupId: "inbox", tabSpaceId: "s2" }), "inbox");
});

test("domain: selecting a Firefox page from a hidden group moves the page, not the window", () => {
  const visibleGroups = new Set(["b"]);
  assert.deepEqual(resolveSelection({ currentGroupId: "b", visibleGroups, selectedTab: { groupId: "b", url: "https://x" } }), { groupId: "b" });
  assert.deepEqual(resolveSelection({ currentGroupId: "b", visibleGroups, selectedTab: { groupId: "a", url: "https://x" } }), { groupId: "a" });
  assert.deepEqual(resolveSelection({ currentGroupId: "b", visibleGroups, selectedTab: { groupId: "a", url: "about:preferences" } }), {
    groupId: "b",
    moveTabTo: "b",
  });
  assert.deepEqual(resolveSelection({ currentGroupId: "b", visibleGroups, selectedTab: undefined }), { groupId: "b" });
});

test("Firefox switching to a hidden about:preferences tab keeps the window in its group", async () => {
  const f = fixture();
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
  const a = snap.groups.find((g) => g.title === "A").id;
  snap = await service.dispatch({ type: "createGroup", title: "B" }, 1);
  const b = snap.groups.find((g) => g.title === "B").id;
  const prefs = await f.api.tabs.create({ windowId: 1, active: false, url: "about:preferences" });
  f.tags.set(`${prefs.id}:${GROUP}`, a);
  service.invalidate({ type: "tab", tabId: prefs.id });
  await service.dispatch({ type: "activateGroup", groupId: b }, 1);
  assert.equal(f.records.find((tab) => tab.id === prefs.id).hidden, true);

  await selectInFirefox(f, service, prefs.id);
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.activeGroupId, b);
  assert.equal(f.tags.get(`${prefs.id}:${GROUP}`), b);
  assert.equal(f.records.find((tab) => tab.id === prefs.id).hidden, false);
});

test("selecting an ordinary tab of a hidden group still follows it", async () => {
  const f = fixture();
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
  const a = snap.groups.find((g) => g.title === "A").id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId: a }, 1);
  await service.dispatch({ type: "activateGroup", groupId: "inbox" }, 1);
  await selectInFirefox(f, service, 2);
  snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.activeGroupId, a);
});

test("a tab dragged into another window joins the group shown there", async () => {
  const f = fixture();
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
  const a = snap.groups.find((g) => g.title === "A").id;
  await service.dispatch({ type: "createGroup", title: "C" }, 2);
  snap = await service.dispatch({ type: "snapshot" }, 2);
  const c = snap.groups.find((g) => g.title === "C").id;
  await service.dispatch({ type: "activateGroup", groupId: c }, 2);
  await service.dispatch({ type: "moveTab", tabId: 2, groupId: a }, 1);

  const tab = f.records.find((item) => item.id === 2);
  tab.windowId = 2;
  // Firefox fires onDetached/onAttached.
  service.invalidate({ type: "window", windowId: 1 });
  service.invalidate({ type: "window", windowId: 2 });
  await service.attached(2, 2);
  await selectInFirefox(f, service, 2);
  snap = await service.dispatch({ type: "snapshot" }, 2);
  assert.equal(snap.activeGroupId, c, "window 2 keeps its group");
  assert.equal(f.tags.get(`2:${GROUP}`), c);
});

test("a window torn off from another adopts the tab's group", async () => {
  const f = fixture();
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
  const a = snap.groups.find((g) => g.title === "A").id;
  await service.dispatch({ type: "moveTab", tabId: 2, groupId: a }, 1);
  const tab = f.records.find((item) => item.id === 2);
  tab.windowId = 3;
  service.invalidate({ type: "window", windowId: 1 });
  service.invalidate({ type: "window", windowId: 3 });
  await service.attached(2, 3);
  await selectInFirefox(f, service, 2);
  snap = await service.dispatch({ type: "snapshot" }, 3);
  assert.equal(snap.activeGroupId, a);
  assert.equal(f.tags.get(`2:${GROUP}`), a);
});

test("a new window starts in the group used most recently", async () => {
  const f = fixture();
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
  const a = snap.groups.find((g) => g.title === "A").id;
  await service.dispatch({ type: "activateGroup", groupId: a }, 1);
  const fresh = await f.api.tabs.create({ windowId: 5, active: true });
  service.invalidate({ type: "tab", tabId: fresh.id });
  await service.refresh();
  snap = await service.dispatch({ type: "snapshot" }, 5);
  assert.equal(snap.activeGroupId, a);
  assert.equal(f.tags.get(`${fresh.id}:${GROUP}`), a);
  // It survives a restart of the background page.
  const restarted = f.service();
  const other = await f.api.tabs.create({ windowId: 6, active: true });
  restarted.invalidate({ type: "tab", tabId: other.id });
  assert.equal((await restarted.dispatch({ type: "snapshot" }, 6)).activeGroupId, a);
});

test("Firefox changing a window's group (session restore) is picked up immediately", async () => {
  const f = fixture();
  const service = f.service();
  let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
  const a = snap.groups.find((g) => g.title === "A").id;
  assert.equal((await service.dispatch({ type: "snapshot" }, 1)).activeGroupId, "inbox");
  f.windows.set(`1:${ACTIVE}`, a);
  assert.equal((await service.dispatch({ type: "snapshot" }, 1)).activeGroupId, a);
});

test("tabs tagged with an unknown group are never retagged", async () => {
  const f = fixture();
  f.tags.set(`2:${GROUP}`, "group-from-elsewhere");
  const service = f.service();
  await service.refresh();
  const snap = await service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snap.tabs.find((tab) => tab.id === 2).groupId, "inbox");
  assert.equal(f.tags.get(`2:${GROUP}`), "group-from-elsewhere");
  assert.equal(f.tags.get(`1:${GROUP}`), "inbox", "untagged tabs are still assigned");
});

test("the service refuses to start when the groups are missing but tab records exist", async () => {
  const f = fixture();
  f.values["tavvy:known:v1"] = { 1: { id: 1, windowId: 1, groupId: "lost", title: "x", url: "https://x", pinned: false } };
  const service = f.service();
  await assert.rejects(service.dispatch({ type: "snapshot" }, 1), /не найдены/);
  assert.equal(f.tags.get(`1:${GROUP}`), undefined);
  assert.equal(f.values["tavvy:workspace:v1"], undefined);
});

test("Ctrl+T in a container group opens an active container tab immediately", async () => {
  const f = fixture();
  const identity = withContainers(f);
  const service = f.service();
  let snap = await service.dispatch({ type: "activateSpace", spaceId: `container:${identity.cookieStoreId}` }, 1);
  snap = await service.dispatch({ type: "createGroup", title: "Work", spaceId: snap.activeSpaceId }, 1);
  const work = snap.groups.find((g) => g.title === "Work").id;
  await service.dispatch({ type: "activateGroup", groupId: work }, 1);

  const created = [];
  const create = f.api.tabs.create;
  f.api.tabs.create = async (options) => {
    created.push(options);
    return create(options);
  };
  // A long-running command must not delay the replacement.
  let release;
  const busy = service.dispatch({ type: "snapshot" }, 1);
  const originalQuery = f.api.tabs.query;
  f.api.tabs.query = async (...args) => {
    await new Promise((resolve) => (release = resolve));
    return originalQuery(...args);
  };
  const tab = await create({ windowId: 1, active: true, cookieStoreId: "firefox-default", url: "about:newtab" });
  for (const item of f.records) if (item.windowId === 1 && item.id !== tab.id) item.active = false;
  await service.created(tab);
  f.api.tabs.query = originalQuery;
  release?.();
  await busy;

  assert.equal(f.records.some((item) => item.id === tab.id), false, "the original tab is closed");
  assert.equal(created.length, 1);
  assert.equal(created[0].active, true, "created active so Firefox focuses the address bar");
  assert.equal(created[0].url, undefined);
  assert.equal(created[0].cookieStoreId, identity.cookieStoreId);
  const replacement = f.records.find((item) => item.cookieStoreId === identity.cookieStoreId && item.active);
  assert.equal(f.tags.get(`${replacement.id}:${GROUP}`), work);
});

test("a tab restored with Ctrl+Shift+T is not replaced", async () => {
  const f = fixture();
  const identity = withContainers(f);
  const service = f.service();
  let snap = await service.dispatch({ type: "activateSpace", spaceId: `container:${identity.cookieStoreId}` }, 1);
  snap = await service.dispatch({ type: "createGroup", title: "Work", spaceId: snap.activeSpaceId }, 1);
  await service.dispatch({ type: "activateGroup", groupId: snap.groups.find((g) => g.title === "Work").id }, 1);
  const restored = await f.api.tabs.create({ windowId: 1, active: true, cookieStoreId: "firefox-default", url: "about:blank" });
  f.tags.set(`${restored.id}:${GROUP}`, "inbox");
  await service.created(restored);
  assert.ok(f.records.some((item) => item.id === restored.id));
});
