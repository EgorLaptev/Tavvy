import { normalizeSettings } from "../../domain/settings.js";
import { findGroup } from "../../domain/group-tree.js";
import {
    DEFAULT_SPACE_ID,
    groupSpaceId,
    spaceIcon,
} from "../../domain/spaces.js";
import { UNLINKED_CONTAINER_PREFIX } from "./containers.js";

/** Builds the view model the popup renders for one window. */
export function createSnapshots(ctx) {
    const { store } = ctx;
    /** Tab order seen from each window, recomputed only when tab order changes. */
    const sortedWindows = new Map();

    /**
     * Groups are shared by all windows, so the popup lists the tabs of every window: the
     * current window first. Global pinned tabs of other windows are not part of any group.
     */
    function sortedTabIds(windowId, records) {
        const groupPinnedTabs = !!store.state.settings?.groupPinnedTabs;
        let sorted = sortedWindows.get(windowId);

        if (
            !sorted ||
            sorted.version !== ctx.scanOrderVersion ||
            sorted.groupPinnedTabs !== groupPinnedTabs
        ) {
            sorted = {
                version: ctx.scanOrderVersion,
                groupPinnedTabs,
                ids: records
                    .filter(
                        (tab) =>
                            tab.windowId === windowId ||
                            !tab.pinned ||
                            groupPinnedTabs,
                    )
                    .sort(
                        (a, b) =>
                            (b.windowId === windowId) -
                                (a.windowId === windowId) ||
                            a.windowId - b.windowId ||
                            a.index - b.index,
                    )
                    .map((tab) => tab.id),
            };
            sortedWindows.set(windowId, sorted);
        }

        return sorted.ids;
    }

    function snapshotSpaces(identities, permission) {
        const linked = store.state.spaces.map(
            ({ id, name, icon, cookieStoreId }) => {
                const identity = identities.find(
                    (item) => item.cookieStoreId === cookieStoreId,
                );

                return {
                    id,
                    name: identity?.name || name,
                    icon: spaceIcon(identity?.icon || icon),
                    ...(permission && !identity ? { unavailable: true } : {}),
                };
            },
        );
        const unlinked = identities
            .filter(
                (item) =>
                    !store.state.spaces.some(
                        (space) => space.cookieStoreId === item.cookieStoreId,
                    ),
            )
            .map((item) => ({
                id: UNLINKED_CONTAINER_PREFIX + item.cookieStoreId,
                name: item.name,
                icon: spaceIcon(item.icon),
                firefoxContainer: true,
            }));

        return [{ id: DEFAULT_SPACE_ID, name: "" }, ...linked, ...unlinked];
    }

    async function snapshot(windowId) {
        const identities = await ctx.listContainers();
        const permission = await ctx.hasPermission();
        const records = await ctx.scan();
        const tabs = sortedTabIds(windowId, records)
            .map((id) => ctx.recordById(id))
            .filter(Boolean);
        const activeGroupId = await ctx.activeGroupId(windowId);
        const activeGroup = activeGroupId
            ? findGroup(store.state.groups, activeGroupId)
            : null;
        const activeSpaceId =
            (await ctx.emptySpaceId(windowId)) || groupSpaceId(activeGroup);

        await ctx.syncToolbar(windowId, activeGroup);

        return {
            revision: ctx.revision,
            groups: store.state.groups,
            tabs,
            activeGroupId,
            activeSpaceId,
            spacePermission: permission,
            spaces: snapshotSpaces(identities, permission),
            settings: normalizeSettings(store.state.settings),
            importReport: store.state.importReport,
        };
    }

    return {
        snapshot,
        forgetWindow: (windowId) => sortedWindows.delete(windowId),
    };
}
