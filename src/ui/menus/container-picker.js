import { element, icon } from "../dom.js";
import { containerChoices } from "./menu-model.js";
import { t } from "../../locales/index.js";

/**
 * The container submenu of a group: asks for the optional `cookies` permission, lists the
 * containers, confirms a move (tabs are reopened) and offers to reconnect a missing container.
 */
export function createContainerPicker(ctx) {
    const { api, menu } = ctx;

    function addBack(trigger, groupId) {
        const back = menu.addAction(
            t("common.back"),
            () => show(groupId, trigger, true),
            false,
            "group-container-back",
            true,
            menu.submenu,
        );
        back.prepend(icon("m10 3-5 5 5 5", "group-context-root-icon"));
    }

    function confirmMove(groupId, destination, trigger) {
        menu.submenu.replaceChildren();
        addBack(trigger, groupId);
        menu.submenu.append(
            element(
                "p",
                "group-container-warning",
                t("groups.move_container_confirm"),
            ),
        );
        menu.addAction(
            t("spaces.confirm_move"),
            () =>
                ctx.run({
                    type: "moveGroupToSpace",
                    groupId,
                    spaceId: destination.id,
                }),
            false,
            "group-container-submit",
            false,
            menu.submenu,
        );
        menu.positionSubmenu(trigger);
    }

    /** Requests the optional permission; only called when the snapshot reports it missing. */
    async function requestPermission() {
        let granted = false;
        try {
            granted = !!(await api.permissions?.request({
                permissions: ["cookies"],
            }));
        } catch {}
        if (!granted) {
            menu.close();
            ctx.status.textContent = t("spaces.permission");
            return false;
        }
        await ctx.run({ type: "snapshot" });
        if (ctx.disposed) return false;
        if (!ctx.snapshot.spacePermission) {
            menu.close();
            ctx.status.textContent = t("spaces.permission");
            return false;
        }
        return true;
    }

    async function show(groupId, trigger, returning = false) {
        // Without an await on the common path the submenu opens within the click.
        if (!ctx.snapshot.spacePermission && !(await requestPermission()))
            return;
        if (!trigger.isConnected) return;
        const group = ctx.viewIndex.groups.get(groupId);
        if (!group) return;
        const { current, destinations, missing, reconnect } = containerChoices(
            ctx.snapshot.spaces,
            group,
        );
        const entries = destinations.map(
            ({ space: destination, current: isCurrent }) => ({
                label:
                    destination.id === "default"
                        ? t("spaces.default")
                        : destination.name,
                space: destination,
                current: isCurrent,
                keepOpen: !isCurrent,
                action: () => {
                    if (destination.id !== current)
                        confirmMove(groupId, destination, trigger);
                },
            }),
        );
        if (missing) {
            entries.push({
                label: `${missing.name} — ${t("spaces.container_unavailable")}`,
                disabled: true,
                action: () => {},
            });
            for (const available of reconnect)
                entries.push({
                    label: `${t("spaces.reconnect_action")}: ${available.name}`,
                    space: available,
                    action: () =>
                        ctx.run({
                            type: "rebindSpace",
                            spaceId: missing.id,
                            cookieStoreId: available.id.slice(
                                "container:".length,
                            ),
                        }),
                });
        }
        if (returning) menu.closeSubmenu();
        menu.showSubmenu(trigger, entries);
    }

    return { show };
}
