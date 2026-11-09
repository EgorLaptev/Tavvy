import { INBOX_ID, hasGroup } from "../../domain/group-tree.js";
import { TAB_GROUP, WINDOW_ACTIVE_GROUP, WINDOW_EMPTY_SPACE, windowSpaceGroupKey } from "./keys.js";
import { groupsInSpace } from "../../domain/spaces.js";

/** Per-window selection stored in Firefox session values (survives restarts). */
export function createWindowState({ api, store }) {
  /** The group chosen for windows that have none yet (Ctrl+N, launch without session restore). */
  function defaultGroupId() {
    const last = store.lastActiveGroupId;
    return hasGroup(store.state.groups, last) ? last : INBOX_ID;
  }

  /** The window's stored group, if it still exists. */
  async function storedGroupId(windowId) {
    const value = await api.sessions.getWindowValue(windowId, WINDOW_ACTIVE_GROUP);
    return hasGroup(store.state.groups, value) ? value : null;
  }

  /**
   * A window without a stored group (an existing window after an upgrade, a window torn
   * off from another one) shows the group of its selected tab; a brand-new window gets
   * the group used most recently.
   */
  async function activeGroupId(windowId) {
    const stored = await storedGroupId(windowId);
    if (stored) return stored;
    const tabs = await api.tabs.query({ windowId });
    const selected = tabs.find((tab) => tab.active && !tab.pinned);
    const tagged = selected && (await api.sessions.getTabValue(selected.id, TAB_GROUP).catch(() => null));
    const groupId = hasGroup(store.state.groups, tagged) ? tagged : defaultGroupId();
    // Decide once: later tag changes in this window must not silently change its group.
    if (tabs.length) await api.sessions.setWindowValue(windowId, WINDOW_ACTIVE_GROUP, groupId).catch(() => {});
    return groupId;
  }

  /** `selectedByUser` marks a real switch, remembered as the default for new windows. */
  async function setActiveGroupId(windowId, groupId, selectedByUser = false) {
    await api.sessions.setWindowValue(windowId, WINDOW_ACTIVE_GROUP, groupId);
    if (selectedByUser) await store.setLastActiveGroupId(groupId);
  }

  /** A space selected in this window that has no groups yet. */
  async function emptySpaceId(windowId) {
    const value = await api.sessions.getWindowValue(windowId, WINDOW_EMPTY_SPACE);
    return store.state.spaces.some((item) => item.id === value) && !groupsInSpace(store.state.groups, value).length ? value : null;
  }

  const setEmptySpaceId = (windowId, spaceId) => api.sessions.setWindowValue(windowId, WINDOW_EMPTY_SPACE, spaceId);
  const lastGroupInSpace = (windowId, spaceId) => api.sessions.getWindowValue(windowId, windowSpaceGroupKey(spaceId));
  const rememberGroupInSpace = (windowId, spaceId, groupId) =>
    api.sessions.setWindowValue(windowId, windowSpaceGroupKey(spaceId), groupId);

  return { activeGroupId, storedGroupId, setActiveGroupId, emptySpaceId, setEmptySpaceId, lastGroupInSpace, rememberGroupInSpace };
}
