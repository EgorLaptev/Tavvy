/**
 * Which destinations the group, tab and container menus offer. `groups` is the snapshot's
 * ordered group list and `index` a Map of group ID → group. No DOM access.
 */

/** Number of ancestors of a group; cycles stop the walk. */
export function groupDepth(group, index) {
    let depth = 0;
    const seen = new Set();

    while (group?.parentId && !seen.has(group.id)) {
        seen.add(group.id);
        group = index.get(group.parentId);
        depth++;
    }

    return depth;
}

/**
 * Groups that can become the new parent of `groupId`: on the same level, not the group itself
 * or one of its descendants, and not its current parent.
 */
export function groupMoveTargets(groups, index, groupId) {
    const current = index.get(groupId);
    const level = groupDepth(current, index);

    return groups.filter((candidate) => {
        if (groupDepth(candidate, index) !== level) return false;

        const seen = new Set();

        for (
            let item = candidate;
            item && !seen.has(item.id);
            item = item.parentId ? index.get(item.parentId) : null
        ) {
            if (item.id === groupId) return false;
            seen.add(item.id);
        }

        return candidate.id !== current.parentId;
    });
}

/** Groups a tab can move to: any other group that uses the same container. */
export function tabMoveTargets(groups, index, tab) {
    const space = index.get(tab.groupId)?.spaceId || "default";

    return groups.filter(
        (item) =>
            item.id !== tab.groupId && (item.spaceId || "default") === space,
    );
}

/**
 * Container choices for a group: every available container, and when the group's own
 * container is missing, that container plus one reconnect option per Firefox container.
 */
export function containerChoices(spaces, group) {
    const current = group.spaceId || "default";
    const destinations = spaces
        .filter((space) => !space.unavailable)
        .map((space) => ({ space, current: space.id === current }));
    const missing =
        spaces.find((space) => space.id === current && space.unavailable) ||
        null;
    const reconnect = missing
        ? spaces.filter((space) => space.firefoxContainer)
        : [];

    return { current, destinations, missing, reconnect };
}
