import { findGroup, hasGroup } from "../../domain/group-tree.js";
import {
    isBlankUrl,
    needsPlaceholder,
    placeholderUrl,
    readPlaceholder,
} from "../../domain/urls.js";
import { TABS_TO_RESTORE_KEY, TAB_GROUP, TAB_IMPORT_METADATA } from "./keys.js";

/**
 * Tabs saved in an earlier run of the background (a previous Firefox session) wait this long,
 * so Firefox finishes its own session restore before Tavvy checks what is missing.
 */
export const STARTUP_RESTORE_DELAY_MS = 5000;

const key = (groupId, url) => groupId + "\n" + url;

/**
 * Closing a window closes every tab in it, including the hidden tabs of other groups.
 * As in Simple Tab Groups, the grouped tabs of a closed window are kept: they are recreated
 * (unloaded, then hidden) in a remaining window, or at the next start when no window is left.
 * Tabs that Firefox itself restored are not recreated twice.
 */
export function createClosedWindows(ctx) {
    const { api, browserApi, store } = ctx;
    const startedAt = Date.now();
    /** Entries saved by this background run; the rest come from storage. */
    const fresh = new WeakSet();
    let entries;

    async function load() {
        entries ??= (
            (await api.storage.local.get(TABS_TO_RESTORE_KEY))[
                TABS_TO_RESTORE_KEY
            ] || []
        ).filter(
            (entry) =>
                entry &&
                typeof entry.groupId === "string" &&
                typeof entry.url === "string",
        );

        return entries;
    }

    const persist = () =>
        api.storage.local.set({ [TABS_TO_RESTORE_KEY]: entries });

    /** Called for a tab that Firefox closed together with its window, before it is forgotten. */
    async function keepClosedTab(tabId) {
        const tab = store.knownTab(tabId);

        if (!tab?.groupId || isBlankUrl(tab.url)) return false;
        if (tab.pinned && !store.state.settings?.groupPinnedTabs) return false;

        const entry = {
            windowId: tab.windowId,
            groupId: tab.groupId,
            url: tab.url,
            title: tab.title || "",
            faviconUrl: tab.faviconUrl || "",
        };

        fresh.add(entry);
        (await load()).push(entry);

        return true;
    }

    async function targetWindow(records, groupId, windowGroups) {
        for (const [windowId, shown] of windowGroups)
            if (shown === groupId) return windowId;

        const focused = await browserApi.windows
            ?.getLastFocused?.({ windowTypes: ["normal"] })
            .catch(() => null);

        if (
            focused &&
            !focused.incognito &&
            records.some((tab) => tab.windowId === focused.id)
        )
            return focused.id;

        return records[0]?.windowId;
    }

    async function createTab(entry, windowId) {
        const url =
            readPlaceholder(entry.url) || !needsPlaceholder(entry.url)
                ? entry.url
                : placeholderUrl(
                      api.runtime.getURL("local-file.html"),
                      entry.url,
                      entry.title,
                  );
        let container = {};

        try {
            container = await ctx.tabOptionsForGroup(
                findGroup(store.state.groups, entry.groupId),
            );
        } catch {
            // The group's container is gone: keep the tab without it rather than lose it.
        }

        const tab = await api.tabs.create({
            windowId,
            active: false,
            url,
            ...container,
            ...(url.startsWith("about:")
                ? {}
                : { discarded: true, title: entry.title }),
        });

        await api.sessions.setTabValue(tab.id, TAB_GROUP, entry.groupId);
        await api.sessions.setTabValue(tab.id, TAB_IMPORT_METADATA, {
            title: entry.title,
            faviconUrl: entry.faviconUrl,
        });
    }

    /**
     * Recreates the saved tabs whose window is gone. Runs inside the command queue, before
     * windows are reconciled (which hides the recreated tabs of other groups).
     * Resolves `true` when tabs were created.
     */
    async function restoreClosedTabs(records) {
        if (!(await load()).length || !records.length) return false;

        const liveWindows = new Set(records.map((tab) => tab.windowId));
        const settled = Date.now() - startedAt >= STARTUP_RESTORE_DELAY_MS;
        const ready = entries.filter((entry) =>
            fresh.has(entry) ? !liveWindows.has(entry.windowId) : settled,
        );

        if (!ready.length) return false;

        // Tabs already open (e.g. restored by Firefox) count once against saved tabs of the same address.
        const open = new Map();

        for (const tab of records)
            open.set(
                key(tab.groupId, tab.url),
                (open.get(key(tab.groupId, tab.url)) || 0) + 1,
            );

        const windowGroups = new Map();

        for (const windowId of liveWindows)
            windowGroups.set(windowId, await ctx.activeGroupId(windowId));

        let created = false;

        for (const entry of ready) {
            entries.splice(entries.indexOf(entry), 1);
            if (!hasGroup(store.state.groups, entry.groupId)) continue;

            const count = open.get(key(entry.groupId, entry.url)) || 0;

            if (count) {
                open.set(key(entry.groupId, entry.url), count - 1);
                continue;
            }

            try {
                await createTab(
                    entry,
                    await targetWindow(records, entry.groupId, windowGroups),
                );
                created = true;
            } catch (error) {
                console.error(
                    "Tavvy could not restore a tab of a closed window",
                    error,
                );
            }
        }

        await persist();

        return created;
    }

    /** Storage changes holding the tabs kept by `keepClosedTab` (written with the workspace). */
    const closedTabsChanges = () => ({ [TABS_TO_RESTORE_KEY]: entries });

    /** An import replaces all groups: tabs of earlier closed windows must not come back. */
    async function forgetClosedTabs() {
        entries = [];
        await persist();
    }

    return {
        keepClosedTab,
        closedTabsChanges,
        restoreClosedTabs,
        forgetClosedTabs,
    };
}
