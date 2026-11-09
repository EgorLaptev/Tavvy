/**
 * Brings Tavvy in line with changes made outside the popup (tabs opened, activated,
 * closed or moved in Firefox): updates each window's active group and tab visibility.
 */
export function createReconciler(ctx) {
  const { store, index } = ctx;
  let refreshPending;
  let observedVersion = -1;
  const pendingRemovals = new Map();
  let removing;

  async function reconcileWindow(windowId, records) {
    const selected = records.find((tab) => tab.windowId === windowId && tab.active && !tab.pinned);
    const previous = await ctx.activeGroupId(windowId);
    // The user selected a tab of a hidden group in Firefox: follow it.
    const groupId = selected && !ctx.visibleGroups(previous).has(selected.groupId) ? selected.groupId : previous;
    await ctx.setActiveGroupId(windowId, groupId);
    await ctx.applyVisibility(windowId, groupId, records);
    await ctx.toolbar?.update(windowId, ctx.group(groupId)).catch(console.error);
  }

  /** Resolves `true` when the UI-visible state changed. */
  function refresh() {
    if (refreshPending) return refreshPending;
    refreshPending = ctx
      .queue(async () => {
        const records = await ctx.scan();
        await ctx.syncToolbar();
        for (const windowId of new Set(records.map((tab) => tab.windowId))) await reconcileWindow(windowId, records);
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
    /** Marks the current tab index as seen by the UI (after a command). */
    markObserved: () => {
      observedVersion = index.version;
    },
  };
}
