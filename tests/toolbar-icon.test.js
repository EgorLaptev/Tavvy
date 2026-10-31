import test from "node:test";
import assert from "node:assert/strict";
import { createToolbarIcon } from "../src/background/toolbar-icon.js";
import { groupMarker } from "../src/domain/group-marker.js";
test("group markers are deterministic across popup and toolbar", () => {
  assert.deepEqual(groupMarker("group-id"), groupMarker("group-id"));
  assert.ok(groupMarker("group-id").borderRadius.includes("/"));
});
test("toolbar updates are cached per window and titles follow group selection", async () => {
  const calls = [];
  const api = {
    action: {
      setIcon: async (value) => calls.push(["icon", value]),
      setTitle: async (value) => calls.push(["title", value]),
    },
  };
  const ctx = {
    save() {},
    translate() {},
    rotate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    restore() {},
    getImageData(x, y, w, h) {
      return { width: w, height: h };
    },
  };
  const toolbar = createToolbarIcon(api, () => ({ getContext: () => ctx }));
  const group = { id: "a", color: "#398dff", title: "Работа" };
  await toolbar.update(1, group);
  await toolbar.update(1, group);
  assert.equal(calls.length, 2);
  assert.deepEqual(Object.keys(calls[0][1].imageData), ["16", "32", "64"]);
  await toolbar.update(2, group);
  assert.equal(calls.length, 4);
  assert.equal(calls[2][1].windowId, 2);
  await toolbar.setStyle("circle");
  assert.equal(calls.length, 8);
  await toolbar.setStyle("circle");
  assert.equal(calls.length, 8);
  await toolbar.update(1, { ...group, id: "b", title: "Личное" });
  assert.equal(calls.at(-1)[1].title, "Tavvy — Личное");
});
