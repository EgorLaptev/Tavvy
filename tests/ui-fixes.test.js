import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { groupMoveTargets } from "../src/ui/menus/menu-model.js";
import { normalizeSettings, MAX_POPUP_HEIGHT } from "../src/domain/settings.js";
import { panelSize } from "../src/features/settings/appearance.js";

function withDom(html, run) {
    const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
    const saved = { document: globalThis.document, window: globalThis.window };
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    try {
        return run(dom.window);
    } finally {
        globalThis.document = saved.document;
        globalThis.window = saved.window;
    }
}

test("move targets terminate on cyclic group data", () => {
    const groups = [
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" },
        { id: "c", parentId: null },
    ];
    const index = new Map(groups.map((group) => [group.id, group]));
    assert.doesNotThrow(() => groupMoveTargets(groups, index, "c"));
});

test("popup height never exceeds what Firefox can show", () => {
    assert.equal(MAX_POPUP_HEIGHT, 600);
    assert.equal(normalizeSettings({ height: 750 }).height, 600);
    assert.equal(panelSize({ width: 440, height: 750 }).height, 600);
});

test("pressing inside the new-group draft does not start a group drag", async () => {
    const { bindGroupHeader, disposeGroupDrag } =
        await import("../src/features/drag-drop/group-drag.js");
    await withDom(
        '<div class="group-draft"><div class="group-header"><input></div></div>',
        (window) => {
            const header = window.document.querySelector(".group-header");
            let captured = false;
            header.setPointerCapture = () => (captured = true);
            bindGroupHeader(header, {});
            const event = new window.MouseEvent("pointerdown", {
                bubbles: true,
                button: 0,
            });
            window.document.querySelector("input").dispatchEvent(event);
            assert.equal(captured, false);
            disposeGroupDrag();
        },
    );
});

test("cancelling a drag clears the drop highlight", async () => {
    const { disposeTabDrag } =
        await import("../src/features/drag-drop/tab-drag.js");
    withDom('<div class="group drop-target"></div>', (window) => {
        disposeTabDrag();
        assert.equal(window.document.querySelector(".drop-target"), null);
    });
});
