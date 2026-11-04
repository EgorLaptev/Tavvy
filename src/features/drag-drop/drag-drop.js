const boundGroups = new WeakSet(),
  boundHeaders = new WeakSet(),
  boundRows = new WeakSet();
let draggedTab = null,
  tabDropHandled = false,
  groupDrag = null,
  suppressGroupClick = false;
function groupAtPoint(x, y) {
  const hit = document.elementFromPoint(x, y);
  // A placeholder inside .subgroups belongs to its parent in the DOM, but
  // is empty space, just like a placeholder in the top-level list.
  return hit?.closest(".group-placeholder") ? null : hit?.closest(".group");
}
export function mountDragDrop({ onMoveGroup, onDeleteGroup, onMoveTab, onStartGroupDrag, canNestGroup } = {}) {
  document.querySelectorAll(".group").forEach((group) => {
    if (boundGroups.has(group)) return;
    boundGroups.add(group);
    group.addEventListener("dragover", (event) => {
      if (!draggedTab) return;
      event.preventDefault();
      event.stopPropagation();
      group.classList.add("drop-target");
    });
    group.addEventListener("dragleave", (event) => {
      if (!group.contains(event.relatedTarget))
        group.classList.remove("drop-target");
    });
    group.addEventListener("drop", (event) => {
      if (!draggedTab) return;
      event.preventDefault();
      event.stopPropagation();
      group.classList.remove("drop-target");
      const source = draggedTab.closest(".group");
      if (onMoveTab) {
        tabDropHandled = true;
        onMoveTab(draggedTab, group);
        return;
      }
      const destination = group.querySelector(":scope > .tabs .tabs-inner");
      destination.querySelector(".empty")?.remove();
      destination.append(draggedTab);
      if (source !== group) {
        const from = source.querySelector(":scope > .group-controls .count");
        const to = group.querySelector(":scope > .group-controls .count");
        from.textContent = Math.max(0, Number(from.textContent) - 1);
        to.textContent = Number(to.textContent) + 1;
      }
      [source, group].forEach((item) => {
        const tabs = item.querySelector(":scope > .tabs");
        if (!tabs.classList.contains("is-closed"))
          tabs.style.height =
            tabs.querySelector(".tabs-inner").scrollHeight + "px";
      });
    });
  });

  // Pointer-based dragging keeps the lifted card under the cursor and shows its destination.

  document.querySelectorAll(".group-header").forEach((header) => {
    if (boundHeaders.has(header)) return;
    boundHeaders.add(header);
    header.draggable = false;
    header.addEventListener(
      "click",
      (event) => {
        if (suppressGroupClick) {
          event.stopImmediatePropagation();
          event.preventDefault();
        }
      },
      true,
    );
    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const group = header.closest(".group");
      groupDrag = {
        group,
        header,
        x: event.clientX,
        y: event.clientY,
        active: false,
      };
      header.setPointerCapture(event.pointerId);
    });
    function movePointer(event, forceReorder = false) {
      if (!groupDrag || groupDrag.header !== header) return;
      const d = groupDrag;
      if (
        !d.active &&
        Math.hypot(event.clientX - d.x, event.clientY - d.y) > 6
      ) {
        d.active = true;
        onStartGroupDrag?.(d.group);
        const rect = d.group.getBoundingClientRect();
        d.offsetX = d.x - rect.left;
        d.offsetY = d.y - rect.top;
        d.placeholder = document.createElement("div");
        d.placeholder.className = "group-placeholder";
        d.placeholder.style.height = d.group.querySelector(":scope > .group-controls").getBoundingClientRect().height + "px";
        d.group.before(d.placeholder);
        d.ghost = d.group
          .querySelector(":scope > .group-controls")
          .cloneNode(true);
        d.ghost.classList.add("group-drag-ghost");
        d.ghost.style.width = rect.width + "px";
        document.body.append(d.ghost);
        d.group.classList.add("group-drag-source");
        document.body.classList.add("group-dragging");
        document.querySelector(".group-trash").classList.add("visible");
      }
      if (!d.active) return;
      d.ghost.style.transform = `translate3d(${event.clientX - d.offsetX}px, ${event.clientY - d.offsetY}px, 0) rotate(1deg)`;
      const trash = document.querySelector(".group-trash");
      const trashRect = trash.getBoundingClientRect();
      const overTrash =
        event.clientX >= trashRect.left &&
        event.clientX <= trashRect.right &&
        event.clientY >= trashRect.top &&
        event.clientY <= trashRect.bottom;
      if (overTrash && !d.trashTimer) {
        trash.classList.add("holding");
        d.trashTimer = setTimeout(() => {
          d.trashReady = true;
          trash.classList.add("ready");
        }, 500);
      } else if (!overTrash && d.trashTimer) {
        clearTimeout(d.trashTimer);
        d.trashTimer = null;
        d.trashReady = false;
        trash.classList.remove("holding", "ready");
      }
      if (overTrash) {
        clearTimeout(d.nestTimer);
        d.nestTimer = null;
        d.nestCandidate = null;
        document
          .querySelectorAll(".group-nest-target")
          .forEach((el) => el.classList.remove("group-nest-target"));
        d.nest = null;
        return;
      }
      const target = groupAtPoint(event.clientX, event.clientY);
      if (
        !target ||
        target === d.group ||
        d.group.contains(target) ||
        target.classList.contains("group-drag-source")
      ) {
        clearTimeout(d.nestTimer);
        d.nestTimer = null;
        d.nestCandidate = null;
        d.nest?.classList.remove("group-nest-target");
        d.nest = null;
        return;
      }
      const headerRect = target
        .querySelector(":scope > .group-controls")
        .getBoundingClientRect();
      const nearEdge =
        event.clientY < headerRect.top + 8 || event.clientY > headerRect.bottom - 8;
      // Hold over the middle of any header to nest; its vertical edges reorder.
      const canNest = !nearEdge && (canNestGroup?.() ?? true);
      if (d.nestCandidate !== target || !canNest) {
        clearTimeout(d.nestTimer);
        d.nestTimer = null;
        d.nestCandidate = null;
      }
      if (d.nest && (d.nest !== target || !canNest)) {
        d.nest.classList.remove("group-nest-target");
        d.nest = null;
      }
      if (canNest && d.nest !== target && !d.nestTimer && !forceReorder) {
        d.nestCandidate = target;
        d.nestTimer = setTimeout(() => {
          d.nestTimer = null;
          const latest = d.latest;
          if (groupDrag !== d || !latest ||
              groupAtPoint(latest.clientX, latest.clientY) !== target) return;
          d.nest = target;
          target.classList.add("group-nest-target");
        }, 225);
      }
      if (canNest && d.nest !== target && !forceReorder) {
        // Keep the hovered group still while deciding between nesting and reordering.
        return;
      }
      if (canNest && d.nest === target) {
        target.classList.add("group-nest-target");
      } else {
        const midpoint = headerRect.top + headerRect.height / 2;
        const neighbors = [...target.parentElement.children].filter(
          (el) => el !== d.group && (el === d.placeholder || el.classList.contains("group")),
        );
        const placeholderIndex = neighbors.indexOf(d.placeholder);
        const targetIndex = neighbors.indexOf(target);
        const hysteresis = Math.min(8, headerRect.height / 4);
        const threshold = placeholderIndex >= 0 && placeholderIndex === targetIndex - 1
          ? midpoint + hysteresis
          : placeholderIndex >= 0 && placeholderIndex === targetIndex + 1
            ? midpoint - hysteresis
            : midpoint;
        const after = event.clientY > threshold;
        const parent = target.parentElement,
          beforeNode = after ? target.nextSibling : target;
        if (
          beforeNode !== d.placeholder &&
          (d.placeholder.parentElement !== parent ||
            d.placeholder.nextSibling !== beforeNode)
        ) {
          // A nested list can change the positions of groups outside either
          // immediate parent, so measure every visible group in the panel.
          const before = new Map();
          for (const el of document.querySelectorAll(".groups .group")) {
            if (el === d.group || d.group.contains(el)) continue;
            const rect = el.getBoundingClientRect();
            if (rect.height) before.set(el, rect.top);
          }
          const siblings = [...before.keys()];
          for (const el of siblings) {
            el.getAnimations?.().filter((animation) => animation.id === "group-drag-shift")
              .forEach((animation) => animation.cancel());
          }
          target.parentElement.insertBefore(
            d.placeholder,
            after ? target.nextSibling : target,
          );
          const shifts = new Map(siblings.map((el) => [el, before.get(el) - el.getBoundingClientRect().top]));
          siblings.forEach((el) => {
            // A nested group already moves with its animated ancestor.
            let ancestor = el.parentElement.closest(".group");
            while (ancestor && !shifts.has(ancestor)) ancestor = ancestor.parentElement.closest(".group");
            const delta = shifts.get(el) - (shifts.get(ancestor) || 0);
            if (delta)
              el.animate(
                [
                  { transform: `translateY(${delta}px)` },
                  { transform: "translateY(0)" },
                ],
                {
                  id: "group-drag-shift",
                  duration: document.documentElement.classList.contains(
                    "animations-off",
                  )
                    ? 0
                    : 180,
                  easing: "ease-out",
                },
              );
          });
        }
      }
      const scroller = document.querySelector(".groups");
      const bounds = scroller.getBoundingClientRect();
      if (event.clientY < bounds.top + 30) scroller.scrollTop -= 10;
      if (event.clientY > bounds.bottom - 30) scroller.scrollTop += 10;
    }
    header.addEventListener("pointermove", (event) => {
      if (!groupDrag || groupDrag.header !== header) return;
      groupDrag.latest = { clientX: event.clientX, clientY: event.clientY };
      if (groupDrag.frame) return;
      groupDrag.frame = requestAnimationFrame(() => {
        if (!groupDrag || groupDrag.header !== header) return;
        groupDrag.frame = null;
        movePointer(groupDrag.latest);
      });
    });
    function finish(event, cancel = false) {
      if (!groupDrag || groupDrag.header !== header) return;
      if (groupDrag.frame) cancelAnimationFrame(groupDrag.frame);
      if (!cancel && groupDrag.latest && (groupDrag.frame || groupDrag.nestTimer)) {
        movePointer({ clientX: event.clientX, clientY: event.clientY }, true);
      }
      const d = groupDrag;
      groupDrag = null;
      clearTimeout(d.nestTimer);
      if (!d.active) return;
      suppressGroupClick = true;
      setTimeout(() => {
        suppressGroupClick = false;
      }, 0);
      if (!cancel && d.trashReady) {
        clearTimeout(d.trashTimer);
        if (onDeleteGroup) onDeleteGroup(d.group);
        d.group.remove();
        d.placeholder.remove();
        d.ghost.remove();
        document
          .querySelector(".group-trash")
          .classList.remove("visible", "holding", "ready");
        document.body.classList.remove("group-dragging");
        return;
      }
      if (!cancel && d.nest) {
        let children = d.nest.querySelector(":scope > .subgroups");
        if (!children) {
          children = document.createElement("div");
          children.className = "subgroups";
          d.nest.append(children);
        }
        children.append(d.group);
      } else if (!cancel) d.placeholder.before(d.group);
      d.group.classList.remove("group-drag-source");
      d.placeholder.remove();
      document
        .querySelectorAll(".group-nest-target")
        .forEach((el) => el.classList.remove("group-nest-target"));
      clearTimeout(d.trashTimer);
      document
        .querySelector(".group-trash")
        .classList.remove("visible", "holding", "ready");
      document.body.classList.remove("group-dragging");
      if (!cancel && onMoveGroup) onMoveGroup(d.group);
      const end = d.group
        .querySelector(":scope > .group-controls")
        .getBoundingClientRect();
      // A child of a collapsed group has no layout box. Fade toward the
      // visible destination instead of animating to the viewport origin.
      const destination = end.width && end.height
        ? end
        : d.nest?.querySelector(":scope > .group-controls")?.getBoundingClientRect();
      const endTransform = destination?.width && destination?.height
        ? `translate3d(${destination.left}px, ${destination.top}px, 0) rotate(0deg)`
        : d.ghost.style.transform;
      d.ghost
        .animate(
          [
            { transform: d.ghost.style.transform, opacity: 1 },
            {
              transform: endTransform,
              opacity: 0,
            },
          ],
          {
            duration: document.documentElement.classList.contains(
              "animations-off",
            )
              ? 0
              : 180,
            easing: "ease-out",
          },
        )
        .finished.finally(() => d.ghost.remove());
    }
    header.addEventListener("pointerup", finish);
    header.addEventListener("pointercancel", (event) => finish(event, true));
    header.addEventListener("lostpointercapture", (event) =>
      finish(event, true),
    );
  });
  document.querySelectorAll(".tab-row").forEach((row) => {
    if (boundRows.has(row)) return;
    boundRows.add(row);
    row.draggable = true;
    row.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      draggedTab = row;
      tabDropHandled = false;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "tab");
      requestAnimationFrame(() => row.classList.add("dragging"));
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      if (onMoveTab && !tabDropHandled) onMoveTab(row, row.closest(".group"));
      draggedTab = null;
      document
        .querySelectorAll(".drop-target")
        .forEach((el) => el.classList.remove("drop-target"));
    });
    row.addEventListener("dragover", (event) => {
      if (!draggedTab || draggedTab === row) return;
      event.preventDefault();
      event.stopPropagation();
      const after =
        event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
      const parent = row.parentElement;
      const beforeNode = after ? row.nextSibling : row;
      if (beforeNode === draggedTab || (draggedTab.parentElement === parent && draggedTab.nextSibling === beforeNode)) return;
      const previousParent = draggedTab.parentElement;
      const rows = [...new Set([previousParent, parent])].flatMap((container) =>
        [...container.querySelectorAll(":scope > .tab-row")].filter((item) => item !== draggedTab),
      );
      const before = new Map(rows.map((item) => [item, item.getBoundingClientRect().top]));
      for (const item of rows) {
        item.getAnimations?.().filter((animation) => animation.id === "tab-drag-shift")
          .forEach((animation) => animation.cancel());
      }
      parent.insertBefore(draggedTab, beforeNode);
      if (previousParent !== parent) {
        for (const container of new Set([previousParent, parent])) {
          const tabs = container.closest(".tabs");
          if (tabs && !tabs.classList.contains("is-closed")) tabs.style.height = `${container.scrollHeight}px`;
        }
      }
      if (document.documentElement.classList.contains("animations-off")) return;
      for (const item of rows) {
        const delta = before.get(item) - item.getBoundingClientRect().top;
        if (delta && item.animate) item.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
          { id: "tab-drag-shift", duration: 180, easing: "ease-out" },
        );
      }
    });
  });
}

export function disposeDragState() {
  if (groupDrag) {
    clearTimeout(groupDrag.trashTimer);
    clearTimeout(groupDrag.nestTimer);
    cancelAnimationFrame(groupDrag.frame);
    groupDrag.ghost?.remove();
    groupDrag.placeholder?.remove();
    groupDrag.group?.classList.remove("group-drag-source");
  }
  groupDrag = null;
  draggedTab = null;
  document.body.classList.remove("group-dragging");
}
