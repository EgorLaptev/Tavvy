import { bindGroupHeader, disposeGroupDrag } from "./group-drag.js";
import { bindGroupDropTarget, bindTabRow, disposeTabDrag } from "./tab-drag.js";

const boundGroups = new WeakSet(),
  boundHeaders = new WeakSet(),
  boundRows = new WeakSet();

/**
 * Binds drag handling to every group card, group header and tab row not bound yet.
 * Called after each render; the callbacks turn drops into workspace commands.
 */
export function mountDragDrop(actions = {}) {
  document.querySelectorAll(".group").forEach((group) => {
    if (boundGroups.has(group)) return;
    boundGroups.add(group);
    bindGroupDropTarget(group, actions);
  });
  document.querySelectorAll(".group-header").forEach((header) => {
    if (boundHeaders.has(header)) return;
    boundHeaders.add(header);
    bindGroupHeader(header, actions);
  });
  document.querySelectorAll(".tab-row").forEach((row) => {
    if (boundRows.has(row)) return;
    boundRows.add(row);
    bindTabRow(row, actions);
  });
}

/** Cancels any drag in progress without dispatching commands (the popup is closing). */
export function disposeDragState() {
  disposeGroupDrag();
  disposeTabDrag();
}
