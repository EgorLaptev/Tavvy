import { INBOX_ID, hasGroup } from "../../domain/group-tree.js";
import {
  NO_GROUP,
  TAB_GROUP,
  WINDOW_ACTIVE_GROUP,
  WINDOW_EMPTY_SPACE,
  windowSpaceGroupKey,
} from "./keys.js";
import { groupsInSpace } from "../../domain/spaces.js";

/**
 * Per-window selection stored in Firefox session values (survives restarts). A window shows
 * one group or no group at all; `null` stands for "no group" throughout the workspace.
 */
export function createWindowState({ api, store }) {
  /** The window's stored group: an existing group ID, `null` for no group, `undefined` if undecided. */
  async function storedGroupId(windowId) {
    const value = await api.sessions.getWindowValue(
      windowId,
      WINDOW_ACTIVE_GROUP,
    );
    if (value === NO_GROUP) return null;
    return hasGroup(store.state.groups, value) ? value : undefined;
  }

  /**
   * A window without a stored group (an existing window after an upgrade) shows the group of
   * its selected tab; a brand-new window (Ctrl+N, a launch from another app) shows no group,
   * except the windows already open when Tavvy is installed, which join the default group.
   */
  async function activeGroupId(windowId) {
    const stored = await storedGroupId(windowId);
    if (stored !== undefined) return stored;
    const tabs = await api.tabs.query({ windowId });
    const selected = tabs.find((tab) => tab.active && !tab.pinned);
    const tagged =
      selected &&
      (await api.sessions
        .getTabValue(selected.id, TAB_GROUP)
        .catch(() => null));
    const groupId = hasGroup(store.state.groups, tagged)
      ? tagged
      : store.firstRun
        ? INBOX_ID
        : null;
    // Decide once: later tag changes in this window must not silently change its group.
    if (tabs.length)
      await api.sessions
        .setWindowValue(windowId, WINDOW_ACTIVE_GROUP, groupId ?? NO_GROUP)
        .catch(() => {});
    return groupId;
  }

  /** `groupId` is `null` for no group. `selectedByUser` marks a real switch. */
  async function setActiveGroupId(windowId, groupId, selectedByUser = false) {
    await api.sessions.setWindowValue(
      windowId,
      WINDOW_ACTIVE_GROUP,
      groupId ?? NO_GROUP,
    );
    if (selectedByUser && groupId) await store.setLastActiveGroupId(groupId);
  }

  /** A space selected in this window that has no groups yet. */
  async function emptySpaceId(windowId) {
    const value = await api.sessions.getWindowValue(
      windowId,
      WINDOW_EMPTY_SPACE,
    );
    return store.state.spaces.some((item) => item.id === value) &&
      !groupsInSpace(store.state.groups, value).length
      ? value
      : null;
  }

  const setEmptySpaceId = (windowId, spaceId) =>
    api.sessions.setWindowValue(windowId, WINDOW_EMPTY_SPACE, spaceId);
  const lastGroupInSpace = (windowId, spaceId) =>
    api.sessions.getWindowValue(windowId, windowSpaceGroupKey(spaceId));
  const rememberGroupInSpace = async (windowId, spaceId, groupId) => {
    if (groupId)
      await api.sessions.setWindowValue(
        windowId,
        windowSpaceGroupKey(spaceId),
        groupId,
      );
  };

  return {
    activeGroupId,
    storedGroupId,
    setActiveGroupId,
    emptySpaceId,
    setEmptySpaceId,
    lastGroupInSpace,
    rememberGroupInSpace,
  };
}
