import { resolveSelection } from "../../domain/tab-assignment.js";
import { TAB_GROUP } from "./keys.js";

/**
 * Brings Tavvy in line with changes made outside the popup (tabs opened, activated,
 * closed or moved in Firefox): updates each window's active group and tab visibility.
 */
export function createReconciler(ctx) {
    const { api, browserApi, store, index } = ctx;
    let refreshPending;
    let observedVersion = -1;
    const pendingRemovals = new Map();
    let removing;

    async function windowShowing(groupId, exceptWindowId, records) {
        for (const windowId of new Set(records.map((tab) => tab.windowId)))
            if (
                windowId !== exceptWindowId &&
                (await ctx.storedGroupId(windowId)) === groupId
            )
                return windowId;
    }

    async function reconcileWindow(windowId, records) {
        const selectedTab = records.find(
            (tab) => tab.windowId === windowId && tab.active && !tab.pinned,
        );
        const storedGroupId = await ctx.storedGroupId(windowId);
        const currentGroupId =
            storedGroupId !== undefined
                ? storedGroupId
                : await ctx.activeGroupId(windowId);
        const decision = resolveSelection({
            currentGroupId,
            visibleGroups: ctx.visibleGroups(currentGroupId),
            selectedTab,
        });

        if (decision.moveTabTo) {
            await api.sessions.setTabValue(
                selectedTab.id,
                TAB_GROUP,
                decision.moveTabTo,
            );
            records = await ctx.scan();
        }

        // A group is never shown in two windows: a tab of a group shown elsewhere (e.g. reopened
        // in that group's container) goes to that window, and this window keeps its group.
        if (decision.groupId && decision.groupId !== currentGroupId) {
            const shownIn = await windowShowing(
                decision.groupId,
                windowId,
                records,
            );

            if (shownIn !== undefined) {
                await ctx.bringTabs(shownIn, [selectedTab]);
                await ctx.activate(shownIn, decision.groupId, selectedTab.id);
                await api.windows
                    .update(shownIn, { focused: true })
                    .catch(() => {});

                return true;
            }
        }

        // Remember a switch the user made in Firefox (not the first group of a brand-new window).
        await ctx.setActiveGroupId(
            windowId,
            decision.groupId,
            storedGroupId !== undefined && decision.groupId !== storedGroupId,
        );
        await ctx.applyVisibility(windowId, decision.groupId, records);
        await ctx.toolbar
            ?.update(
                windowId,
                decision.groupId ? ctx.group(decision.groupId) : null,
            )
            .catch(console.error);
    }

    /**
     * A tab was dragged into another window: it joins the group shown there. In a window
     * without a group, including a window created by tearing the tab off, it loses its group
     * (as in Simple Tab Groups), so a group is never shown in two windows.
     * Tabs that Tavvy moves itself keep their group.
     */
    function attached(tabId, windowId) {
        if (ctx.relocatingTabs.delete(tabId)) return Promise.resolve();

        return ctx.queue(async () => {
            const tab = await browserApi.tabs.get(tabId).catch(() => null);

            if (
                !tab ||
                tab.incognito ||
                (tab.pinned && !store.state.settings?.groupPinnedTabs)
            )
                return;

            const windowGroupId = await ctx.storedGroupId(windowId);

            if (!windowGroupId) {
                if (windowGroupId === undefined)
                    await ctx.setActiveGroupId(windowId, null);
                await api.sessions.setTabValue(tabId, TAB_GROUP, null);

                return;
            }

            await api.sessions.setTabValue(tabId, TAB_GROUP, windowGroupId);
        });
    }

    /** Resolves `true` when the UI-visible state changed. */
    function refresh() {
        if (refreshPending) return refreshPending;
        refreshPending = ctx
            .queue(async () => {
                let records = await ctx.scan();

                if (await ctx.restoreClosedTabs(records))
                    records = await ctx.scan();

                await ctx.syncToolbar();

                for (const windowId of new Set(
                    records.map((tab) => tab.windowId),
                )) {
                    // One window failing (e.g. a tab Firefox refuses to hide) must not block the others.
                    const moved = await reconcileWindow(
                        windowId,
                        records,
                    ).catch((error) =>
                        console.error("Tavvy window", windowId, error),
                    );

                    if (moved) records = await ctx.scan();
                }

                store.endFirstRun();

                const changed = index.version !== observedVersion;

                if (changed) ctx.bumpRevision();
                observedVersion = index.version;
                await store.save();

                return changed;
            })
            .finally(() => {
                refreshPending = null;
            });

        return refreshPending;
    }

    /**
     * Records closed tabs in batches; one storage write per burst of closures. Grouped tabs
     * closed with their window are kept for `restoreClosedTabs`.
     */
    function removed(tabId, isWindowClosing) {
        index.mark({ type: "removed", tabId });
        pendingRemovals.set(tabId, isWindowClosing);
        if (removing) return removing;
        removing = ctx
            .queue(async () => {
                while (pendingRemovals.size) {
                    const batch = [...pendingRemovals];

                    pendingRemovals.clear();

                    let kept = false;

                    for (const [id, closing] of batch) {
                        if (closing && (await ctx.keepClosedTab(id)))
                            kept = true;

                        store.forget(id);
                        index.forgetRemoved(id);
                    }

                    ctx.bumpRevision();
                    await store.save(
                        kept ? ctx.closedTabsChanges() : undefined,
                    );
                }
            })
            .finally(() => {
                removing = null;
            });

        return removing;
    }

    return {
        refresh,
        removed,
        attached,
        /** Marks the current tab index as seen by the UI (after a command). */
        markObserved: () => {
            observedVersion = index.version;
        },
    };
}
