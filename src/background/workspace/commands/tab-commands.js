import { findGroup } from "../../../domain/group-tree.js";
import { groupSpaceId } from "../../../domain/spaces.js";
import { TAB_GROUP, TAB_GROUP_PINNED } from "../keys.js";

export function createTabCommands(ctx) {
  const { api, store } = ctx;
  const groupPinned = () => !!store.state.settings?.groupPinnedTabs;

  /** Groups are shared by all windows, so a tab may be in any of them. */
  async function requireTab(tabId) {
    const tab = (await ctx.scan()).find((item) => item.id === tabId);
    if (!tab) throw new Error("Вкладка уже закрыта");
    return tab;
  }

  async function createTab(command, windowId) {
    // The new tab joins the group where it is shown, which may be another window.
    const target = await ctx.gatherGroup(windowId, command.groupId);
    const tab = await ctx.createTabInGroup(target, command.groupId);
    await ctx.activate(target, command.groupId, tab.id);
    if (target !== windowId) await api.windows.update(target, { focused: true });
  }

  async function activateTab(command, windowId) {
    const tab = await requireTab(command.tabId);
    if (tab.pinned && !groupPinned()) {
      await api.tabs.update(tab.id, { active: true });
      if (tab.windowId !== windowId) await api.windows.update(tab.windowId, { focused: true });
    } else if (tab.groupId) await ctx.switchTo(windowId, tab.groupId, tab.id);
    else await openUngroupedTab(tab, windowId);
  }

  /**
   * A tab without a group is shown where it is visible (a window without a group); a hidden
   * one is brought to this window and joins the group shown here.
   */
  async function openUngroupedTab(tab, windowId) {
    if ((await ctx.activeGroupId(tab.windowId)) === null) {
      await ctx.activate(tab.windowId, null, tab.id);
      if (tab.windowId !== windowId) await api.windows.update(tab.windowId, { focused: true });
      return;
    }
    const groupId = await ctx.activeGroupId(windowId);
    if (groupId) await moveTab({ tabId: tab.id, groupId }, windowId);
    if (tab.windowId !== windowId) await ctx.bringTabs(windowId, [tab]);
    await ctx.activate(windowId, groupId, tab.id);
  }

  async function toggleTabMute(command) {
    const tab = await requireTab(command.tabId);
    if (tab.audible || tab.muted) await api.tabs.update(tab.id, { muted: !tab.muted });
  }

  async function reloadTab(command) {
    const tab = await requireTab(command.tabId);
    await api.tabs.reload(tab.id);
  }

  async function pinTab(command) {
    const tab = await requireTab(command.tabId);
    if (tab.pinned || tab.managedPinned) return;
    // A hidden tab cannot be pinned; remember the intent until its group is shown.
    if (groupPinned() && !ctx.visibleGroups(await ctx.activeGroupId(tab.windowId)).has(tab.groupId)) {
      await api.sessions.setTabValue(tab.id, TAB_GROUP_PINNED, true);
      return;
    }
    if (tab.hidden) await api.tabs.show([tab.id]);
    await api.tabs.update(tab.id, { pinned: true });
  }

  async function unpinTab(command) {
    const tab = await requireTab(command.tabId);
    if (tab.managedPinned) {
      await api.sessions.setTabValue(tab.id, TAB_GROUP_PINNED, false);
    } else if (tab.pinned) {
      // A global pinned tab joins the group the user is looking at.
      if (!groupPinned()) await api.sessions.setTabValue(tab.id, TAB_GROUP, await ctx.activeGroupId(tab.windowId));
      await api.tabs.update(tab.id, { pinned: false });
    }
  }

  async function closeTab(command) {
    const tab = await requireTab(command.tabId);
    await ctx.closeTab(tab.id);
  }

  async function moveTab(command, windowId) {
    const tab = await requireTab(command.tabId);
    const destination = findGroup(store.state.groups, command.groupId);
    const expected = ctx.space(groupSpaceId(destination));
    // A tab without a group joins any group of the container it is in.
    const sourceSpaceId = tab.groupId
      ? groupSpaceId(findGroup(store.state.groups, tab.groupId))
      : ctx.spaceIdForCookieStore(tab.cookieStoreId);
    if ((expected.cookieStoreId && tab.cookieStoreId !== expected.cookieStoreId) || sourceSpaceId !== groupSpaceId(destination))
      throw new Error("Перенос вкладок между пространствами не поддерживается");
    await api.sessions.setTabValue(tab.id, TAB_GROUP, command.groupId);
    if (Number.isInteger(command.index)) await api.tabs.move(tab.id, { index: command.index });
    const currentGroupId = await ctx.activeGroupId(tab.windowId);
    if (!tab.active) return ctx.applyVisibility(tab.windowId, currentGroupId);
    if (command.keepActiveGroup !== true) return ctx.switchTo(windowId, command.groupId, tab.id);
    // Moved from the context menu: stay in the current group, pick another tab if needed.
    if (ctx.visibleGroups(currentGroupId).has(command.groupId)) await ctx.applyVisibility(tab.windowId, currentGroupId);
    else await ctx.activate(tab.windowId, currentGroupId);
  }

  return { createTab, activateTab, toggleTabMute, reloadTab, pinTab, unpinTab, closeTab, moveTab };
}
