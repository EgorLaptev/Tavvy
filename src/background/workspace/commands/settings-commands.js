import { normalizeSettings } from "../../../domain/settings.js";
import { TAB_GROUP, TAB_GROUP_PINNED } from "../keys.js";

export function createSettingsCommands(ctx) {
    const { api, store } = ctx;

    /** Pinned tabs become members of the group active in their window. */
    async function startGroupingPinnedTabs() {
        const windows = new Map();

        for (const tab of (await ctx.scan()).filter((item) => item.pinned)) {
            if (!windows.has(tab.windowId))
                windows.set(
                    tab.windowId,
                    await ctx.activeGroupId(tab.windowId),
                );
            await api.sessions.setTabValue(
                tab.id,
                TAB_GROUP,
                windows.get(tab.windowId),
            );
        }
    }

    /** Pinned tabs of hidden groups are shown and pinned again. */
    async function stopGroupingPinnedTabs() {
        for (const tab of (await ctx.scan()).filter(
            (item) => item.managedPinned,
        )) {
            if (tab.hidden) await api.tabs.show([tab.id]);
            if (!tab.pinned) await api.tabs.update(tab.id, { pinned: true });
            await api.sessions.setTabValue(tab.id, TAB_GROUP_PINNED, false);
        }
    }

    async function saveSettings(command) {
        const next = normalizeSettings(command.settings);
        const previous = normalizeSettings(store.state.settings);
        const wasGrouped = !!store.state.settings?.groupPinnedTabs;

        if (!wasGrouped && next.groupPinnedTabs)
            await startGroupingPinnedTabs();
        if (wasGrouped && !next.groupPinnedTabs) await stopGroupingPinnedTabs();
        store.state.settings = next;
        await store.save();

        const visibilityChanged =
            wasGrouped !== next.groupPinnedTabs ||
            previous.nestedGroups !== next.nestedGroups ||
            previous.nestedTabsVisibility !== next.nestedTabsVisibility;

        if (!visibilityChanged) return;

        const records = await ctx.scan();

        for (const windowId of new Set(records.map((tab) => tab.windowId))) {
            const groupId = await ctx.activeGroupId(windowId);
            const selected = records.find(
                (tab) => tab.windowId === windowId && tab.active && !tab.pinned,
            );

            // Never hide the selected tab: re-activate the group so one of its own tabs is selected.
            if (selected && !ctx.visibleGroups(groupId).has(selected.groupId))
                await ctx.activate(windowId, groupId);
            else await ctx.applyVisibility(windowId, groupId);
        }
    }

    return { saveSettings };
}
