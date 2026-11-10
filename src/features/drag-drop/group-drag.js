import { dragStarted, insideRect, nearHeaderEdge, reorderThreshold } from "./geometry.js";

// Pointer-based dragging keeps the lifted card under the cursor and shows its destination.
let groupDrag = null,
  suppressGroupClick = false;

function groupAtPoint(x, y) {
  const hit = document.elementFromPoint(x, y);
  // A placeholder inside .subgroups belongs to its parent in the DOM, but
  // is empty space, just like a placeholder in the top-level list.
  return hit?.closest(".group-placeholder") ? null : hit?.closest(".group:not(.ungrouped)");
}

const animationDuration = () =>
  document.documentElement.classList.contains("animations-off") ? 0 : 180;

function clearNesting(d) {
  clearTimeout(d.nestTimer);
  d.nestTimer = null;
  d.nestCandidate = null;
}

function lift(d, onStartGroupDrag) {
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

/** Holding over the trash for 500 ms arms deletion. Returns whether the pointer is over it. */
function trackTrash(d, point) {
  const trash = document.querySelector(".group-trash");
  const overTrash = insideRect(point, trash.getBoundingClientRect());
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
  return overTrash;
}

/** Moves the placeholder before or after `target` and animates the groups it displaces. */
function placeBeside(d, target, headerRect, clientY) {
  const neighbors = [...target.parentElement.children].filter(
    (el) => el !== d.group && (el === d.placeholder || el.classList.contains("group")),
  );
  const threshold = reorderThreshold(headerRect, neighbors.indexOf(d.placeholder), neighbors.indexOf(target));
  const after = clientY > threshold;
  const parent = target.parentElement,
    beforeNode = after ? target.nextSibling : target;
  if (
    beforeNode === d.placeholder ||
    (d.placeholder.parentElement === parent &&
      d.placeholder.nextSibling === beforeNode)
  )
    return;
  // A nested list can change the positions of groups outside either
  // immediate parent, so measure every visible group in the panel.
  const before = new Map();
  for (const el of document.querySelectorAll(".groups .group:not(.ungrouped)")) {
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
          duration: animationDuration(),
          easing: "ease-out",
        },
      );
  });
}

function clearDropUi(d) {
  clearTimeout(d.trashTimer);
  document
    .querySelector(".group-trash")
    .classList.remove("visible", "holding", "ready");
  document.body.classList.remove("group-dragging");
}

/** Makes a group header draggable: reorder, nest by holding over a header, or delete over the trash. */
export function bindGroupHeader(header, { onMoveGroup, onDeleteGroup, onStartGroupDrag, canNestGroup } = {}) {
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
    // Only real group cards can be dragged; the new-group draft also has a header but no card,
    // and pointer capture would break text selection in its input.
    if (!group || event.target.closest?.("input, textarea")) return;
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
    if (!d.active && dragStarted(d, event)) lift(d, onStartGroupDrag);
    if (!d.active) return;
    d.ghost.style.transform = `translate3d(${event.clientX - d.offsetX}px, ${event.clientY - d.offsetY}px, 0) rotate(1deg)`;
    if (trackTrash(d, event)) {
      clearNesting(d);
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
      clearNesting(d);
      d.nest?.classList.remove("group-nest-target");
      d.nest = null;
      return;
    }
    const headerRect = target
      .querySelector(":scope > .group-controls")
      .getBoundingClientRect();
    // Hold over the middle of any header to nest; its vertical edges reorder.
    const canNest = !nearHeaderEdge(event.clientY, headerRect) && (canNestGroup?.() ?? true);
    if (d.nestCandidate !== target || !canNest) clearNesting(d);
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
    } else placeBeside(d, target, headerRect, event.clientY);
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
      clearDropUi(d);
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
    clearDropUi(d);
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
          duration: animationDuration(),
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
}

/** Removes the ghost, placeholder and highlights of an unfinished group drag. */
export function disposeGroupDrag() {
  if (groupDrag) {
    clearTimeout(groupDrag.trashTimer);
    clearTimeout(groupDrag.nestTimer);
    cancelAnimationFrame(groupDrag.frame);
    groupDrag.ghost?.remove();
    groupDrag.placeholder?.remove();
    groupDrag.group?.classList.remove("group-drag-source");
  }
  groupDrag = null;
  document.querySelectorAll(".group-nest-target").forEach((node) => node.classList.remove("group-nest-target"));
  document.querySelector(".group-trash")?.classList.remove("visible", "holding", "ready");
  document.body.classList.remove("group-dragging");
}
