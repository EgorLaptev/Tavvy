/**
 * The group tree as the popup shows it: which groups are expanded and where each card goes.
 * `opened` is a Set of group IDs and `groups` a Map of group ID → group (the view index).
 * These rules do not touch the DOM.
 */

/** A group is reachable when every ancestor is expanded (always, when nesting is off). */
export function expandedPath(group, opened, groups, nested) {
  if (!nested) return true;
  let parent = group.parentId;
  const visited = new Set();
  while (parent && !visited.has(parent)) {
    visited.add(parent);
    if (!opened.has(parent)) return false;
    parent = groups.get(parent)?.parentId;
  }
  return true;
}

/** The group and its ancestors (only the group itself when nesting is off). */
export function pathToGroup(groupId, groups, nested) {
  const path = new Set();
  let current = groupId;
  while (current && !path.has(current)) {
    path.add(current);
    current = nested ? groups.get(current)?.parentId : null;
  }
  return path;
}

/**
 * Removes `groupId` and every expanded group below it from `opened`. `parentOf` decides how
 * the tree is walked, so callers can ignore nesting when it is turned off.
 */
export function collapseSubtree(opened, groupId, parentOf) {
  for (const id of [...opened]) {
    let current = id;
    const visited = new Set();
    while (current && !visited.has(current)) {
      if (current === groupId) {
        opened.delete(id);
        break;
      }
      visited.add(current);
      current = parentOf(current);
    }
  }
}

/**
 * Toggles one group. Closing it also closes everything inside it; opening it closes every
 * expanded group that does not contain it, so only one branch stays open.
 * `contains(outerId, innerId)` reports whether one rendered group is inside another.
 */
export function toggleExpanded(opened, groupId, contains) {
  const closing = opened.has(groupId);
  for (const id of [...opened]) {
    if (closing) {
      if (id === groupId || contains(groupId, id)) opened.delete(id);
    } else if (!contains(id, groupId)) opened.delete(id);
  }
  if (!closing) opened.add(groupId);
}

/**
 * Child group IDs per parent ID (`null` for the top level), in snapshot order. Groups whose
 * parent is missing, and every group when nesting is off, are top-level.
 */
export function groupChildren(groups, index, nested) {
  const children = new Map();
  for (const group of groups) {
    const parent = nested && index.has(group.parentId) ? group.parentId : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(group.id);
  }
  return children;
}
