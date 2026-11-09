import test from "node:test";
import assert from "node:assert/strict";
import { dragStarted, insideRect, nearHeaderEdge, reorderThreshold } from "../src/features/drag-drop/geometry.js";

const point = (clientX, clientY) => ({ clientX, clientY });
const header = { left: 0, right: 200, top: 100, bottom: 140, height: 40 };

test("a press becomes a drag after more than six pixels of travel", () => {
  assert.equal(dragStarted({ x: 10, y: 10 }, point(12, 12)), false);
  assert.equal(dragStarted({ x: 10, y: 10 }, point(16, 10)), false);
  assert.equal(dragStarted({ x: 10, y: 10 }, point(17, 10)), true);
  assert.equal(dragStarted({ x: 10, y: 10 }, point(30, 30)), true);
});

test("the trash hit test includes its edges", () => {
  assert.equal(insideRect(point(0, 100), header), true);
  assert.equal(insideRect(point(200, 140), header), true);
  assert.equal(insideRect(point(201, 120), header), false);
  assert.equal(insideRect(point(50, 99), header), false);
});

test("only the outer eight pixels of a header reorder", () => {
  assert.equal(nearHeaderEdge(102, header), true);
  assert.equal(nearHeaderEdge(138, header), true);
  assert.equal(nearHeaderEdge(108, header), false);
  assert.equal(nearHeaderEdge(132, header), false);
});

test("the reorder threshold moves away from an adjacent placeholder", () => {
  assert.equal(reorderThreshold(header, -1, 2), 120);
  assert.equal(reorderThreshold(header, 1, 2), 128);
  assert.equal(reorderThreshold(header, 3, 2), 112);
  assert.equal(reorderThreshold(header, 0, 2), 120);
  assert.equal(reorderThreshold({ top: 0, height: 16 }, 1, 2), 12);
});
