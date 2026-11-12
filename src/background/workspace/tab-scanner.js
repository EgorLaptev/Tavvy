import { readPlaceholder } from "../../domain/urls.js";
import { TAB_GROUP, TAB_GROUP_PINNED, TAB_IMPORT_METADATA } from "./keys.js";

const UTILITY_PAGES = ["import.html", "settings.html"];
const KNOWN_FIELDS = [
    "id",
    "windowId",
    "groupId",
    "title",
    "url",
    "faviconUrl",
    "pinned",
];

/**
 * Builds the list of tab records (Firefox tab + Tavvy group) for all normal windows.
 * Results are cached until the tab index or the group list changes.
 */
export function createTabScanner(ctx) {
    const { api, index, store } = ctx;
    let cache,
        stamp,
        orderVersion = 0;
    let byId = new Map();
    /** Tabs being replaced by the new-tab handler; hidden from scans meanwhile. */
    const pendingNewTabs = new Set();

    function isUtilityPage(url) {
        const pages = UTILITY_PAGES.map((name) =>
            api.runtime?.getURL?.(name),
        ).filter(Boolean);

        return pages.some(
            (page) =>
                url === page ||
                url?.startsWith(page + "?") ||
                url?.startsWith(page + "#"),
        );
    }

    /**
     * Group for a tab without a valid tag: the group shown in its window, whatever container
     * the tab uses (as in Simple Tab Groups); `null` in a window without a group.
     */
    async function inferGroup(tab, windowGroups) {
        if (!windowGroups.has(tab.windowId))
            windowGroups.set(tab.windowId, ctx.activeGroupId(tab.windowId));

        return (await windowGroups.get(tab.windowId)) || null;
    }

    async function readRecord(tab, validGroups, windowGroups) {
        if (pendingNewTabs.has(tab.id)) return null;

        if (isUtilityPage(tab.url)) {
            store.forget(tab.id);

            return null;
        }

        let groupId;

        try {
            groupId = await api.sessions.getTabValue(tab.id, TAB_GROUP);
        } catch {
            return null; // A tab can close while Firefox answers a query.
        }

        // A `null` tag marks a tab without a group; it keeps no group in every window.
        if (!validGroups.has(groupId) && groupId !== null) {
            const untagged = groupId === undefined;

            groupId = await inferGroup(tab, windowGroups);

            // A tag naming an unknown group is shown in the current group but never overwritten:
            // if the group list is ever incomplete, tabs must not be reassigned for good.
            if (untagged)
                try {
                    await api.sessions.setTabValue(tab.id, TAB_GROUP, groupId);
                } catch {
                    return null;
                }
        }

        let metadata;

        try {
            metadata = await api.sessions.getTabValue(
                tab.id,
                TAB_IMPORT_METADATA,
            );
        } catch {}

        let managedPinned = false;

        if (store.state.settings?.groupPinnedTabs) {
            try {
                managedPinned =
                    (await api.sessions.getTabValue(
                        tab.id,
                        TAB_GROUP_PINNED,
                    )) === true;
            } catch {
                return null;
            }
        }

        const previous = store.knownTab(tab.id);
        const url = tab.pendingUrl || tab.url || "about:newtab";
        const cachedFavicon =
            tab.discarded && previous?.url === url ? previous.faviconUrl : "";
        const record = {
            id: tab.id,
            windowId: tab.windowId,
            groupId,
            cookieStoreId: tab.cookieStoreId,
            title:
                readPlaceholder(tab.url)?.title ||
                tab.title ||
                metadata?.title ||
                "Новая вкладка",
            url,
            faviconUrl:
                tab.favIconUrl || cachedFavicon || metadata?.faviconUrl || "",
            pinned: tab.pinned,
            managedPinned,
            active: tab.active,
            index: tab.index,
            hidden: tab.hidden,
            audible: tab.audible,
            muted: tab.mutedInfo?.muted === true,
            sharingState: tab.sharingState,
            discarded: tab.discarded,
        };

        store.remember(
            record,
            !previous ||
                KNOWN_FIELDS.some((key) => previous[key] !== record[key]),
        );

        return record;
    }

    async function scan() {
        const tabs = await api.tabs.query({ windowType: "normal" });
        const state = store.state;
        const nextStamp =
            index.version +
            ":" +
            Boolean(state.settings?.groupPinnedTabs) +
            ":" +
            state.groups.map((group) => group.id).join(",");

        if (cache && stamp === nextStamp) return cache;

        const nextOrderVersion = index.orderVersion;
        const validGroups = new Set(state.groups.map((group) => group.id));
        const windowGroups = new Map();
        const records = await Promise.all(
            tabs
                .filter((tab) => !tab.incognito)
                .map((tab) => readRecord(tab, validGroups, windowGroups)),
        );
        const live = index.liveIds();

        for (const key of store.knownIds())
            if (!live.has(Number(key)) && !index.removed.has(Number(key)))
                store.forget(key);
        cache = records.filter(Boolean);
        byId = new Map(cache.map((record) => [record.id, record]));
        stamp = nextStamp;
        orderVersion = nextOrderVersion;

        return cache;
    }

    return {
        scan,
        pendingNewTabs,
        recordById: (tabId) => byId.get(tabId),
        get scanOrderVersion() {
            return orderVersion;
        },
    };
}
