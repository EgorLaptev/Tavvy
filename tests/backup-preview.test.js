import test from "node:test";
import assert from "node:assert/strict";
import { previewBackup } from "../src/domain/backup-preview.js";

test("STG backup preview counts empty groups, tabs and pinned tabs", () => {
    const result = previewBackup({
        version: "5",
        groups: [
            { id: 1, title: "Work", tabs: [{ url: "https://example.com" }] },
            { id: 2, title: "Empty", tabs: [] },
        ],
        pinnedTabs: [{ url: "about:addons" }],
    });

    assert.deepEqual(result, {
        groups: [
            { title: "Work", tabs: 1 },
            { title: "Empty", tabs: 0 },
        ],
        tabs: 1,
        pinned: 1,
        spaces: 0,
        legacy: 0,
    });
});
test("Tavvy backup preview separates pinned tabs and retains legacy counts", () => {
    const result = previewBackup({
        format: "tavvy-backup",
        version: 1,
        groups: [
            { id: "inbox", title: "Main", color: "#398dff", parentId: null },
        ],
        tabs: [
            { groupId: "inbox", url: "https://one.example" },
            { groupId: "inbox", url: "https://two.example", pinned: true },
        ],
        archive: [{ groupId: "inbox", url: "https://old.example" }],
        settings: {},
    });

    assert.deepEqual(result, {
        groups: [{ title: "Main", tabs: 1 }],
        tabs: 1,
        pinned: 1,
        spaces: 0,
        legacy: 1,
    });
});
test("backup preview rejects unsafe URLs before restore", () => {
    assert.throws(() =>
        previewBackup({
            version: "5",
            groups: [{ title: "Bad", tabs: [{ url: "javascript:alert(1)" }] }],
        }),
    );
});
