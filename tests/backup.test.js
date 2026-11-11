import test from "node:test";
import assert from "node:assert/strict";
import { createBackupManager } from "../src/background/backup.js";
import { parseTavvyBackup } from "../src/domain/tavvy-backup.js";
import {
    validBackupFolder,
    normalizeSettings,
} from "../src/domain/settings.js";

test("backup scheduling persists its first due date and records completed downloads", async () => {
    const values = {
        "tavvy:workspace:v1": {
            settings: { backupEnabled: true, backupFrequency: "daily" },
        },
    };
    const alarms = [],
        downloads = [];
    const api = {
        storage: {
            local: {
                get: async (key) => ({ [key]: values[key] }),
                set: async (data) => Object.assign(values, data),
            },
        },
        alarms: {
            clear: async () => {},
            create: async (name, options) => alarms.push({ name, ...options }),
        },
        downloads: {
            download: async (options) => {
                downloads.push(options);

                return 1;
            },
            search: async () => [{ state: "complete" }],
        },
    };
    const manager = createBackupManager(api, {
        dispatch: async () => ({ format: "tavvy-backup" }),
    });

    await manager.schedule();

    const first = alarms.at(-1).when;

    await manager.schedule();
    assert.equal(alarms.at(-1).when, first);
    await manager.download(1);
    assert.match(downloads[0].filename, /^Tavvy\/backup-.*\.json$/);
    assert.equal(downloads[0].saveAs, false);
    assert.ok((await manager.status()).lastSuccess);
    values["tavvy:workspace:v1"].settings.backupFolder = "Мои копии/Tavvy";
    await manager.download(1);
    assert.match(downloads[1].filename, /^Мои копии\/Tavvy\/backup-.*\.json$/);
});

test("backup folders stay inside downloads", () => {
    assert.equal(validBackupFolder("Tavvy/Backups"), true);

    for (const path of [
        "../outside",
        "/absolute",
        "C:\\outside",
        "Tavvy/../outside",
        "Tavvy//x",
        "CON",
    ]) {
        assert.equal(validBackupFolder(path), false);
        assert.equal(
            normalizeSettings({ backupFolder: path }).backupFolder,
            "Tavvy",
        );
    }
});

test("backups are scheduled by default while an explicit opt-out is respected", async () => {
    let stored;
    const alarms = [];
    const values = {};
    const api = {
        storage: {
            local: {
                get: async (key) => ({
                    [key]: key === "tavvy:workspace:v1" ? stored : values[key],
                }),
                set: async (data) => Object.assign(values, data),
            },
        },
        alarms: {
            clear: async () => {},
            create: async (name, options) => alarms.push({ name, ...options }),
        },
    };
    const manager = createBackupManager(api, {});

    await manager.schedule();
    assert.equal(alarms.length, 1);
    assert.ok(
        alarms[0].when > Date.now() + 3 * 3600000 &&
            alarms[0].when <= Date.now() + 4 * 3600000,
    );
    assert.equal(normalizeSettings({}).backupFrequency, "fourHours");
    assert.equal(
        normalizeSettings({ backupFrequency: "daily" }).backupFrequency,
        "daily",
    );
    stored = { settings: { backupEnabled: false } };
    await manager.schedule();
    assert.equal(alarms.length, 1);
    assert.equal(
        normalizeSettings({ backupEnabled: false }).backupEnabled,
        false,
    );
});

test("backup validation rejects cyclic groups and executable URLs", () => {
    const backup = {
        format: "tavvy-backup",
        version: 1,
        groups: [
            { id: "inbox", title: "Main", color: "#398dff", parentId: null },
        ],
        tabs: [],
        archive: [],
        settings: {},
    };

    assert.equal(parseTavvyBackup(backup).groups.length, 1);
    assert.throws(() =>
        parseTavvyBackup({
            ...backup,
            tabs: [{ groupId: "inbox", url: "javascript:alert(1)" }],
        }),
    );
    assert.throws(() =>
        parseTavvyBackup({
            ...backup,
            groups: [{ ...backup.groups[0], parentId: "inbox" }],
        }),
    );
});

test("accent color survives backup parsing and rejects values outside the preset palette", () => {
    const backup = {
        format: "tavvy-backup",
        version: 1,
        groups: [
            { id: "inbox", title: "Main", color: "#398dff", parentId: null },
        ],
        tabs: [],
        archive: [],
        settings: { accentColor: "#38BDF8" },
    };
    const settings = parseTavvyBackup(backup).settings;

    assert.equal(settings.accentColor, "#38bdf8");
    assert.equal(
        normalizeSettings({ accentColor: "red; color: red" }).accentColor,
        "#398dff",
    );
    assert.equal(
        normalizeSettings({ accentColor: "#123456" }).accentColor,
        "#398dff",
    );
});

test("automatic backup removes only its completed download from history", async () => {
    const values = {},
        calls = [];
    const api = {
        storage: {
            local: {
                get: async (key) => ({ [key]: values[key] }),
                set: async (data) => Object.assign(values, data),
            },
        },
        alarms: { clear: async () => {}, create: async () => {} },
        windows: { getLastFocused: async () => ({ id: 1 }) },
        downloads: {
            download: async () => {
                calls.push("download");

                return 42;
            },
            search: async () => {
                calls.push("complete");

                return [{ state: "complete" }];
            },
            erase: async (query) => {
                calls.push(["erase", query]);
            },
        },
    };
    const manager = createBackupManager(api, {
        dispatch: async () => ({ format: "tavvy-backup" }),
    });

    await manager.runAlarm({ name: "tavvy-backup" });
    assert.deepEqual(calls, ["download", "complete", ["erase", { id: 42 }]]);
    assert.ok((await manager.status()).lastSuccess);
    calls.length = 0;
    await manager.download(1);
    assert.deepEqual(calls, ["download", "complete"]);
});

test("automatic backup stays successful if removing its history entry fails", async () => {
    const values = {};
    const api = {
        storage: {
            local: {
                get: async (key) => ({ [key]: values[key] }),
                set: async (data) => Object.assign(values, data),
            },
        },
        downloads: {
            download: async () => 7,
            search: async () => [{ state: "complete" }],
            erase: async () => {
                throw new Error("history unavailable");
            },
        },
    };
    const manager = createBackupManager(api, { dispatch: async () => ({}) });

    await manager.download(1, { automatic: true });
    assert.ok((await manager.status()).lastSuccess);
    assert.equal((await manager.status()).error, "");
});

test("failed automatic backup does not erase its history entry", async () => {
    const values = {};
    let erased = false;
    const api = {
        storage: {
            local: {
                get: async (key) => ({ [key]: values[key] }),
                set: async (data) => Object.assign(values, data),
            },
        },
        downloads: {
            download: async () => 9,
            search: async () => [{ state: "interrupted", error: "failed" }],
            erase: async () => {
                erased = true;
            },
        },
    };
    const manager = createBackupManager(api, { dispatch: async () => ({}) });

    await assert.rejects(manager.download(1, { automatic: true }));
    assert.equal(erased, false);
});
