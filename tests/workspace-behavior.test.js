import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/fake-browser.js";
import {
    chooseGroupForNewTab,
    resolveSelection,
} from "../src/domain/tab-assignment.js";

const GROUP = "tavvy:group";
const ACTIVE = "tavvy:active-group";

/** Simulates the user selecting a tab in Firefox's tab strip. */
async function selectInFirefox(f, service, tabId) {
    const tab = f.records.find((item) => item.id === tabId);

    for (const item of f.records)
        if (item.windowId === tab.windowId) item.active = item.id === tabId;
    tab.hidden = false;
    service.invalidate({ type: "activated", tabId, windowId: tab.windowId });
    service.invalidate({ type: "window", windowId: tab.windowId });
    await service.refresh();
}

function withContainers(f) {
    f.api.permissions = { contains: async () => true };

    const identity = {
        name: "Work",
        cookieStoreId: "firefox-container-1",
        icon: "briefcase",
    };

    f.api.contextualIdentities = {
        query: async () => [identity],
        get: async () => identity,
    };

    return identity;
}

test("domain: tabs without a container stay in the current group", () => {
    const groups = [
        { id: "inbox", parentId: null },
        { id: "work", parentId: null, spaceId: "s1" },
    ];

    assert.equal(
        chooseGroupForNewTab({
            groups,
            windowGroupId: "work",
            tabSpaceId: "default",
        }),
        "work",
    );
    assert.equal(
        chooseGroupForNewTab({
            groups,
            windowGroupId: "inbox",
            tabSpaceId: "s1",
        }),
        "work",
    );
    assert.equal(
        chooseGroupForNewTab({
            groups,
            windowGroupId: "inbox",
            tabSpaceId: "s2",
        }),
        "inbox",
    );
});

test("domain: selecting a Firefox page from a hidden group moves the page, not the window", () => {
    const visibleGroups = new Set(["b"]);

    assert.deepEqual(
        resolveSelection({
            currentGroupId: "b",
            visibleGroups,
            selectedTab: { groupId: "b", url: "https://x" },
        }),
        { groupId: "b" },
    );
    assert.deepEqual(
        resolveSelection({
            currentGroupId: "b",
            visibleGroups,
            selectedTab: { groupId: "a", url: "https://x" },
        }),
        { groupId: "a" },
    );
    assert.deepEqual(
        resolveSelection({
            currentGroupId: "b",
            visibleGroups,
            selectedTab: { groupId: "a", url: "about:preferences" },
        }),
        {
            groupId: "b",
            moveTabTo: "b",
        },
    );
    assert.deepEqual(
        resolveSelection({
            currentGroupId: "b",
            visibleGroups,
            selectedTab: undefined,
        }),
        { groupId: "b" },
    );
});

test("Firefox switching to a hidden about:preferences tab keeps the window in its group", async () => {
    const f = fixture();
    const service = f.service();
    let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
    const a = snap.groups.find((g) => g.title === "A").id;

    snap = await service.dispatch({ type: "createGroup", title: "B" }, 1);

    const b = snap.groups.find((g) => g.title === "B").id;
    const prefs = await f.api.tabs.create({
        windowId: 1,
        active: false,
        url: "about:preferences",
    });

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

test("a tab torn off into its own window loses its group, as in Simple Tab Groups", async () => {
    const f = fixture();
    const service = f.service();
    let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
    const a = snap.groups.find((g) => g.title === "A").id;

    await service.dispatch({ type: "moveTab", tabId: 2, groupId: a }, 1);
    await service.refresh();

    const tab = f.records.find((item) => item.id === 2);

    tab.windowId = 3;
    service.invalidate({ type: "window", windowId: 1 });
    service.invalidate({ type: "window", windowId: 3 });
    await service.attached(2, 3);
    await selectInFirefox(f, service, 2);
    snap = await service.dispatch({ type: "snapshot" }, 3);
    assert.equal(snap.activeGroupId, null);
    assert.equal(f.tags.get(`2:${GROUP}`), null);
    assert.equal(snap.tabs.find((item) => item.id === 2).groupId, null);
});

test("windows open at installation join the default group; later new windows have no group", async () => {
    const f = fixture();
    const service = f.service();
    let snap = await service.dispatch({ type: "snapshot" }, 2);

    assert.equal(snap.activeGroupId, "inbox");
    snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);

    const a = snap.groups.find((g) => g.title === "A").id;

    await service.dispatch({ type: "activateGroup", groupId: a }, 1);
    await service.refresh();

    const fresh = await f.api.tabs.create({ windowId: 5, active: true });

    service.invalidate({ type: "tab", tabId: fresh.id });
    await service.refresh();
    snap = await service.dispatch({ type: "snapshot" }, 5);
    assert.equal(snap.activeGroupId, null);
    assert.equal(
        f.tags.get(`${fresh.id}:${GROUP}`),
        null,
        "its tabs stay without a group",
    );
    assert.equal(f.records.find((tab) => tab.id === fresh.id).hidden, false);

    // A restart of the background page keeps it that way.
    const restarted = f.service();

    assert.equal(
        (await restarted.dispatch({ type: "snapshot" }, 5)).activeGroupId,
        null,
    );
});

test("picking a group in a window without a group hides its tabs and closes a lone empty tab", async () => {
    const f = fixture();
    const service = f.service();
    let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
    const a = snap.groups.find((g) => g.title === "A").id;

    snap = await service.dispatch({ type: "createGroup", title: "B" }, 1);

    const b = snap.groups.find((g) => g.title === "B").id;

    await service.refresh();

    const blank = await f.api.tabs.create({
        windowId: 5,
        active: true,
        url: "about:newtab",
    });

    service.invalidate({ type: "tab", tabId: blank.id });
    await service.refresh();
    await service.dispatch({ type: "activateGroup", groupId: a }, 5);
    assert.equal(
        f.records.some((tab) => tab.id === blank.id),
        false,
        "the empty tab is closed",
    );

    const link = await f.api.tabs.create({
        windowId: 6,
        active: true,
        url: "https://example.com/link",
    });
    const blank2 = await f.api.tabs.create({
        windowId: 6,
        active: false,
        url: "about:newtab",
    });

    service.invalidate({ type: "window", windowId: 6 });
    await service.refresh();
    snap = await service.dispatch({ type: "activateGroup", groupId: b }, 6);
    assert.equal(
        f.records.find((tab) => tab.id === link.id).hidden,
        true,
        "tabs without a group are hidden, not closed",
    );
    assert.equal(f.records.find((tab) => tab.id === blank2.id).hidden, true);
    assert.deepEqual(
        snap.tabs
            .filter((tab) => tab.groupId === null)
            .map((tab) => tab.id)
            .sort(),
        [blank2.id, link.id].sort(),
    );

    // Opening a hidden tab without a group brings it into the group shown here.
    snap = await service.dispatch({ type: "activateTab", tabId: link.id }, 1);

    const opened = f.records.find((tab) => tab.id === link.id);

    assert.equal(opened.windowId, 1);
    assert.equal(opened.active, true);
    assert.equal(f.tags.get(`${link.id}:${GROUP}`), "inbox");
});

test("Firefox changing a window's group (session restore) is picked up immediately", async () => {
    const f = fixture();
    const service = f.service();
    let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
    const a = snap.groups.find((g) => g.title === "A").id;

    assert.equal(
        (await service.dispatch({ type: "snapshot" }, 1)).activeGroupId,
        "inbox",
    );
    f.windows.set(`1:${ACTIVE}`, a);
    assert.equal(
        (await service.dispatch({ type: "snapshot" }, 1)).activeGroupId,
        a,
    );
});

test("tabs tagged with an unknown group are never retagged", async () => {
    const f = fixture();

    f.tags.set(`2:${GROUP}`, "group-from-elsewhere");

    const service = f.service();

    await service.refresh();

    const snap = await service.dispatch({ type: "snapshot" }, 1);

    assert.equal(snap.tabs.find((tab) => tab.id === 2).groupId, "inbox");
    assert.equal(f.tags.get(`2:${GROUP}`), "group-from-elsewhere");
    assert.equal(
        f.tags.get(`1:${GROUP}`),
        "inbox",
        "untagged tabs are still assigned",
    );
});

test("the service refuses to start when the groups are missing but tab records exist", async () => {
    const f = fixture();

    f.values["tavvy:known:v1"] = {
        1: {
            id: 1,
            windowId: 1,
            groupId: "lost",
            title: "x",
            url: "https://x",
            pinned: false,
        },
    };

    const service = f.service();

    await assert.rejects(
        service.dispatch({ type: "snapshot" }, 1),
        /не найдены/,
    );
    assert.equal(f.tags.get(`1:${GROUP}`), undefined);
    assert.equal(f.values["tavvy:workspace:v1"], undefined);
});

test("Ctrl+T in a container group opens an active container tab immediately", async () => {
    const f = fixture();
    const identity = withContainers(f);
    const service = f.service();
    let snap = await service.dispatch(
        {
            type: "activateSpace",
            spaceId: `container:${identity.cookieStoreId}`,
        },
        1,
    );

    snap = await service.dispatch(
        { type: "createGroup", title: "Work", spaceId: snap.activeSpaceId },
        1,
    );

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

    const tab = await create({
        windowId: 1,
        active: true,
        cookieStoreId: "firefox-default",
        url: "about:newtab",
    });

    for (const item of f.records)
        if (item.windowId === 1 && item.id !== tab.id) item.active = false;
    await service.created(tab);
    f.api.tabs.query = originalQuery;
    release?.();
    await busy;

    assert.equal(
        f.records.some((item) => item.id === tab.id),
        false,
        "the original tab is closed",
    );
    assert.equal(created.length, 1);
    assert.equal(
        created[0].active,
        true,
        "created active so Firefox focuses the address bar",
    );
    assert.equal(created[0].url, undefined);
    assert.equal(created[0].cookieStoreId, identity.cookieStoreId);

    const replacement = f.records.find(
        (item) => item.cookieStoreId === identity.cookieStoreId && item.active,
    );

    assert.equal(f.tags.get(`${replacement.id}:${GROUP}`), work);
});

test("a tab restored with Ctrl+Shift+T is not replaced", async () => {
    const f = fixture();
    const identity = withContainers(f);
    const service = f.service();
    let snap = await service.dispatch(
        {
            type: "activateSpace",
            spaceId: `container:${identity.cookieStoreId}`,
        },
        1,
    );

    snap = await service.dispatch(
        { type: "createGroup", title: "Work", spaceId: snap.activeSpaceId },
        1,
    );
    await service.dispatch(
        {
            type: "activateGroup",
            groupId: snap.groups.find((g) => g.title === "Work").id,
        },
        1,
    );

    const restored = await f.api.tabs.create({
        windowId: 1,
        active: true,
        cookieStoreId: "firefox-default",
        url: "about:blank",
    });

    f.tags.set(`${restored.id}:${GROUP}`, "inbox");
    await service.created(restored);
    assert.ok(f.records.some((item) => item.id === restored.id));
});

async function containerGroup(f) {
    const identity = withContainers(f);
    const service = f.service();
    let snap = await service.dispatch(
        {
            type: "activateSpace",
            spaceId: `container:${identity.cookieStoreId}`,
        },
        1,
    );

    snap = await service.dispatch(
        { type: "createGroup", title: "Work", spaceId: snap.activeSpaceId },
        1,
    );

    const work = snap.groups.find((g) => g.title === "Work").id;

    await service.dispatch({ type: "activateGroup", groupId: work }, 1);

    return { service, identity, work };
}

test("a link from another app opens in the container of the current group", async () => {
    const f = fixture();
    const { service, identity, work } = await containerGroup(f);
    // Firefox creates it as about:blank and sets the address right after.
    const tab = await f.api.tabs.create({
        windowId: 1,
        active: true,
        cookieStoreId: "firefox-default",
        url: "about:blank",
        title: "example.org/page",
    });
    const handled = service.created(tab);

    f.records.find((item) => item.id === tab.id).url =
        "https://example.org/page";
    service.updated(tab.id, { url: "https://example.org/page" });
    await handled;
    assert.equal(
        f.records.some((item) => item.id === tab.id),
        false,
    );

    const reopened = f.records.find(
        (item) => item.url === "https://example.org/page",
    );

    assert.equal(reopened.cookieStoreId, identity.cookieStoreId);
    assert.equal(reopened.active, true);
    assert.equal(f.tags.get(`${reopened.id}:${GROUP}`), work);
});

test("a link is never replaced by an empty tab", async () => {
    const f = fixture();
    const { service } = await containerGroup(f);
    const tab = await f.api.tabs.create({
        windowId: 1,
        active: true,
        cookieStoreId: "firefox-default",
        url: "about:blank",
    });
    const before = f.records.length;
    const handled = service.created(tab);

    service.updated(tab.id, { url: "about:blank" });
    service.updated(tab.id, { url: "file:///home/user/notes.txt" });
    await handled;
    assert.equal(f.records.length, before, "no extra tab, nothing closed");
    assert.ok(f.records.some((item) => item.id === tab.id));
});

test("a new tab that loads about:newtab after about:blank is treated like Ctrl+T", async () => {
    const f = fixture();
    const { service, identity } = await containerGroup(f);
    const tab = await f.api.tabs.create({
        windowId: 1,
        active: true,
        cookieStoreId: "firefox-default",
        url: "about:blank",
    });
    const handled = service.created(tab);

    service.updated(tab.id, { url: "about:newtab" });
    await handled;
    assert.equal(
        f.records.some((item) => item.id === tab.id),
        false,
    );
    assert.ok(
        f.records.some(
            (item) =>
                item.active &&
                item.cookieStoreId === identity.cookieStoreId &&
                item.url === "about:newtab",
        ),
    );
});

test("every window lists the tabs of all groups, except other windows' global pinned tabs", async () => {
    const f = fixture();
    const service = f.service();
    const snap = await service.dispatch({ type: "snapshot" }, 2);

    assert.deepEqual(
        snap.tabs.map((tab) => tab.id),
        [4, 1, 2],
    );
});

test("picking a group hidden in another window moves its tabs to the current window", async () => {
    const f = fixture();
    const service = f.service();
    let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
    const a = snap.groups.find((g) => g.title === "A").id;

    await service.dispatch({ type: "moveTab", tabId: 2, groupId: a }, 1);
    assert.equal(f.records.find((tab) => tab.id === 2).hidden, true);

    snap = await service.dispatch({ type: "activateGroup", groupId: a }, 2);

    const moved = f.records.find((tab) => tab.id === 2);

    assert.equal(moved.windowId, 2);
    assert.equal(moved.hidden, false);
    assert.equal(moved.active, true);
    assert.equal(f.records.find((tab) => tab.id === 4).hidden, true);
    assert.equal(snap.activeGroupId, a);
    assert.equal(f.tags.get(`2:${GROUP}`), a, "the moved tab keeps its group");
    assert.equal(
        f.windows.get(`1:${ACTIVE}`),
        "inbox",
        "the source window keeps its group",
    );
    await service.attached(2, 2);
    assert.equal(f.tags.get(`2:${GROUP}`), a);
});

test("picking a group shown in another window focuses that window", async () => {
    const f = fixture();
    const service = f.service();
    let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
    const a = snap.groups.find((g) => g.title === "A").id;

    await service.dispatch({ type: "activateGroup", groupId: a }, 1);

    const count = f.records.length;

    assert.equal(f.windows.get(`2:${ACTIVE}`), "inbox");

    await service.dispatch({ type: "activateGroup", groupId: a }, 2);
    assert.equal(f.api.windows.focused, 1);
    assert.equal(f.records.length, count, "no new tab is created");
    assert.deepEqual(
        f.records.filter((tab) => tab.windowId === 2).map((tab) => tab.id),
        [4],
    );
    assert.equal(f.windows.get(`2:${ACTIVE}`), "inbox");
});

test("a group opens in a new window and the old window is left without a group", async () => {
    const f = fixture();
    const service = f.service();
    let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
    const a = snap.groups.find((g) => g.title === "A").id;

    await service.dispatch({ type: "moveTab", tabId: 2, groupId: a }, 1);
    await service.dispatch({ type: "activateTab", tabId: 2 }, 1);

    const extra = await f.api.tabs.create({
        windowId: 1,
        active: false,
        hidden: true,
        index: 3,
    });

    f.tags.set(`${extra.id}:${GROUP}`, a);
    service.invalidate({ type: "tab", tabId: extra.id });

    snap = await service.dispatch(
        { type: "openGroupInNewWindow", groupId: a },
        1,
    );

    const moved = f.records.filter((tab) => tab.windowId === 3);

    assert.deepEqual(moved.map((tab) => tab.id).sort(), [2, extra.id].sort());
    assert.ok(moved.every((tab) => tab.hidden !== true));
    assert.equal(
        f.records.find((tab) => tab.id === 2).active,
        true,
        "the selected tab stays selected",
    );
    assert.equal(f.windows.get(`3:${ACTIVE}`), a);
    assert.equal(snap.activeGroupId, null);

    const placeholder = f.records.filter(
        (tab) => tab.windowId === 1 && !tab.hidden && !tab.pinned,
    );

    assert.equal(
        placeholder.length,
        1,
        "an empty tab without a group keeps the window open",
    );
    assert.equal(f.tags.get(`${placeholder[0].id}:${GROUP}`), null);
});

test("an empty group opens in a new window with a tab of its own", async () => {
    const f = fixture();
    const service = f.service();
    let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
    const a = snap.groups.find((g) => g.title === "A").id;

    await service.dispatch({ type: "openGroupInNewWindow", groupId: a }, 1);

    const tab = f.records.find((item) => item.windowId === 3);

    assert.equal(f.tags.get(`${tab.id}:${GROUP}`), a);
    assert.equal(f.windows.get(`3:${ACTIVE}`), a);
});

/** Firefox closes window `windowId` with all its tabs, hidden ones included. */
async function closeWindowInFirefox(f, service, windowId) {
    for (const tab of f.records.filter((item) => item.windowId === windowId)) {
        f.records.splice(f.records.indexOf(tab), 1);
        service.invalidate({ type: "removed", tabId: tab.id, windowId });
        await service.removed(tab.id, true);
    }

    service.invalidate({ type: "windowRemoved", windowId });
    await service.refresh();
}

test("grouped tabs of a closed window are recreated in a remaining window, as in Simple Tab Groups", async () => {
    const f = fixture();
    const service = f.service();
    let snap = await service.dispatch({ type: "createGroup", title: "A" }, 1);
    const a = snap.groups.find((g) => g.title === "A").id;

    await service.dispatch({ type: "moveTab", tabId: 2, groupId: a }, 1);
    await service.dispatch({ type: "activateGroup", groupId: "inbox" }, 1);
    await service.refresh();
    assert.equal(f.records.find((tab) => tab.id === 2).hidden, true);

    await closeWindowInFirefox(f, service, 1);

    const restored = f.records.find((tab) => tab.url === "https://mozilla.org");

    assert.ok(restored, "the hidden tab of group A is not lost");
    assert.equal(restored.windowId, 2);
    assert.equal(restored.discarded, true);
    assert.equal(f.tags.get(`${restored.id}:${GROUP}`), a);
    assert.equal(restored.hidden, true, "group A is not shown in window 2");

    const inbox = f.records.find((tab) => tab.url === "https://example.com");

    assert.equal(f.tags.get(`${inbox.id}:${GROUP}`), "inbox");
    assert.ok(
        !f.records.some((tab) => tab.url === "https://example.org"),
        "global pinned tabs are not groups' tabs",
    );
    snap = await service.dispatch({ type: "snapshot" }, 2);
    assert.equal(snap.tabs.filter((tab) => tab.groupId === a).length, 1);
    assert.deepEqual(f.values["tavvy:tabs-to-restore:v1"], []);
});

test("tabs of a window closed in a previous session are restored once, skipping tabs Firefox restored", async () => {
    const f = fixture();

    f.values["tavvy:workspace:v1"] = {
        version: 1,
        groups: [
            { id: "inbox", title: "Inbox", parentId: null },
            { id: "a", title: "A", parentId: null },
        ],
        settings: {},
    };
    f.values["tavvy:tabs-to-restore:v1"] = [
        {
            windowId: 1,
            groupId: "a",
            url: "https://mozilla.org",
            title: "Вторая",
            faviconUrl: "",
        },
        {
            windowId: 1,
            groupId: "a",
            url: "https://lost.example",
            title: "Lost",
            faviconUrl: "",
        },
        {
            windowId: 1,
            groupId: "gone",
            url: "https://deleted.example",
            title: "Deleted",
            faviconUrl: "",
        },
    ];
    f.tags.set(`2:${GROUP}`, "a");
    f.windows.set(`1:${ACTIVE}`, "inbox");
    f.windows.set(`2:${ACTIVE}`, "inbox");

    const service = f.service();

    await service.refresh();
    assert.ok(
        !f.records.some((tab) => tab.url === "https://lost.example"),
        "waits for Firefox's own session restore",
    );

    const now = Date.now;

    Date.now = () => now() + 60_000;

    try {
        service.invalidate({ type: "window", windowId: 1 });
        await service.refresh();
    } finally {
        Date.now = now;
    }

    assert.equal(
        f.records.filter((tab) => tab.url === "https://mozilla.org").length,
        1,
        "no duplicate of a restored tab",
    );

    const lost = f.records.find((tab) => tab.url === "https://lost.example");

    assert.ok(lost);
    assert.equal(f.tags.get(`${lost.id}:${GROUP}`), "a");
    assert.equal(lost.hidden, true);
    assert.ok(!f.records.some((tab) => tab.url === "https://deleted.example"));
    assert.deepEqual(f.values["tavvy:tabs-to-restore:v1"], []);
});
