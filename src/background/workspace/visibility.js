import { TAB_GROUP_PINNED } from "./keys.js";

/**
 * Shows the tabs of the groups visible for `groupId` in one window and hides the rest.
 * With "group pinned tabs", pinned tabs of hidden groups are unpinned first
 * (Firefox cannot hide pinned tabs) and pinned again when their group returns.
 */
export function createVisibility(ctx) {
  const { api, store } = ctx;
  const groupPinned = () => !!store.state.settings?.groupPinnedTabs;

  async function setManagedPin(tabId, pinned) {
    await api.tabs.update(tabId, { pinned });
    await api.sessions.setTabValue(tabId, TAB_GROUP_PINNED, !pinned);
  }

  async function applyGroupedPins(records, visible) {
    for (const tab of records) {
      if (visible.has(tab.groupId) && tab.managedPinned) {
        if (tab.hidden) await api.tabs.show([tab.id]);
        if (!tab.pinned) await api.tabs.update(tab.id, { pinned: true });
        await api.sessions.setTabValue(tab.id, TAB_GROUP_PINNED, false);
      } else if (!visible.has(tab.groupId) && tab.pinned && !tab.active) {
        await api.sessions.setTabValue(tab.id, TAB_GROUP_PINNED, true);
        await api.tabs.update(tab.id, { pinned: false });
      }
    }
  }

  /** Re-pins grouped pinned tabs that Firefox refused to hide. */
  async function restorePinsAfterFailedHide(records, requested, hiddenIds) {
    if (!groupPinned()) return;
    for (const tab of records.filter(
      (item) =>
        item.managedPinned &&
        requested.includes(item.id) &&
        !hiddenIds?.has(item.id),
    )) {
      if (!hiddenIds) {
        const current = await api.tabs.get(tab.id).catch(() => null);
        if (!current || current.hidden || current.pinned) continue;
      }
      await setManagedPin(tab.id, true);
    }
  }

  async function applyVisibility(windowId, groupId, source) {
    const visible = ctx.visibleGroups(groupId);
    let records = (source || (await ctx.scan())).filter(
      (tab) => tab.windowId === windowId,
    );
    if (groupPinned()) {
      await applyGroupedPins(records, visible);
      records = (await ctx.scan()).filter((tab) => tab.windowId === windowId);
    }
    records = records.filter((tab) => !tab.pinned);
    const show = records
      .filter((tab) => visible.has(tab.groupId) && tab.hidden)
      .map((tab) => tab.id);
    if (show.length) await api.tabs.show(show);
    const hide = records
      .filter((tab) => !visible.has(tab.groupId) && !tab.hidden)
      .map((tab) => tab.id);
    if (!hide.length) return;
    let hidden;
    try {
      hidden = await api.tabs.hide(hide);
    } catch (error) {
      await restorePinsAfterFailedHide(records, hide, null);
      throw error;
    }
    if (hidden.length !== hide.length) {
      await restorePinsAfterFailedHide(records, hide, new Set(hidden));
      throw new Error(
        "Firefox не смог скрыть часть вкладок (например, вкладку с захватом экрана).",
      );
    }
  }

  return { applyVisibility };
}
