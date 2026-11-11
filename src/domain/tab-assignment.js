import { DEFAULT_SPACE_ID, groupSpaceId, groupsInSpace } from "./spaces.js";
import { findGroup } from "./group-tree.js";
import { isInternalPage } from "./urls.js";

/**
 * Group for a tab that has no group yet (a new tab, a link opened from another app,
 * a Firefox page such as about:preferences).
 *
 * The tab joins the group shown in its window. The only exception is a tab the user
 * explicitly opened in another Firefox container: it joins a group of that container.
 * Tabs without a container (including Firefox's own pages, which cannot use one) stay
 * in the current group even if that group uses a container.
 */
export function chooseGroupForNewTab({ groups, windowGroupId, tabSpaceId }) {
  const windowSpaceId = groupSpaceId(findGroup(groups, windowGroupId));
  if (tabSpaceId === windowSpaceId || tabSpaceId === DEFAULT_SPACE_ID)
    return windowGroupId;
  return groupsInSpace(groups, tabSpaceId)[0]?.id || windowGroupId;
}

/**
 * Decides which group a window shows after the user selected `selectedTab` in Firefox.
 * - The tab belongs to a visible group: nothing changes.
 * - It is a Firefox/extension page (Firefox reuses an existing about:preferences or
 *   about:addons tab even when it is hidden in another group): the page is moved into
 *   the current group instead of switching groups.
 * - Otherwise the window follows the tab to its group.
 */
export function resolveSelection({
  currentGroupId,
  visibleGroups,
  selectedTab,
}) {
  if (!selectedTab || visibleGroups.has(selectedTab.groupId))
    return { groupId: currentGroupId };
  if (isInternalPage(selectedTab.url))
    return { groupId: currentGroupId, moveTabTo: currentGroupId };
  return { groupId: selectedTab.groupId };
}
