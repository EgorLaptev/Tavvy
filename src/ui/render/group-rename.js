import { element } from "../dom.js";
import { groupTitle } from "../state/labels.js";
import { t } from "../../locales/index.js";

/**
 * Inline title editor laid over a group's title. Enter or blur saves, Escape cancels;
 * an unchanged or empty title sends nothing.
 */
export function startGroupRename(ctx, view, groupId) {
    const { controls, title } = view;

    if (controls.querySelector(".group-rename-input")) return;

    const field = element("input", "group-rename-input");
    const original = groupTitle(ctx.viewIndex.groups.get(groupId), t);

    field.value = original;
    field.maxLength = 100;
    field.setAttribute("aria-label", t("groups.rename_group"));

    const bounds = controls.getBoundingClientRect();
    const labelBounds = title.getBoundingClientRect();

    field.style.left = `${labelBounds.left - bounds.left}px`;
    field.style.width = `${labelBounds.width}px`;
    title.style.visibility = "hidden";
    controls.append(field);

    let finished = false;

    function finish(save) {
        if (finished) return;
        finished = true;

        const next = field.value.trim();

        field.remove();
        title.style.visibility = "";
        if (save && next && next !== original)
            ctx.run({ type: "renameGroup", groupId, title: next });
    }

    field.addEventListener("click", (e) => e.stopPropagation());
    field.addEventListener("pointerdown", (e) => e.stopPropagation());
    field.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
        }

        if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
        }
    });
    field.addEventListener("blur", () => finish(true));
    field.focus();
    field.select();
}
