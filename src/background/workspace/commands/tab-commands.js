import { findGroup } from "../../../domain/group-tree.js";
import { groupSpaceId } from "../../../domain/spaces.js";
import { TAB_GROUP, TAB_GROUP_PINNED } from "../keys.js";

export function createTabCommands(ctx) {
  const { api, store } = ctx;
  const groupPinned = () => !!store.state.settings?.groupPinnedTabs;

  async function requireTab(tabId, windowId) {
    const tab = (await ctx.scan()).find((item) => item.id === tabId && item.windowId === windowId);
    if (!tab) throw new Error("Вкладка уже закрыта или находится в другом окне");
    return tab;
  }

  async function createTab(command, windowId) {
    findGroup(store.state.groups, command.groupId);
    const tab = await ctx.createTabInGroup(windowId, command.groupId);
    await ctx.activate(windowId, command.groupId, tab.id);
  }

  async function activateTab(command, windowId) {
    const tab = await requireTab(command.tabId, windowId);
    if (tab.pinned && !groupPinned()) await api.tabs.update(tab.id, { active: true });
    else await ctx.activate(windowId, tab.groupId, tab.id);
  }

  async function toggleTabMute(command, windowId) {
    const tab = await requireTab(command.tabId, windowId);
    if (tab.audible || tab.muted) await api.tabs.update(tab.id, { muted: !tab.muted });
  }

  async function reloadTab(command, windowId) {
    const tab = await requireTab(command.tabId, windowId);
    await api.tabs.reload(tab.id);
  }

  async function pinTab(command, windowId) {
    const tab = await requireTab(command.tabId, windowId);
    if (tab.pinned || tab.managedPinned) return;
    // A hidden tab cannot be pinned; remember the intent until its group is shown.
    if (groupPinned() && !ctx.visibleGroups(await ctx.activeGroupId(windowId)).has(tab.groupId)) {
      await api.sessions.setTabValue(tab.id, TAB_GROUP_PINNED, true);
      return;
    }
    if (tab.hidden) await api.tabs.show([tab.id]);
    await api.tabs.update(tab.id, { pinned: true });
  }

  async function unpinTab(command, windowId) {
    const tab = await requireTab(command.tabId, windowId);
    if (tab.managedPinned) {
      await api.sessions.setTabValue(tab.id, TAB_GROUP_PINNED, false);
    } else if (tab.pinned) {
      // A global pinned tab joins the group the user is looking at.
      if (!groupPinned()) await api.sessions.setTabValue(tab.id, TAB_GROUP, await ctx.activeGroupId(windowId));
      await api.tabs.update(tab.id, { pinned: false });
    }
  }

  async function closeTab(command, windowId) {
    const tab = await requireTab(command.tabId, windowId);
    await ctx.closeTab(tab.id);
  }

  async function moveTab(command, windowId) {
    const tab = await requireTab(command.tabId, windowId);
    const destination = findGroup(store.state.groups, command.groupId);
    const expected = ctx.space(groupSpaceId(destination));
    if (
      (expected.cookieStoreId && tab.cookieStoreId !== expected.cookieStoreId) ||
      groupSpaceId(findGroup(store.state.groups, tab.groupId)) !== groupSpaceId(destination)
    )
      throw new Error("Перенос вкладок между пространствами не поддерживается");
    await api.sessions.setTabValue(tab.id, TAB_GROUP, command.groupId);
    if (Number.isInteger(command.index)) await api.tabs.move(tab.id, { index: command.index });
    const currentGroupId = await ctx.activeGroupId(windowId);
    if (!tab.active) return ctx.applyVisibility(windowId, currentGroupId);
    if (command.keepActiveGroup !== true) return ctx.activate(windowId, command.groupId, tab.id);
    // Moved from the context menu: stay in the current group, pick another tab if needed.
    if (ctx.visibleGroups(currentGroupId).has(command.groupId)) await ctx.applyVisibility(windowId, currentGroupId);
    else await ctx.activate(windowId, currentGroupId);
  }

  return { createTab, activateTab, toggleTabMute, reloadTab, pinTab, unpinTab, closeTab, moveTab };
}
