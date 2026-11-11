/** Snapshots without `viewVersion` (older backgrounds) always need a new index. */
export function snapshotChanged(previous, next) {
  return next.viewVersion !== undefined
    ? next.viewVersion !== previous.viewVersion
    : true;
}
export function buildViewIndex(snapshot) {
  const groups = new Map(snapshot.groups.map((group) => [group.id, group]));
  const tabs = new Map(),
    byGroup = new Map(),
    titles = new Map();
  for (const tab of snapshot.tabs) {
    tabs.set(tab.id, tab);
    titles.set(tab.id, tab.title.toLocaleLowerCase());
    if (!byGroup.has(tab.groupId)) byGroup.set(tab.groupId, []);
    byGroup.get(tab.groupId).push(tab);
  }
  // Propagate status bits from leaves to roots once, including collapsed groups.
  const groupStatus = new Map(snapshot.groups.map((group) => [group.id, 0]));
  const children = new Map(snapshot.groups.map((group) => [group.id, 0]));
  for (const group of snapshot.groups)
    if (children.has(group.parentId))
      children.set(group.parentId, children.get(group.parentId) + 1);
  for (const tab of snapshot.tabs) {
    const bits =
      (tab.audible && !tab.muted ? 1 : 0) |
      (tab.sharingState?.screen ? 2 : 0) |
      (tab.sharingState?.microphone ? 4 : 0);
    if (bits && groupStatus.has(tab.groupId))
      groupStatus.set(tab.groupId, groupStatus.get(tab.groupId) | bits);
  }
  const pending = snapshot.groups
    .filter((group) => !children.get(group.id))
    .map((group) => group.id);
  for (let i = 0; i < pending.length; i++) {
    const id = pending[i],
      parent = groups.get(id)?.parentId;
    if (!children.has(parent)) continue;
    groupStatus.set(parent, groupStatus.get(parent) | groupStatus.get(id));
    children.set(parent, children.get(parent) - 1);
    if (!children.get(parent)) pending.push(parent);
  }
  const groupTitles = new Map(
    snapshot.groups.map((group) => [group.id, group.title.toLocaleLowerCase()]),
  );
  return {
    groups,
    tabs,
    byGroup,
    groupStatus,
    search(query) {
      const matchedGroups = new Set(),
        matchedTabs = new Set();
      if (query) {
        for (const [id, title] of groupTitles)
          if (title.includes(query)) matchedGroups.add(id);
        for (const [id, title] of titles)
          if (title.includes(query)) matchedTabs.add(id);
      }
      const matching = new Set(matchedGroups);
      for (const id of matchedTabs) matching.add(tabs.get(id).groupId);
      const filtering = Boolean(query && matching.size);
      const visible = filtering ? new Set(matching) : new Set(groups.keys());
      for (const id of snapshot.settings?.nestedGroups === false
        ? []
        : [...visible]) {
        let parent = groups.get(id)?.parentId;
        const visited = new Set();
        while (parent && !visited.has(parent)) {
          visited.add(parent);
          visible.add(parent);
          parent = groups.get(parent)?.parentId;
        }
      }
      return {
        filtering,
        visible,
        rows(groupId) {
          const rows = byGroup.get(groupId) || [];
          return !filtering || matchedGroups.has(groupId)
            ? rows
            : rows.filter((tab) => matchedTabs.has(tab.id));
        },
      };
    },
  };
}
export function windowRange(
  count,
  offset,
  viewport,
  rowHeight = 30,
  overscan = 8,
) {
  if (count <= 120) return { start: 0, end: count };
  const start = Math.max(
    0,
    Math.min(count, Math.floor(Math.max(0, offset) / rowHeight) - overscan),
  );
  const end = Math.min(
    count,
    Math.max(
      start,
      Math.ceil((Math.max(0, offset) + Math.max(1, viewport)) / rowHeight) +
        overscan,
    ),
  );
  return { start, end };
}
/** Fixed row height assumed by virtualization; styles must keep `.tab-row` at this height. */
export const TAB_ROW_HEIGHT = 30;

/**
 * The visible slice of a group's rows and the spacer heights above and below it.
 * Groups up to 120 rows are rendered whole (see `windowRange`).
 */
export function virtualSlice(
  count,
  offset,
  viewport,
  rowHeight = TAB_ROW_HEIGHT,
) {
  const { start, end } = windowRange(count, offset, viewport, rowHeight);
  return {
    start,
    end,
    before: start * rowHeight,
    after: (count - end) * rowHeight,
  };
}
