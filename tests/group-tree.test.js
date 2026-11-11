import test from "node:test";
import assert from "node:assert/strict";
import {
    assertNoCycle,
    normalizeGroupColor,
    normalizeNewTitle,
    normalizeRenamedTitle,
    placeGroup,
    removeGroup,
    visibleGroupIds,
} from "../src/domain/group-tree.js";
import {
    isBlankUrl,
    isInternalPage,
    isTransferableUrl,
    placeholderUrl,
    readPlaceholder,
} from "../src/domain/urls.js";

const tree = () => [
    { id: "inbox", parentId: null },
    { id: "a", parentId: null },
    { id: "a1", parentId: "a" },
    { id: "a11", parentId: "a1" },
    { id: "b", parentId: null },
];

test("visible groups follow the nesting mode", () => {
    assert.deepEqual([...visibleGroupIds(tree(), "a11", {})].sort(), [
        "a",
        "a1",
        "a11",
    ]);
    assert.deepEqual(
        [
            ...visibleGroupIds(tree(), "a", {
                nestedTabsVisibility: "children",
            }),
        ].sort(),
        ["a", "a1", "a11"],
    );
    assert.deepEqual(
        [...visibleGroupIds(tree(), "a1", { nestedGroups: false })],
        ["a1"],
    );
});

test("visible groups tolerate a corrupted cyclic tree", () => {
    const cyclic = [
        { id: "x", parentId: "y" },
        { id: "y", parentId: "x" },
    ];

    assert.deepEqual([...visibleGroupIds(cyclic, "x", {})].sort(), ["x", "y"]);
});

test("nesting a group into its own descendant is rejected", () => {
    assert.throws(() => assertNoCycle(tree(), "a", "a11"), /саму себя/);
    assert.doesNotThrow(() => assertNoCycle(tree(), "b", "a11"));
});

test("placing and removing groups keeps order and reparents children", () => {
    const groups = tree();

    assert.deepEqual(
        placeGroup(groups, groups[4], "a").map((g) => g.id),
        ["inbox", "b", "a", "a1", "a11"],
    );
    assert.deepEqual(
        placeGroup(groups, groups[0], "missing").map((g) => g.id),
        ["a", "a1", "a11", "b", "inbox"],
    );

    const remaining = removeGroup(tree(), "a1");

    assert.equal(remaining.find((g) => g.id === "a11").parentId, "a");
    assert.equal(
        remaining.some((g) => g.id === "a1"),
        false,
    );
});

test("group titles and colors are validated", () => {
    assert.equal(normalizeNewTitle("  Work  "), "Work");
    assert.equal(normalizeNewTitle("x".repeat(150)).length, 100);
    assert.throws(() => normalizeNewTitle("   "));
    assert.throws(() => normalizeRenamedTitle("x".repeat(101)));
    assert.equal(normalizeGroupColor("#ABCDEF"), "#abcdef");
    assert.throws(() => normalizeGroupColor("red"));
});

test("URL classification", () => {
    assert.ok(
        isBlankUrl("about:newtab") &&
            isBlankUrl("about:home") &&
            isBlankUrl(undefined),
    );
    assert.ok(!isBlankUrl("https://example.com"));
    assert.ok(
        isInternalPage("about:preferences") &&
            isInternalPage("about:addons#detail"),
    );
    assert.ok(
        isInternalPage(
            "moz-extension://01234567-89ab-cdef-0123-456789abcdef/options.html",
        ),
    );
    assert.ok(
        !isInternalPage("about:blank") &&
            !isInternalPage("about:newtab") &&
            !isInternalPage("https://a.b"),
    );
    assert.ok(
        isTransferableUrl("https://a.b") &&
            isTransferableUrl("about:blank") &&
            !isTransferableUrl("file:///x"),
    );

    const url = placeholderUrl(
        "moz-extension://x/local-file.html",
        "file:///a b",
        "A",
    );

    assert.deepEqual(readPlaceholder(url), { url: "file:///a b", title: "A" });
    assert.equal(readPlaceholder("https://a.b"), null);
});
