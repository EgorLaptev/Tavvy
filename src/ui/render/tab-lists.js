import { virtualSlice } from "../view-index.js";
import { element, reorderChildren, dragInProgress } from "../dom.js";
import { expandedPath } from "../state/tree.js";
import { mountDragDrop } from "../../features/drag-drop/drag-drop.js";
import { t } from "../../locales/index.js";

function spacer(height) {
  const node = element("div", "tab-spacer");
  node.style.height = height + "px";
  node.setAttribute("aria-hidden", "true");
  return node;
}

/**
 * Renders the rows of every expanded, reachable group. Large groups are virtualized against
 * the scroll position of `.groups`; scrolling re-renders once per animation frame.
 */
export function createTabLists(ctx) {
  const { container } = ctx;
  let scrollFrame;

  function render() {
    if (ctx.disposed || !ctx.filterResult) return;
    const { snapshot, viewIndex, filterResult, opened, groupViews } = ctx;
    const used = new Set(),
      bounds = container.getBoundingClientRect();
    const nested = snapshot.settings.nestedGroups !== false;
    for (const [id, view] of groupViews)
      view.toggle.setAttribute("aria-expanded", String(opened.has(id)));
    for (const group of snapshot.groups) {
      const view = groupViews.get(group.id),
        isOpen = opened.has(group.id),
        reachable =
          expandedPath(group, opened, viewIndex.groups, nested) &&
          filterResult.visible.has(group.id);
      view.toggle.setAttribute("aria-expanded", String(isOpen));
      view.tabs.classList.toggle("is-closed", !isOpen);
      if (!isOpen || !reachable) {
        view.inner.replaceChildren();
        view.tabs.style.height = "0px";
        continue;
      }
      const rows = filterResult.rows(group.id),
        offset = bounds.top - view.inner.getBoundingClientRect().top;
      const slice = virtualSlice(rows.length, offset, container.clientHeight);
      const desired = [];
      if (slice.start) desired.push(spacer(slice.before));
      for (const tab of rows.slice(slice.start, slice.end)) {
        desired.push(ctx.tabRows.rowFor(tab));
        used.add(tab.id);
      }
      if (slice.end < rows.length) desired.push(spacer(slice.after));
      if (!rows.length) desired.push(element("div", "empty", t("tabs.no_tabs")));
      reorderChildren(view.inner, desired);
      view.tabs.style.height = view.inner.scrollHeight + "px";
    }
    ctx.tabRows.prune(used);
    // Bind drag handling only when cards or rows were created, not on every scroll frame.
    if (ctx.dragTargetsDirty) {
      ctx.dragTargetsDirty = false;
      mountDragDrop(ctx.dragActions);
    }
  }

  function onScroll() {
    if (scrollFrame || dragInProgress()) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      if (dragInProgress()) return;
      render();
    });
  }
  container.addEventListener("scroll", onScroll, { passive: true });

  return {
    render,
    dispose: () => cancelAnimationFrame(scrollFrame),
  };
}
