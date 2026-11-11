import test from "node:test";
import assert from "node:assert/strict";
import {
    DEFAULT_SPACE_ID,
    groupSpaceId,
    groupsInSpace,
    spaceForGroup,
} from "../src/domain/spaces.js";

test("legacy groups stay in the default space while new groups remain separate", () => {
    const spaces = [
        { id: DEFAULT_SPACE_ID },
        { id: "work", cookieStoreId: "firefox-container-1" },
    ];
    const groups = [
        { id: "inbox" },
        { id: "a", spaceId: "work" },
        { id: "b", spaceId: "work", parentId: "a" },
    ];
    assert.equal(groupSpaceId(groups[0]), DEFAULT_SPACE_ID);
    assert.deepEqual(
        groupsInSpace(groups, DEFAULT_SPACE_ID).map((group) => group.id),
        ["inbox"],
    );
    assert.deepEqual(
        groupsInSpace(groups, "work").map((group) => group.id),
        ["a", "b"],
    );
    assert.equal(
        spaceForGroup(spaces, groups[2]).cookieStoreId,
        "firefox-container-1",
    );
    assert.equal(spaceForGroup(spaces, { spaceId: "missing" }), undefined);
});

test("workspace backups preserve groups nested across spaces", async () => {
    const { parseTavvyBackup } = await import("../src/domain/tavvy-backup.js");
    const backup = {
        format: "tavvy-backup",
        version: 2,
        groups: [
            { id: "inbox", title: "Main", color: "#398dff", parentId: null },
            {
                id: "g1",
                title: "Work",
                color: "#398dff",
                parentId: null,
                spaceId: "work",
            },
        ],
        spaces: [{ id: "work", name: "Work" }],
        tabs: [],
        archive: [],
        settings: {},
    };
    const parsed = parseTavvyBackup(backup);
    assert.deepEqual(parsed.spaces, [{ id: "work", name: "Work" }]);
    assert.equal(parsed.groups[1].spaceId, "work");
    assert.equal(
        parseTavvyBackup({
            ...backup,
            groups: [
                backup.groups[0],
                { ...backup.groups[1], parentId: "inbox" },
            ],
        }).groups[1].parentId,
        "inbox",
    );
    assert.equal(
        parseTavvyBackup({
            ...backup,
            groups: [
                { ...backup.groups[0], spaceId: "work" },
                backup.groups[1],
            ],
        }).groups[0].spaceId,
        "work",
    );
    assert.throws(() => parseTavvyBackup({ ...backup, spaces: [] }));
    assert.throws(() => parseTavvyBackup({ ...backup, version: 1 }));
    assert.throws(() => parseTavvyBackup({ ...backup, spaces: undefined }));
    assert.deepEqual(
        parseTavvyBackup({ ...backup, groups: [backup.groups[0]] }).spaces,
        backup.spaces,
    );
});
