const layouts = new WeakMap();

export function animatePanelChange(change) {
    const panel = document.querySelector(".popup");
    const previous = layouts.get(panel);

    if (previous) {
        clearTimeout(previous.timer);
        cancelAnimationFrame(previous.frame);
    }

    const disabled =
        document.documentElement.classList.contains("animations-off");

    if (disabled) {
        change();
        layouts.delete(panel);

        return;
    }

    const bounds = panel.getBoundingClientRect();
    const visibleNodes = () =>
        [...panel.querySelectorAll(".group,.tab-row")]
            .flatMap((node) => {
                const rect = node.getBoundingClientRect();

                return rect.height &&
                    rect.bottom >= bounds.top &&
                    rect.top <= bounds.bottom
                    ? [[node, rect]]
                    : [];
            })
            .slice(0, 100);
    const height = bounds.height;
    const before = visibleNodes();
    const nodes = before.map(([node]) => node),
        positions = new Map(before);

    for (const node of nodes)
        node.getAnimations?.()
            .filter(
                (animation) =>
                    animation.id === "layout-shift" ||
                    animation.id === "group-drag-shift",
            )
            .forEach((animation) => animation.cancel());
    change();
    panel.style.transition = "none";
    panel.style.height = "";

    const target = panel.getBoundingClientRect().height;

    if (disabled) {
        panel.style.transition = "";
        layouts.delete(panel);

        return;
    }

    const after = visibleNodes();
    const updatedNodes = after.map(([node]) => node),
        targets = new Map(after);

    for (const node of updatedNodes) {
        const old = positions.get(node);
        const rect = targets.get(node);

        if (!node.getClientRects().length) continue;

        if (!old) {
            if (node.animate)
                node.animate([{ opacity: 0 }, { opacity: 1 }], {
                    duration: 160,
                    easing: "ease-out",
                });
            continue;
        }

        const delta = old.top - rect.top;
        // Nested rows move with their group, so only animate their independent shift.
        const parent = node.parentElement.closest(".group");
        const parentOld = positions.get(parent);
        const parentDelta =
            parentOld && targets.has(parent)
                ? parentOld.top - targets.get(parent).top
                : 0;
        const shift = delta - parentDelta;

        if (Math.abs(shift) > 0.5 && node.animate) {
            node.getAnimations()
                .filter((animation) => animation.id === "layout-shift")
                .forEach((animation) => animation.cancel());
            node.animate(
                [
                    { transform: `translateY(${shift}px)` },
                    { transform: "translateY(0)" },
                ],
                {
                    id: "layout-shift",
                    duration: 220,
                    easing: "cubic-bezier(.2,.7,.2,1)",
                },
            );
        }
    }

    if (document.documentElement.classList.contains("extension-mode")) {
        panel.style.height = "";
        panel.style.transition = "";
        layouts.delete(panel);

        return;
    }

    if (Math.abs(target - height) < 0.5) {
        panel.style.transition = "";
        layouts.delete(panel);

        return;
    }

    panel.style.height = height + "px";
    void panel.offsetHeight;
    panel.style.transition = "";

    const state = {};

    state.frame = requestAnimationFrame(() => {
        panel.style.height = target + "px";
        state.timer = setTimeout(() => {
            if (layouts.get(panel) === state) {
                panel.style.height = "";
                layouts.delete(panel);
            }
        }, 270);
    });
    layouts.set(panel, state);
}
