import {
  INBOX_ID,
  assertNoCycle,
  findGroup,
  nextGroupColor,
  normalizeGroupColor,
  normalizeNewTitle,
  normalizeRenamedTitle,
  placeGroup,
  removeGroup,
} from "../../../domain/group-tree.js";
import { DEFAULT_SPACE_ID, groupSpaceId, groupsInSpace } from "../../../domain/spaces.js";
import { TAB_GROUP } from "../keys.js";

export function createGroupCommands(ctx) {
  const { api, store } = ctx;
  const groups = () => store.state.groups;
  const groupPinned = () => !!store.state.settings?.groupPinnedTabs;
  /** Tabs that belong to a group (global pinned tabs are shared, not owned). */
  const ownedTabs = (records, groupId) => records.filter((tab) => tab.groupId === groupId && (!tab.pinned || groupPinned()));

  async function createGroup(command, windowId) {
    const title = normalizeNewTitle(command.title);
    const previouslyEmpty = await ctx.emptySpaceId(windowId);
    const spaceId = command.spaceId || (command.parentId ? groupSpaceId(findGroup(groups(), command.parentId)) : DEFAULT_SPACE_ID);
    ctx.space(spaceId);
    const id = ctx.newId();
    groups().push({
      id,
      title,
      color: nextGroupColor(groups()),
      parentId: command.parentId || null,
      ...(spaceId === DEFAULT_SPACE_ID ? {} : { spaceId }),
    });
    if (previouslyEmpty) await ctx.activate(windowId, id);
  }

  async function reloadGroup(command) {
    findGroup(groups(), command.groupId);
    for (const tab of ownedTabs(await ctx.scan(), command.groupId)) await api.tabs.reload(tab.id);
  }

  async function clearGroup(command) {
    findGroup(groups(), command.groupId);
    const targets = ownedTabs(await ctx.scan(), command.groupId);
    // Keep a tab in every window where the group is selected, so the window stays open.
    for (const windowId of new Set(targets.map((tab) => tab.windowId))) {
      if (!targets.some((tab) => tab.windowId === windowId && tab.active)) continue;
      const replacement = await ctx.createTabInGroup(windowId, command.groupId);
      await api.tabs.update(replacement.id, { active: true });
    }
    for (const tab of targets) await ctx.closeTab(tab.id);
  }

  async function renameGroup(command) {
    const title = normalizeRenamedTitle(command.title);
    const group = findGroup(groups(), command.groupId);
    group.title = title;
    await ctx.toolbar?.updateGroup?.(group).catch(console.error);
  }

  async function setGroupColor(command) {
    const color = normalizeGroupColor(command.color);
    const group = findGroup(groups(), command.groupId);
    group.color = color;
    await ctx.toolbar?.updateGroup?.(group).catch(console.error);
  }

  async function moveGroup(command) {
    const moving = findGroup(groups(), command.groupId);
    const parentId = store.state.settings?.nestedGroups === false ? moving.parentId : command.parentId;
    if (command.beforeId) findGroup(groups(), command.beforeId);
    assertNoCycle(groups(), moving.id, parentId);
    moving.parentId = parentId || null;
    store.state.groups = placeGroup(groups(), moving, command.beforeId);
    await ctx.applyVisibilityToAllWindows();
  }

  async function deleteGroup(command) {
    if (command.groupId === INBOX_ID) throw new Error("Основная группа нужна для несортированных вкладок");
    const deleting = findGroup(groups(), command.groupId);
    const sourceSpaceId = groupSpaceId(deleting);
    const candidates = groupsInSpace(groups(), sourceSpaceId).filter((item) => item.id !== deleting.id);
    const replacement = candidates.find((item) => item.id === INBOX_ID) || candidates[0] || findGroup(groups(), INBOX_ID);
    const records = await ctx.scan();
    const windowGroups = new Map();
    for (const tab of records)
      if (!windowGroups.has(tab.windowId)) windowGroups.set(tab.windowId, await ctx.activeGroupId(tab.windowId));
    const targets = ownedTabs(records, deleting.id);
    if (store.state.settings?.closeTabsOnGroupDelete !== false) {
      // Switch first so closing the last visible tab cannot close the window.
      for (const [windowId, activeId] of windowGroups)
        if (activeId === deleting.id || targets.some((tab) => tab.windowId === windowId && tab.active))
          await ctx.activate(windowId, replacement.id);
      for (const tab of targets) await ctx.closeTab(tab.id);
    } else {
      for (const tab of targets) await api.sessions.setTabValue(tab.id, TAB_GROUP, replacement.id);
    }
    // Global pinned tabs remain open and are no longer associated with the deleted group.
    if (!groupPinned())
      for (const tab of records)
        if (tab.groupId === deleting.id && tab.pinned) await api.sessions.setTabValue(tab.id, TAB_GROUP, replacement.id);
    for (const entry of store.state.archive) if (entry.groupId === deleting.id) entry.groupId = replacement.id;
    store.state.groups = removeGroup(groups(), deleting.id);
    for (const [windowId, activeId] of windowGroups) {
      if (activeId === deleting.id) await ctx.activate(windowId, replacement.id);
      else await ctx.applyVisibility(windowId, activeId);
      if (!candidates.length && activeId === deleting.id) await ctx.setEmptySpaceId(windowId, sourceSpaceId);
    }
  }

  return {
    createGroup,
    reloadGroup,
    clearGroup,
    renameGroup,
    setGroupColor,
    moveGroup,
    deleteGroup,
    activateGroup: (command, windowId) => ctx.activate(windowId, command.groupId),
  };
}
