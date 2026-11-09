import { findGroup } from "../../domain/group-tree.js";
import { groupSpaceId } from "../../domain/spaces.js";
import { TAB_GROUP } from "./keys.js";

/** Switching a window to a group: choose and focus a tab, then hide everything else. */
export function createActivation(ctx) {
  const { api, store } = ctx;

  /** Creates an inactive tab in the group's container and tags it. */
  async function createTabInGroup(windowId, groupId, options = {}) {
    const tab = await api.tabs.create({
      windowId,
      active: false,
      ...options,
      ...(await ctx.tabOptionsForGroup(findGroup(store.state.groups, groupId))),
    });
    await api.sessions.setTabValue(tab.id, TAB_GROUP, groupId);
    return tab;
  }

  async function activate(windowId, groupId, preferredTabId) {
    const group = findGroup(store.state.groups, groupId);
    await ctx.setEmptySpaceId(windowId, null);
    const previousGroupId = await ctx.activeGroupId(windowId);
    const groupPinned = !!store.state.settings?.groupPinnedTabs;
    const tabs = (await ctx.scan()).filter(
      (tab) => tab.windowId === windowId && tab.groupId === groupId && (!tab.pinned || groupPinned),
    );
    const target =
      tabs.find((tab) => tab.id === preferredTabId) ||
      tabs.find((tab) => tab.active) ||
      tabs[0] ||
      (await createTabInGroup(windowId, groupId));
    // Show and focus the destination before hiding anything, so the window never empties.
    await api.tabs.show([...new Set([...tabs.map((tab) => tab.id), target.id])]);
    await api.tabs.update(target.id, { active: true });
    await ctx.setActiveGroupId(windowId, groupId, true);
    await ctx.rememberGroupInSpace(windowId, groupSpaceId(group), groupId);
    await ctx.applyVisibility(windowId, groupId);
    if (store.state.settings?.discardInactiveTabs && previousGroupId !== groupId)
      await discardGroupTabs(windowId, previousGroupId);
  }

  /** Unloads silent background tabs of the group the window just left. */
  async function discardGroupTabs(windowId, groupId) {
    const candidates = (await ctx.scan()).filter(
      (tab) =>
        tab.windowId === windowId &&
        tab.groupId === groupId &&
        tab.hidden &&
        !tab.pinned &&
        !tab.active &&
        tab.audible === false &&
        !tab.discarded,
    );
    for (const candidate of candidates) {
      try {
        // Re-check live state: the tab may have changed while earlier tabs were discarded.
        const current = await api.tabs.get(candidate.id);
        const currentGroup = await api.sessions.getTabValue(candidate.id, TAB_GROUP);
        if (
          currentGroup === groupId &&
          current.hidden &&
          !current.active &&
          !current.pinned &&
          current.audible === false &&
          !current.discarded
        )
          await api.tabs.discard(candidate.id);
      } catch (error) {
        console.warn("Не удалось выгрузить вкладку:", error);
      }
    }
  }

  return { activate, createTabInGroup };
}
