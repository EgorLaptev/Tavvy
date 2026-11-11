// Tab rows use HTML drag events; a drop on a group card moves the tab into that group.
let draggedTab = null,
    tabDropHandled = false;

/** Lets a group card accept a dragged tab row. */
export function bindGroupDropTarget(group, { onMoveTab } = {}) {
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

        // Without a handler (static markup) the DOM is updated in place.
        const destination = group.querySelector(":scope > .tabs .tabs-inner");

        destination.querySelector(".empty")?.remove();
        destination.append(draggedTab);

        if (source !== group) {
            const from = source.querySelector(
                ":scope > .group-controls .count",
            );
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
}

/** Animates the rows displaced when the dragged row moves before `beforeNode`. */
function moveDraggedRow(parent, beforeNode) {
    const previousParent = draggedTab.parentElement;
    const rows = [...new Set([previousParent, parent])].flatMap((container) =>
        [...container.querySelectorAll(":scope > .tab-row")].filter(
            (item) => item !== draggedTab,
        ),
    );
    const before = new Map(
        rows.map((item) => [item, item.getBoundingClientRect().top]),
    );

    for (const item of rows) {
        item.getAnimations?.()
            .filter((animation) => animation.id === "tab-drag-shift")
            .forEach((animation) => animation.cancel());
    }

    parent.insertBefore(draggedTab, beforeNode);

    if (previousParent !== parent) {
        for (const container of new Set([previousParent, parent])) {
            const tabs = container.closest(".tabs");

            if (tabs && !tabs.classList.contains("is-closed"))
                tabs.style.height = `${container.scrollHeight}px`;
        }
    }

    if (document.documentElement.classList.contains("animations-off")) return;

    for (const item of rows) {
        const delta = before.get(item) - item.getBoundingClientRect().top;

        if (delta && item.animate)
            item.animate(
                [
                    { transform: `translateY(${delta}px)` },
                    { transform: "translateY(0)" },
                ],
                { id: "tab-drag-shift", duration: 180, easing: "ease-out" },
            );
    }
}

/** Makes a tab row draggable. Dropping outside a group still reports the row's new position. */
export function bindTabRow(row, { onMoveTab } = {}) {
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
            event.clientY >
            row.getBoundingClientRect().top + row.offsetHeight / 2;
        const parent = row.parentElement;
        const beforeNode = after ? row.nextSibling : row;

        if (
            beforeNode === draggedTab ||
            (draggedTab.parentElement === parent &&
                draggedTab.nextSibling === beforeNode)
        )
            return;
        moveDraggedRow(parent, beforeNode);
    });
}

export function disposeTabDrag() {
    draggedTab = null;
    document
        .querySelectorAll(".drop-target")
        .forEach((el) => el.classList.remove("drop-target"));
}
