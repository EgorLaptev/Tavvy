import { findGroup } from "../../domain/group-tree.js";
import { groupSpaceId } from "../../domain/spaces.js";
import { isBlankUrl } from "../../domain/urls.js";
import { TAB_GROUP } from "./keys.js";

/** Switching a window to a group: choose and focus a tab, then hide everything else. */
export function createActivation(ctx) {
  const { api, store, index } = ctx;
  /** Tabs Tavvy itself moves between windows; `attached` must not regroup them. */
  const relocatingTabs = new Set();
  const groupPinned = () => !!store.state.settings?.groupPinnedTabs;
  /** Tabs that belong to a group (global pinned tabs stay in their window). */
  const ownedTabs = (records, groupId) =>
    records
      .filter(
        (tab) => tab.groupId === groupId && (!tab.pinned || groupPinned()),
      )
      .sort((a, b) => a.windowId - b.windowId || a.index - b.index);

  /** Creates an inactive tab in the group's container and tags it (`null`: a tab without a group). */
  async function createTabInGroup(windowId, groupId, options = {}) {
    const tab = await api.tabs.create({
      windowId,
      active: false,
      ...options,
      ...(groupId
        ? await ctx.tabOptionsForGroup(findGroup(store.state.groups, groupId))
        : {}),
    });
    await api.sessions.setTabValue(tab.id, TAB_GROUP, groupId);
    return tab;
  }

  /**
   * Shows `groupId` in a window (`null`: no group). Like Simple Tab Groups, a window leaving
   * "no group" hides its tabs without a group, but closes a lone empty tab.
   */
  async function activate(windowId, groupId, preferredTabId) {
    const group = groupId ? findGroup(store.state.groups, groupId) : null;
    await ctx.setEmptySpaceId(windowId, null);
    const previousGroupId = await ctx.activeGroupId(windowId);
    const groupPinned = !!store.state.settings?.groupPinnedTabs;
    const records = (await ctx.scan()).filter(
      (tab) => tab.windowId === windowId,
    );
    const tabs = records.filter(
      (tab) => tab.groupId === groupId && (!tab.pinned || groupPinned),
    );
    const ungrouped = records.filter(
      (tab) => tab.groupId === null && !tab.pinned,
    );
    const leftover =
      previousGroupId === null &&
      groupId &&
      ungrouped.length === 1 &&
      isBlankUrl(ungrouped[0].url)
        ? ungrouped[0]
        : null;
    const target =
      tabs.find((tab) => tab.id === preferredTabId) ||
      tabs.find((tab) => tab.active) ||
      tabs[0] ||
      (await createTabInGroup(windowId, groupId));
    // Show and focus the destination before hiding anything, so the window never empties.
    await api.tabs.show([
      ...new Set([...tabs.map((tab) => tab.id), target.id]),
    ]);
    await api.tabs.update(target.id, { active: true });
    await ctx.setActiveGroupId(windowId, groupId, true);
    await ctx.rememberGroupInSpace(windowId, groupSpaceId(group), groupId);
    if (leftover && leftover.id !== target.id)
      await ctx.closeTab(leftover.id).catch(() => {});
    await ctx.applyVisibility(windowId, groupId);
    if (
      store.state.settings?.discardInactiveTabs &&
      previousGroupId !== groupId
    )
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
        const currentGroup = await api.sessions.getTabValue(
          candidate.id,
          TAB_GROUP,
        );
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

  /** A window whose selected tab is about to leave first selects a tab of its own group. */
  async function releaseSelected(tabs, exceptWindowId) {
    for (const source of new Set(tabs.map((tab) => tab.windowId)))
      if (
        source !== exceptWindowId &&
        tabs.some((tab) => tab.windowId === source && tab.active)
      )
        await activate(source, await ctx.activeGroupId(source));
  }

  /** Moves tabs into `windowId` in their current order. */
  async function bringTabs(windowId, tabs) {
    const ids = tabs
      .filter((tab) => tab.windowId !== windowId)
      .map((tab) => tab.id);
    if (!ids.length) return;
    await releaseSelected(tabs, windowId);
    for (const id of ids) relocatingTabs.add(id);
    await api.tabs.move(ids, { windowId, index: -1 });
  }

  /**
   * Prepares a group the user picked in `windowId`. Groups are shared by all windows: a group
   * shown only in another window is shown there, otherwise its tabs are gathered from the
   * windows where they are hidden. Resolves to the window that should show the group.
   */
  async function gatherGroup(windowId, groupId, preferredTabId) {
    findGroup(store.state.groups, groupId);
    const records = await ctx.scan();
    const owned = ownedTabs(records, groupId);
    const elsewhere = owned.filter((tab) => tab.windowId !== windowId);
    const showing = [];
    for (const other of new Set(elsewhere.map((tab) => tab.windowId)))
      if ((await ctx.activeGroupId(other)) === groupId) showing.push(other);
    const preferred = records.find((tab) => tab.id === preferredTabId);
    if (showing.includes(preferred?.windowId)) return preferred.windowId;
    if (showing.length && !owned.some((tab) => tab.windowId === windowId))
      return showing[0];
    await bringTabs(
      windowId,
      elsewhere.filter((tab) => !showing.includes(tab.windowId)),
    );
    return windowId;
  }

  /** Shows a group the user picked, focusing another window when it is shown there. */
  async function switchTo(windowId, groupId, preferredTabId) {
    const target = await gatherGroup(windowId, groupId, preferredTabId);
    await activate(target, groupId, preferredTabId);
    if (target !== windowId)
      await api.windows.update(target, { focused: true });
  }

  /**
   * Moves all tabs of a group into a new window that shows only this group. Windows that
   * showed the group are left without a group.
   */
  async function openInNewWindow(windowId, groupId) {
    findGroup(store.state.groups, groupId);
    const records = await ctx.scan();
    const selectedId = ownedTabs(records, groupId).find(
      (tab) => tab.active,
    )?.id;
    for (const other of new Set(records.map((tab) => tab.windowId)))
      if ((await ctx.activeGroupId(other)) === groupId)
        await activate(other, null);
    let tabs = ownedTabs(await ctx.scan(), groupId);
    // An empty group gets a tab first, so the window starts from a tab already in the group.
    if (!tabs.length)
      tabs = [{ ...(await createTabInGroup(windowId, groupId)), windowId }];
    const [first, ...rest] = tabs;
    await releaseSelected(tabs);
    // The new window must not start with a hidden tab.
    await api.tabs.show([first.id]);
    relocatingTabs.add(first.id);
    const created = await api.windows.create({ tabId: first.id });
    await ctx.setActiveGroupId(created.id, groupId, true);
    index.mark({ type: "window", windowId: first.windowId });
    index.mark({ type: "window", windowId: created.id });
    await bringTabs(created.id, rest);
    await activate(created.id, groupId, selectedId);
  }

  return {
    activate,
    createTabInGroup,
    bringTabs,
    gatherGroup,
    switchTo,
    openInNewWindow,
    relocatingTabs,
  };
}
