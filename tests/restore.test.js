import test from "node:test";
import assert from "node:assert/strict";
import { createRestoreManager } from "../src/background/restore.js";

const backup = {
    version: "5",
    groups: [{ title: "Group", tabs: [{ url: "https://example.org" }] }],
};
function fixture({ failBackup = false, failImport = false } = {}) {
    const calls = [];
    const browser = {
        tabs: { remove: async (ids) => calls.push(["remove", ids]) },
    };
    const service = {
        dispatch: async (command) => {
            calls.push([command.type]);
            if (failImport) throw new Error("import failed");
            return { importReport: {} };
        },
    };
    const backups = {
        download: async (window, options) => {
            calls.push(["backup", window, options]);
            if (failBackup) throw new Error("backup failed");
        },
    };
    return { restore: createRestoreManager(browser, service, backups), calls };
}

test("restore saves a fresh backup before importing", async () => {
    const { restore, calls } = fixture();
    await restore({ type: "importStg", backup }, 7);
    assert.deepEqual(calls, [["backup", 7, { fresh: true }], ["importStg"]]);
});

test("a failed backup prevents the import from changing anything", async () => {
    const { restore, calls } = fixture({ failBackup: true });
    await assert.rejects(restore({ type: "importStg", backup }, 7));
    assert.deepEqual(calls, [["backup", 7, { fresh: true }]]);
});

test("a failed import is reported", async () => {
    const { restore } = fixture({ failImport: true });
    await assert.rejects(
        restore({ type: "importStg", backup }, 7),
        /import failed/,
    );
});

test("invalid backup is rejected before saving or modifying tabs", async () => {
    const { restore, calls } = fixture();
    await assert.rejects(restore({ type: "importStg", backup: {} }, 7));
    await assert.rejects(
        restore(
            { type: "importBackup", backup: { format: "tavvy-backup" } },
            7,
        ),
    );
    assert.deepEqual(calls, []);
});

test("restores run one after another", async () => {
    const order = [];
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const service = {
        dispatch: async (command) => {
            order.push("start " + command.id);
            if (command.id === 1) await gate;
            order.push("end " + command.id);
            return {};
        },
    };
    const restore = createRestoreManager({}, service, {
        download: async () => {},
    });
    const first = restore({ type: "importStg", backup, id: 1 }, 1);
    const second = restore({ type: "importStg", backup, id: 2 }, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await Promise.all([first, second]);
    assert.deepEqual(order, ["start 1", "end 1", "start 2", "end 2"]);
});
