import { tabMoveTargets } from "./menu-model.js";
import { groupTitle } from "../state/labels.js";
import { t } from "../../locales/index.js";

/** Context menu of a tab row. */
export function createTabMenu(ctx) {
    const { menu } = ctx;

    function open(event, tabId) {
        event.preventDefault();
        event.stopPropagation();
        menu.reset();

        const current = ctx.snapshot.tabs.find((item) => item.id === tabId);

        if (!current) return;

        const run = ctx.run;

        menu.addAction(t("tabs.actions.open"), () =>
            run({ type: "activateTab", tabId }),
        );
        menu.addAction(t("tabs.actions.reload"), () =>
            run({ type: "reloadTab", tabId }),
        );
        if (current.audible || current.muted)
            menu.addAction(
                t(current.muted ? "tabs.actions.unmute" : "tabs.actions.mute"),
                () => run({ type: "toggleTabMute", tabId }),
            );
        if (current.pinned || current.managedPinned)
            menu.addAction(t("tabs.actions.unpin"), () =>
                run({ type: "unpinTab", tabId }),
            );
        else
            menu.addAction(t("tabs.actions.pin"), () =>
                run({ type: "pinTab", tabId }),
            );

        const destinations = tabMoveTargets(ctx.snapshot.groups, current).map(
            (item) => ({
                label: groupTitle(item, t),
                group: item,
                action: () =>
                    run({
                        type: "moveTab",
                        tabId,
                        groupId: item.id,
                        keepActiveGroup: true,
                    }),
            }),
        );

        menu.addSubmenu(
            t("groups.move_tab_to_group"),
            current.pinned && !ctx.snapshot.settings.groupPinnedTabs
                ? []
                : destinations,
            "tab-context-move",
        );
        menu.addAction(
            t("tabs.close_tab"),
            () => run({ type: "closeTab", tabId }),
            false,
            "group-context-delete",
        );
        menu.openAt(event);
    }

    return { open };
}
