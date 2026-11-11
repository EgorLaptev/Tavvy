import { groupMarker, markerLetters } from "../../domain/group-marker.js";
import { GROUP_COLOR_PRESETS } from "../../domain/colors.js";
import { element, button, clampToViewport } from "../dom.js";
import { t } from "../../locales/index.js";

/** The colour swatch popover (`.group-color-palette`) opened from a group's colour button. */
export function createColorPalette(ctx) {
    const palette = element("div", "group-color-palette");

    palette.hidden = true;
    palette.setAttribute("role", "group");
    palette.setAttribute("aria-label", t("groups.choose_group_color"));
    document.querySelector(".popup").append(palette);

    let anchor = null;

    function close(restoreFocus = false) {
        palette.hidden = true;
        anchor?.setAttribute("aria-expanded", "false");
        if (restoreFocus) anchor?.focus();
        anchor = null;
    }

    function onPointerDown(event) {
        if (
            !palette.hidden &&
            !palette.contains(event.target) &&
            event.target !== anchor
        )
            close();
    }

    function onKeyDown(event) {
        if (event.key === "Escape" && !palette.hidden) {
            event.preventDefault();
            event.stopImmediatePropagation();
            close(true);
        }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    function show(nextAnchor, label, iconMode = false) {
        anchor = nextAnchor;
        nextAnchor.setAttribute("aria-expanded", "true");
        palette.setAttribute("aria-label", label);
        palette.classList.toggle("space-icon-palette", iconMode);
        palette.hidden = false;

        const anchorRect = nextAnchor.getBoundingClientRect();
        const paletteRect = palette.getBoundingClientRect();

        palette.style.left = `${clampToViewport(anchorRect.left, paletteRect.width, window.innerWidth, 4)}px`;
        palette.style.top = `${clampToViewport(anchorRect.bottom + 4, paletteRect.height, window.innerHeight, 4)}px`;
        palette.querySelector('[aria-pressed="true"]')?.focus();
    }

    /** Opens the swatches for `groupId` below `colorButton`, or closes them when already open there. */
    function toggle(colorButton, groupId) {
        if (anchor === colorButton) {
            close();

            return;
        }

        close();
        palette.replaceChildren();

        const group = ctx.viewIndex.groups.get(groupId);
        const markerShape = groupMarker(groupId);

        palette.style.setProperty("--swatch-radius", markerShape.borderRadius);
        palette.style.setProperty(
            "--swatch-rotation",
            `${markerShape.rotation}deg`,
        );
        palette.style.setProperty(
            "--swatch-label",
            JSON.stringify(markerLetters(group?.title)),
        );
        palette.style.setProperty(
            "--swatch-label2",
            JSON.stringify(markerLetters(group?.title, 2)),
        );

        const selected = group?.color?.toLowerCase();

        for (const [name, color] of GROUP_COLOR_PRESETS) {
            const swatch = button(
                t(name),
                "group-color-swatch",
                document.createTextNode(""),
                () => {
                    close(true);
                    ctx.run({ type: "setGroupColor", groupId, color });
                },
            );

            swatch.style.setProperty("--swatch-color", color);
            swatch.setAttribute("aria-label", t(name));
            swatch.dataset.color = color;
            swatch.setAttribute("aria-pressed", String(selected === color));
            palette.append(swatch);
        }

        show(colorButton, t("groups.choose_group_color"));
    }

    return {
        toggle,
        close,
        translate: () =>
            palette.setAttribute("aria-label", t("groups.choose_group_color")),
        dispose() {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        },
    };
}
