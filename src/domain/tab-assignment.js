import { isInternalPage } from "./urls.js";

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
