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
  const groupTitles = new Map(
    snapshot.groups.map((group) => [group.id, group.title.toLocaleLowerCase()]),
  );
  return {
    groups,
    tabs,
    byGroup,
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
      for (const id of [...visible]) {
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
