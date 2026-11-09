import { INBOX_ID, hasGroup } from "../../domain/group-tree.js";
import { WINDOW_ACTIVE_GROUP, WINDOW_EMPTY_SPACE, windowSpaceGroupKey } from "./keys.js";
import { groupsInSpace } from "../../domain/spaces.js";

/** Per-window selection stored in Firefox session values (survives restarts). */
export function createWindowState({ api, store }) {
  async function activeGroupId(windowId) {
    const value = await api.sessions.getWindowValue(windowId, WINDOW_ACTIVE_GROUP);
    return hasGroup(store.state.groups, value) ? value : INBOX_ID;
  }

  async function setActiveGroupId(windowId, groupId) {
    await api.sessions.setWindowValue(windowId, WINDOW_ACTIVE_GROUP, groupId);
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

  return { activeGroupId, setActiveGroupId, emptySpaceId, setEmptySpaceId, lastGroupInSpace, rememberGroupInSpace };
}
