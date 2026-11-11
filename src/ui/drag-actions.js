import { collapseSubtree } from "./state/tree.js";

/** Callbacks for `mountDragDrop`: turn drops on the rendered cards and rows into commands. */
export function createDragActions(ctx) {
  return {
    canNestGroup: () => ctx.snapshot.settings.nestedGroups !== false,
    // A dragged group is collapsed together with everything expanded inside it.
    onStartGroupDrag: (node) => {
      const groupId = node.dataset.groupId;
      if (!ctx.opened.has(groupId)) return;
      const nested = ctx.snapshot.settings.nestedGroups !== false;
      collapseSubtree(ctx.opened, groupId, (id) =>
        nested ? ctx.viewIndex.groups.get(id)?.parentId : null,
      );
      ctx.tabLists.render();
    },
    onMoveGroup: (node) =>
      ctx.run({
        type: "moveGroup",
        groupId: node.dataset.groupId,
        parentId: node.parentElement.closest(".group")?.dataset.groupId || null,
        beforeId: node.nextElementSibling?.dataset.groupId || null,
      }),
    onDeleteGroup: (node) =>
      ctx.run({ type: "deleteGroup", groupId: node.dataset.groupId }),
    // Groups list tabs of every window; a position is only meaningful inside one window.
    onMoveTab: (row, group) => {
      // Dropped outside a group card (or on "No group"): put the row back.
      if (!group?.dataset.groupId) return ctx.render();
      const tab = ctx.viewIndex.tabs.get(Number(row.dataset.tabId));
      const next = ctx.viewIndex.tabs.get(
        Number(row.nextElementSibling?.dataset.tabId),
      );
      return ctx.run({
        type: "moveTab",
        tabId: Number(row.dataset.tabId),
        groupId: group.dataset.groupId,
        index: !next
          ? -1
          : next.windowId === tab?.windowId
            ? next.index
            : undefined,
      });
    },
  };
}
