import { groupMarker } from "../domain/group-marker.js";
import { element, icon, button } from "./dom.js";
import { draftMarkerColor } from "./state/labels.js";
import { t } from "../locales/index.js";

/**
 * The "New group" button and the draft card that replaces it while a title is typed.
 * `nodes` are appended after the top-level groups on every render.
 */
export function createNewGroupForm(ctx) {
    const create = button(
        t("groups.create_group"),
        "create create-group",
        document.createTextNode(t("groups.new_group_action")),
        () => {
            create.hidden = true;
            form.hidden = false;
            const shape = groupMarker("new-group");
            draftMarker.style.borderRadius = shape.borderRadius;
            draftMarker.style.rotate = `${shape.rotation}deg`;
            draftMarker.style.background = draftMarkerColor(
                ctx.snapshot.groups.length,
            );
            input.focus();
            form.scrollIntoView?.({ block: "nearest" });
        },
    );
    const form = element("form", "new-group-form");
    form.hidden = true;
    const draftControls = element("div", "group-controls");
    const draftHeader = element("div", "group-header");
    const draftMarker = element("span", "marker");
    const input = element("input");
    input.placeholder = t("groups.group_name");
    input.maxLength = 100;
    input.setAttribute("aria-label", t("groups.group_name"));
    draftHeader.append(draftMarker, input);
    const draftToggle = element("div", "group-toggle");
    draftToggle.setAttribute("aria-hidden", "true");
    draftToggle.append(
        element("span", "count", "0"),
        icon("m6 4 4 4-4 4", "arrow"),
    );
    draftControls.append(draftHeader, draftToggle);
    form.append(draftControls);
    function cancelDraft() {
        input.value = "";
        form.hidden = true;
        create.hidden = false;
    }
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (input.value.trim())
            ctx.run({ type: "createGroup", title: input.value }).then(() => {
                cancelDraft();
            });
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            cancelDraft();
            create.focus();
        }
    });

    return {
        nodes: [form, create],
        translate() {
            create.textContent = t("groups.new_group_action");
            create.setAttribute("aria-label", t("groups.create_group"));
            input.placeholder = t("groups.group_name");
            input.setAttribute("aria-label", t("groups.group_name"));
        },
    };
}
