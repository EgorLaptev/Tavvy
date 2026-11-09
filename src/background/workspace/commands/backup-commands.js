import { normalizeSettings } from "../../../domain/settings.js";
import { parseTavvyBackup } from "../../../domain/tavvy-backup.js";
import { parseStgBackup, stgFingerprint } from "../../../domain/stg-import.js";
import { INBOX_ID, defaultInbox, findGroup, hasGroup } from "../../../domain/group-tree.js";
import { DEFAULT_SPACE_ID, spaceIcon } from "../../../domain/spaces.js";
import { BACKUP_SAFE_URL, needsPlaceholder, placeholderUrl, readPlaceholder } from "../../../domain/urls.js";
import { TAB_GROUP, TAB_IMPORT_MARKER, TAB_IMPORT_METADATA } from "../keys.js";

const MAX_ARCHIVE = 200;

/** Backup export, Tavvy backup restore and Simple Tab Groups import. */
export function createBackupCommands(ctx) {
  const { api, store, browserApi } = ctx;

  /** Opens a saved URL; pages an extension cannot open get a placeholder. */
  function restorableUrl(url, title) {
    return needsPlaceholder(url) ? placeholderUrl(api.runtime.getURL("local-file.html"), url, title) : url;
  }

  async function exportBackup() {
    const records = await ctx.scan();
    const state = store.state;
    const serialize = (entry) => ({
      groupId: hasGroup(state.groups, entry.groupId) ? entry.groupId : INBOX_ID,
      title: entry.title,
      url: readPlaceholder(entry.url)?.url ?? entry.url,
      pinned: !!(entry.pinned || entry.managedPinned),
      ...(entry.closedAt ? { closedAt: entry.closedAt } : {}),
    });
    const safe = (entry) => BACKUP_SAFE_URL.test(entry.url);
    const withSpaces = state.spaces.length > 0;
    return {
      format: "tavvy-backup",
      version: withSpaces ? 2 : 1,
      createdAt: new Date().toISOString(),
      groups: structuredClone(state.groups),
      ...(withSpaces
        ? { spaces: state.spaces.map(({ id, name, icon }) => ({ id, name, ...(icon ? { icon: spaceIcon(icon) } : {}) })) }
        : {}),
      tabs: records.map(serialize).filter(safe),
      archive: state.archive.map(serialize).filter(safe),
      settings: normalizeSettings(state.settings),
    };
  }

  /** Maps each backup space to the single unassigned Firefox container with the same name. */
  async function matchBackupSpaces(spaces) {
    const mapping = new Map([[DEFAULT_SPACE_ID, DEFAULT_SPACE_ID]]);
    const restored = [];
    if (!spaces?.length) return { mapping, restored };
    if (!browserApi.contextualIdentities || !(await browserApi.permissions?.contains({ permissions: ["cookies"] })))
      throw new Error("Для восстановления пространств необходимо разрешение на контейнеры Firefox");
    const identities = await browserApi.contextualIdentities.query({});
    const used = new Set();
    for (const item of spaces) {
      const matches = identities.filter((identity) => identity.name === item.name && !used.has(identity.cookieStoreId));
      if (matches.length !== 1)
        throw new Error("Для восстановления пространства нужен один существующий контейнер Firefox с тем же именем");
      used.add(matches[0].cookieStoreId);
      const spaceId = ctx.newId();
      restored.push({ id: spaceId, name: item.name, cookieStoreId: matches[0].cookieStoreId, ...(item.icon ? { icon: item.icon } : {}) });
      mapping.set(item.id, spaceId);
    }
    return { mapping, restored };
  }

  async function importBackup(command, windowId) {
    const plan = parseTavvyBackup(command.backup);
    const { mapping: spaceMapping, restored } = await matchBackupSpaces(plan.spaces);
    const ids = new Map(plan.groups.map((g) => [g.id, g.id === INBOX_ID ? INBOX_ID : ctx.newId()]));
    const state = store.state;
    state.spaces = restored;
    state.groups = plan.groups.map((g) => ({
      id: ids.get(g.id),
      title: g.title,
      color: g.color,
      parentId: g.parentId ? ids.get(g.parentId) : null,
      ...(g.spaceId ? { spaceId: spaceMapping.get(g.spaceId) } : {}),
    }));
    if (!hasGroup(state.groups, INBOX_ID)) state.groups.unshift(defaultInbox());
    state.archive = [];
    state.imports = {};
    await store.save();
    const visible = ctx.visibleGroups(await ctx.activeGroupId(windowId));
    for (const entry of plan.tabs) {
      const groupId = ids.get(entry.groupId);
      const url = restorableUrl(entry.url, entry.title);
      const tab = await api.tabs.create({
        windowId,
        active: false,
        pinned: entry.pinned,
        ...(await ctx.tabOptionsForGroup(findGroup(state.groups, groupId))),
        ...(url === "about:newtab" ? {} : { url }),
        ...(!entry.pinned && !url.startsWith("about:") ? { discarded: true, title: entry.title } : {}),
      });
      await api.sessions.setTabValue(tab.id, TAB_GROUP, groupId);
      await api.sessions.setTabValue(tab.id, TAB_IMPORT_METADATA, { title: entry.title });
      if (!entry.pinned && !visible.has(groupId)) await api.tabs.hide([tab.id]);
    }
    for (const entry of plan.archive)
      state.archive.push({ id: ctx.newId(), groupId: ids.get(entry.groupId), title: entry.title, url: entry.url, closedAt: entry.closedAt });
    state.archive = state.archive.slice(0, MAX_ARCHIVE);
    state.settings = plan.settings;
    await store.save();
  }

  /** Resumable: progress is stored per backup fingerprint and tabs carry an import marker. */
  async function importStg(command, windowId) {
    const plan = parseStgBackup(command.backup);
    const fingerprint = await stgFingerprint(plan);
    const state = store.state;
    state.imports ??= {};
    let job = state.imports[fingerprint];
    if (job?.complete) job = null;
    const resuming = !!job;
    if (!job) {
      const inbox = state.groups.find((group) => group.id === INBOX_ID) || defaultInbox();
      delete inbox.spaceId;
      state.groups = [inbox];
      state.spaces = [];
      state.archive = [];
      state.imports = {};
      job = { groupIds: {}, completed: [], complete: false };
      state.imports[fingerprint] = job;
      for (const source of plan.groups) {
        const target = { id: ctx.newId(), title: source.title, color: source.color, parentId: null, stgSourceId: source.sourceId };
        state.groups.push(target);
        job.groupIds[source.sourceId] = target.id;
      }
      await store.save();
    }
    const completed = new Set(job.completed || []);
    const visible = ctx.visibleGroups(await ctx.activeGroupId(windowId));
    const existingByMarker = new Map();
    if (resuming)
      await Promise.all(
        (await api.tabs.query({ windowId })).map(async (tab) => {
          const marker = await api.sessions.getTabValue(tab.id, TAB_IMPORT_MARKER);
          if (typeof marker === "string") existingByMarker.set(marker, tab);
        }),
      );

    async function importTab(record, key, groupId, pinned) {
      if (completed.has(key)) return;
      const marker = fingerprint + ":" + key;
      let tab = existingByMarker.get(marker);
      if (!tab) {
        const url = restorableUrl(record.url, record.title);
        tab = await api.tabs.create({
          windowId,
          active: false,
          pinned,
          ...(!pinned && url !== "about:newtab" && url !== "about:blank" ? { discarded: true, title: record.title } : {}),
          ...(url === "about:newtab" ? {} : { url }),
        });
        await api.sessions.setTabValue(tab.id, TAB_IMPORT_MARKER, marker);
      }
      await api.sessions.setTabValue(tab.id, TAB_GROUP, groupId);
      await api.sessions.setTabValue(tab.id, TAB_IMPORT_METADATA, { title: record.title, faviconUrl: record.faviconUrl });
      if (!pinned && !visible.has(groupId)) await api.tabs.hide([tab.id]);
      completed.add(key);
      job.completed.push(key);
      if (job.completed.length % 20 === 0) await store.save();
    }

    for (const source of plan.groups)
      for (let index = 0; index < source.tabs.length; index++)
        await importTab(source.tabs[index], `${source.sourceId}:${index}`, job.groupIds[source.sourceId], false);
    for (let index = 0; index < plan.pinnedTabs.length; index++)
      await importTab(plan.pinnedTabs[index], `pinned:${index}`, INBOX_ID, true);
    job.complete = true;
    job.report = {
      groups: plan.groups.length,
      tabs: plan.groups.reduce((n, g) => n + g.tabs.length, 0),
      pinnedTabs: plan.pinnedTabs.length,
      localFiles: plan.localFiles,
      browserPages: plan.browserPages,
    };
    state.importReport = job.report;
    delete job.completed;
    delete job.groupIds;
    await store.save();
  }

  return { exportBackup, importBackup, importStg };
}
