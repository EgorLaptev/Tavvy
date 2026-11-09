import { chooseGroupForNewTab, resolveSelection } from "../../domain/tab-assignment.js";
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

  async function reconcileWindow(windowId, records) {
    const selectedTab = records.find((tab) => tab.windowId === windowId && tab.active && !tab.pinned);
    const storedGroupId = await ctx.storedGroupId(windowId);
    const currentGroupId = storedGroupId ?? (await ctx.activeGroupId(windowId));
    const decision = resolveSelection({ currentGroupId, visibleGroups: ctx.visibleGroups(currentGroupId), selectedTab });
    if (decision.moveTabTo) {
      await api.sessions.setTabValue(selectedTab.id, TAB_GROUP, decision.moveTabTo);
      records = await ctx.scan();
    }
    // Remember a switch the user made in Firefox (not the first group of a brand-new window).
    await ctx.setActiveGroupId(windowId, decision.groupId, !!storedGroupId && decision.groupId !== storedGroupId);
    await ctx.applyVisibility(windowId, decision.groupId, records);
    await ctx.toolbar?.update(windowId, ctx.group(decision.groupId)).catch(console.error);
  }

  /**
   * A tab was dragged into another window: it joins the group shown there.
   * A window created by tearing a tab off has no group yet and adopts the tab's group instead.
   */
  function attached(tabId, windowId) {
    return ctx.queue(async () => {
      const windowGroupId = await ctx.storedGroupId(windowId);
      if (!windowGroupId) return;
      const tab = await browserApi.tabs.get(tabId).catch(() => null);
      if (!tab || tab.incognito || (tab.pinned && !store.state.settings?.groupPinnedTabs)) return;
      const groupId = chooseGroupForNewTab({
        groups: store.state.groups,
        windowGroupId,
        tabSpaceId: ctx.spaceIdForCookieStore(tab.cookieStoreId),
      });
      await api.sessions.setTabValue(tabId, TAB_GROUP, groupId);
    });
  }

  /** Resolves `true` when the UI-visible state changed. */
  function refresh() {
    if (refreshPending) return refreshPending;
    refreshPending = ctx
      .queue(async () => {
        const records = await ctx.scan();
        await ctx.syncToolbar();
        for (const windowId of new Set(records.map((tab) => tab.windowId))) {
          // One window failing (e.g. a tab Firefox refuses to hide) must not block the others.
          await reconcileWindow(windowId, records).catch((error) => console.error("Tavvy window", windowId, error));
        }
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

  /** Records closed tabs in batches; one storage write per burst of closures. */
  function removed(tabId, isWindowClosing) {
    index.mark({ type: "removed", tabId });
    pendingRemovals.set(tabId, isWindowClosing);
    if (removing) return removing;
    removing = ctx
      .queue(async () => {
        while (pendingRemovals.size) {
          const batch = [...pendingRemovals.keys()];
          pendingRemovals.clear();
          for (const id of batch) {
            store.forget(id);
            index.forgetRemoved(id);
          }
          ctx.bumpRevision();
          await store.save();
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
