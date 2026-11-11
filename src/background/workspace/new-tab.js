import { findGroup } from "../../domain/group-tree.js";
import { DEFAULT_SPACE_ID, groupSpaceId } from "../../domain/spaces.js";
import { isBlankUrl } from "../../domain/urls.js";
import { TAB_GROUP } from "./keys.js";

/** How long to wait for the address of a tab that Firefox opened as about:blank. */
const FIRST_ADDRESS_WAIT_MS = 1500;
const NEW_TAB_PAGE = /^about:(newtab|home)$/i;
const WEB_PAGE = /^https?:/i;

/**
 * A tab Firefox opened on the user's behalf in the window's foreground, not from a page
 * and not in a container: Ctrl+T or the + button, a link from another application, a
 * bookmark. Tavvy's own tabs are always created inactive and are never candidates.
 */
export function isUnclaimedNewTab(tab) {
    return (
        !tab.incognito &&
        !tab.pinned &&
        tab.active &&
        tab.openerTabId == null &&
        tab.cookieStoreId === "firefox-default"
    );
}

/**
 * Firefox opens these tabs without a container. When the window's group uses a container,
 * they are reopened in it:
 * - Ctrl+T (created as about:newtab) is replaced immediately by an empty container tab.
 *   The replacement is created already active and without a URL — only then does Firefox
 *   focus the address bar (activating it later with `tabs.update` leaves focus in the page).
 * - Links from other apps and bookmarks are created as about:blank and receive their
 *   address a few milliseconds later; they are reopened with that address.
 *
 * This runs outside the command queue: the swap must finish within a few frames, before
 * the user starts typing. Tabs restored with Ctrl+Shift+T already carry a group and are
 * left alone.
 */
export function createNewTabHandler(ctx) {
    const { api, browserApi, store, index } = ctx;
    /** Candidate tabs waiting for their first address: tabId → { url, notify }. */
    const watching = new Map();

    function firstAddress(watch) {
        if (watch.url !== "about:blank") return watch.url;

        return new Promise((resolve) => {
            const timer = setTimeout(
                () => resolve(watch.url),
                FIRST_ADDRESS_WAIT_MS,
            );

            watch.notify = () => {
                clearTimeout(timer);
                resolve(watch.url);
            };
        });
    }

    /** Opens `url` (or an empty page) in the group's container in place of `tab`. */
    async function reopenInContainer(tab, groupId, container, url) {
        let replacement;

        try {
            replacement = await browserApi.tabs.create({
                windowId: tab.windowId,
                index: tab.index,
                active: true,
                ...container,
                ...(url ? { url } : {}),
            });
            index.mark({ type: "tab", tabId: replacement.id });
            await api.sessions.setTabValue(replacement.id, TAB_GROUP, groupId);
        } catch (error) {
            if (replacement) await ctx.closeTab(replacement.id).catch(() => {});
            throw error;
        }

        const original = await browserApi.tabs.get(tab.id).catch(() => null);

        // The user may have typed an address into the empty tab while the replacement opened.
        if (
            !url &&
            original &&
            !isBlankUrl(original.pendingUrl || original.url)
        ) {
            await api.tabs.update(tab.id, { active: true }).catch(() => {});
            await ctx.closeTab(replacement.id).catch(() => {});

            return;
        }

        if (original) await ctx.closeTab(tab.id);
    }

    async function handle(tab, watch) {
        await store.ready;
        if (await browserApi.sessions.getTabValue(tab.id, TAB_GROUP)) return;

        const groupId = await ctx.activeGroupId(tab.windowId);

        if (!groupId) return;

        const group = findGroup(store.state.groups, groupId);

        if (groupSpaceId(group) === DEFAULT_SPACE_ID) return;

        const container = await ctx.tabOptionsForGroup(group);
        const url = await firstAddress(watch);

        if (NEW_TAB_PAGE.test(url))
            await reopenInContainer(tab, groupId, container, undefined);
        else if (WEB_PAGE.test(url))
            await reopenInContainer(tab, groupId, container, url);
    }

    function created(tab) {
        if (!isUnclaimedNewTab(tab)) return Promise.resolve();

        const watch = { url: tab.url || "about:blank", notify: null };

        watching.set(tab.id, watch);
        // Hidden from scans until decided, so the tab cannot switch the window's group meanwhile.
        ctx.pendingNewTabs.add(tab.id);

        return handle(tab, watch).finally(() => {
            watching.delete(tab.id);
            ctx.pendingNewTabs.delete(tab.id);
            index.mark({ type: "window", windowId: tab.windowId });
        });
    }

    /** Forwards Firefox's `tabs.onUpdated` URL changes for tabs that are still undecided. */
    function updated(tabId, changes) {
        const watch = watching.get(tabId);

        if (!watch || !changes.url || changes.url === "about:blank") return;
        watch.url = changes.url;
        watch.notify?.();
    }

    return { created, updated };
}
