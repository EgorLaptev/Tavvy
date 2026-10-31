import { normalizeSettings } from "./settings.js";

export function parseTavvyBackup(data) {
  if (!data || data.format !== "tavvy-backup" || data.version !== 1 || !Array.isArray(data.groups) || !Array.isArray(data.tabs) || !Array.isArray(data.archive) || data.groups.length > 1000 || data.tabs.length > 10000 || data.archive.length > 200)
    throw new Error("Повреждённый или неподдерживаемый бэкап Tavvy");
  const ids = new Set();
  const groups = data.groups.map((g) => {
    if (!g || typeof g.id !== "string" || !g.id || ids.has(g.id) || typeof g.title !== "string" || !g.title.trim() || typeof g.color !== "string" || !/^(#[\da-f]{3,8}|hsla?\([\d.,%\s]+\)|rgba?\([\d.,%\s]+\))$/i.test(g.color))
      throw new Error("Повреждены данные группы");
    ids.add(g.id);
    return { id: g.id, title: g.title.slice(0, 120), color: g.color, parentId: g.parentId ?? null };
  });
  const map = new Map(groups.map((g) => [g.id, g]));
  for (const g of groups) {
    const seen = new Set([g.id]);
    let parent = g.parentId;
    while (parent !== null) {
      if (!map.has(parent) || seen.has(parent)) throw new Error("Повреждена вложенность групп");
      seen.add(parent);
      parent = map.get(parent).parentId;
    }
  }
  const safe = /^(https?:\/\/|file:\/\/|about:blank$|about:newtab$)/i;
  function entry(t) {
    if (!t || typeof t.url !== "string" || !safe.test(t.url) || !ids.has(t.groupId)) throw new Error("Повреждены данные вкладки");
    return { groupId: t.groupId, url: t.url, title: typeof t.title === "string" ? t.title.slice(0, 1000) : t.url, pinned: t.pinned === true, closedAt: Number.isFinite(t.closedAt) ? t.closedAt : Date.now() };
  }
  return { groups, tabs: data.tabs.map(entry), archive: data.archive.map(entry), settings: normalizeSettings(data.settings) };
}
