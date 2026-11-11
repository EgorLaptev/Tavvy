import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
    expandedPath,
    pathToGroup,
    collapseSubtree,
    toggleExpanded,
    groupChildren,
} from "../src/ui/state/tree.js";
import {
    groupTitle,
    tabTitle,
    groupSpace,
    draftMarkerColor,
} from "../src/ui/state/labels.js";
import { tabStatusNames, groupStatusNames } from "../src/ui/state/statuses.js";
import {
    groupDepth,
    groupMoveTargets,
    tabMoveTargets,
    containerChoices,
} from "../src/ui/menus/menu-model.js";
import { submenuLeft } from "../src/ui/menus/context-menu.js";
import {
    clampToViewport,
    reorderChildren,
    safeFaviconUrl,
} from "../src/ui/dom.js";
import { snapshotChanged, virtualSlice } from "../src/ui/view-index.js";

const t = (key) => `<${key}>`;
// inbox ─ a ─ a1 ─ a11
//       └ b
// c (container work)
const groups = [
    { id: "inbox", title: "Основная" },
    { id: "a", title: "A", parentId: "inbox" },
    { id: "a1", title: "A1", parentId: "a" },
    { id: "a11", title: "A11", parentId: "a1" },
    { id: "b", title: "B", parentId: "inbox" },
    { id: "c", title: "C", spaceId: "container:1" },
];
const index = new Map(groups.map((group) => [group.id, group]));
const parentOf = (id) => index.get(id)?.parentId;

const isInside = (outer, inner) => {
    for (let id = parentOf(inner); id; id = parentOf(id))
        if (id === outer) return true;

    return false;
};

test("a group is reachable only when all its ancestors are expanded", () => {
    assert.equal(
        expandedPath(index.get("a1"), new Set(["inbox", "a"]), index, true),
        true,
    );
    assert.equal(
        expandedPath(index.get("a1"), new Set(["a"]), index, true),
        false,
    );
    assert.equal(expandedPath(index.get("a1"), new Set(), index, false), true);
    assert.equal(
        expandedPath(index.get("inbox"), new Set(), index, true),
        true,
    );
});

test("the path to a group lists the group and its ancestors", () => {
    assert.deepEqual([...pathToGroup("a1", index, true)], ["a1", "a", "inbox"]);
    assert.deepEqual([...pathToGroup("a1", index, false)], ["a1"]);

    const cycle = new Map([
        ["x", { id: "x", parentId: "y" }],
        ["y", { id: "y", parentId: "x" }],
    ]);

    assert.deepEqual([...pathToGroup("x", cycle, true)], ["x", "y"]);
});

test("collapsing a subtree keeps ancestors and siblings open", () => {
    const opened = new Set(["inbox", "a", "a1", "a11", "b"]);

    collapseSubtree(opened, "a", parentOf);
    assert.deepEqual([...opened], ["inbox", "b"]);

    const flat = new Set(["inbox", "a", "a1"]);

    collapseSubtree(flat, "a", () => null);
    assert.deepEqual([...flat], ["inbox", "a1"]);
});

test("toggling opens one branch and closing removes descendants", () => {
    const opened = new Set(["inbox", "a", "b"]);

    toggleExpanded(opened, "a1", isInside);
    assert.deepEqual([...opened].sort(), ["a", "a1", "inbox"]);
    toggleExpanded(opened, "a11", isInside);
    toggleExpanded(opened, "a", isInside);
    assert.deepEqual([...opened], ["inbox"]);
});

test("cards are laid out under existing parents in snapshot order", () => {
    const children = groupChildren(
        [...groups, { id: "orphan", title: "O", parentId: "gone" }],
        index,
        true,
    );

    assert.deepEqual(Object.fromEntries(children), {
        null: ["inbox", "c", "orphan"],
        inbox: ["a", "b"],
        a: ["a1"],
        a1: ["a11"],
    });
    assert.deepEqual(
        [...groupChildren(groups, index, false)],
        [[null, groups.map((group) => group.id)]],
    );
});

test("legacy default names are translated, other titles are shown verbatim", () => {
    assert.equal(groupTitle(index.get("inbox"), t), "<groups.main>");
    assert.equal(groupTitle({ id: "x", title: "Основная" }, t), "Основная");
    assert.equal(
        tabTitle({ url: "about:newtab", title: "Новая вкладка" }, t),
        "<tabs.new_tab>",
    );
    assert.equal(
        tabTitle({ url: "https://example.com", title: "Новая вкладка" }, t),
        "Новая вкладка",
    );
});

test("container labels name missing and unavailable containers", () => {
    const spaces = [
        { id: "default", name: "None" },
        { id: "container:1", name: "Work", unavailable: true },
    ];

    assert.deepEqual(groupSpace(index.get("inbox"), spaces, t), {
        space: spaces[0],
        label: "<spaces.default>",
    });
    assert.equal(
        groupSpace(index.get("c"), spaces, t).label,
        "Work: <spaces.container_unavailable>",
    );
    assert.equal(
        groupSpace({ spaceId: "container:9" }, spaces, t).label,
        "container:9",
    );
    assert.equal(
        groupSpace({ spaceId: "container:9" }, undefined, t).space,
        undefined,
    );
    assert.equal(draftMarkerColor(0), draftMarkerColor(5));
    assert.notEqual(draftMarkerColor(0), draftMarkerColor(1));
});

test("status indicators follow tab state in a fixed order", () => {
    assert.deepEqual(
        tabStatusNames({
            pinned: true,
            audible: true,
            sharingState: { camera: true, screen: "Screen" },
        }),
        ["pinned", "audible", "screen", "camera"],
    );
    assert.deepEqual(
        tabStatusNames({ audible: true, muted: true, managedPinned: true }),
        ["pinned", "muted"],
    );
    assert.deepEqual(tabStatusNames({}), []);
    assert.deepEqual(groupStatusNames(0), []);
    assert.deepEqual(groupStatusNames(7), ["audible", "screen", "microphone"]);
    assert.deepEqual(groupStatusNames(4), ["microphone"]);
});

test("a group moves only under same-level groups outside its own subtree", () => {
    assert.equal(groupDepth(index.get("a11"), index), 3);
    assert.equal(groupDepth(undefined, index), 0);
    assert.deepEqual(
        groupMoveTargets(groups, index, "b").map((group) => group.id),
        ["a"],
    );
    assert.deepEqual(
        groupMoveTargets(groups, index, "a").map((group) => group.id),
        ["b"],
    );
    assert.deepEqual(
        groupMoveTargets(groups, index, "c").map((group) => group.id),
        ["inbox"],
    );
});

test("a tab moves only to other groups of its container", () => {
    assert.deepEqual(
        tabMoveTargets(groups, index, { groupId: "a" }).map(
            (group) => group.id,
        ),
        ["inbox", "a1", "a11", "b"],
    );
    assert.deepEqual(tabMoveTargets(groups, index, { groupId: "c" }), []);
});

test("container choices offer reconnecting a missing container", () => {
    const spaces = [
        { id: "default" },
        { id: "container:1", unavailable: true, name: "Gone" },
        { id: "container:2", firefoxContainer: true, name: "Work" },
    ];
    const choices = containerChoices(spaces, index.get("c"));

    assert.equal(choices.current, "container:1");
    assert.deepEqual(
        choices.destinations.map(({ space, current }) => [space.id, current]),
        [
            ["default", false],
            ["container:2", false],
        ],
    );
    assert.equal(choices.missing, spaces[1]);
    assert.deepEqual(choices.reconnect, [spaces[2]]);

    const plain = containerChoices(spaces, index.get("a"));

    assert.equal(plain.current, "default");
    assert.equal(plain.destinations[0].current, true);
    assert.equal(plain.missing, null);
    assert.deepEqual(plain.reconnect, []);
});

test("popovers stay inside the viewport", () => {
    assert.equal(clampToViewport(390, 100, 400), 300);
    assert.equal(clampToViewport(-5, 100, 400), 0);
    assert.equal(clampToViewport(1, 100, 400, 4), 4);
    assert.equal(clampToViewport(390, 100, 400, 4), 296);
    assert.equal(submenuLeft({ left: 10, right: 110 }, 80, 400), 110);
    assert.equal(submenuLeft({ left: 300, right: 380 }, 80, 400), 220);
    assert.equal(submenuLeft({ left: 20, right: 380 }, 80, 400), 0);
});

test("only web, data image and extension favicons are loaded", () => {
    assert.equal(safeFaviconUrl("https://example.com/favicon.ico"), true);
    assert.equal(safeFaviconUrl("data:image/png;base64,AA=="), true);
    assert.equal(safeFaviconUrl("moz-extension://id/icon.svg"), true);
    assert.equal(safeFaviconUrl("chrome://branding/icon.png"), false);
    assert.equal(safeFaviconUrl(undefined), false);
});

test("children are reordered in place and extra nodes removed", () => {
    const { document } = new JSDOM(
        "<div><i id=a></i><i id=b></i><i id=c></i></div>",
    ).window;
    const parent = document.querySelector("div");
    const [a, b, c] = parent.children;
    const d = document.createElement("i");

    reorderChildren(parent, [c, d, a]);
    assert.deepEqual([...parent.childNodes], [c, d, a]);
    assert.equal(b.isConnected, false);
});

test("the view index is rebuilt only when the view version changes", () => {
    assert.equal(
        snapshotChanged({ viewVersion: 1 }, { viewVersion: 1 }),
        false,
    );
    assert.equal(snapshotChanged({ viewVersion: 1 }, { viewVersion: 2 }), true);
    assert.equal(snapshotChanged({ viewVersion: 1 }, {}), true);
});

test("virtual slices keep spacer heights equal to the hidden rows", () => {
    assert.deepEqual(virtualSlice(100, 600, 300), {
        start: 0,
        end: 100,
        before: 0,
        after: 0,
    });

    const slice = virtualSlice(1000, 3000, 300);

    assert.equal(slice.before, slice.start * 30);
    assert.equal(slice.after, (1000 - slice.end) * 30);
    assert.ok(slice.start <= 100 && slice.end >= 110);
});
