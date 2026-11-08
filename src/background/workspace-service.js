import { createTabIndex } from "../platform/tab-index.js";
import { parseStgBackup, stgFingerprint } from "../domain/stg-import.js";
import { normalizeSettings } from "../domain/settings.js";
import { parseTavvyBackup } from "../domain/tavvy-backup.js";
import { DEFAULT_SPACE_ID, groupSpaceId, groupsInSpace, spaceIcon } from "../domain/spaces.js";
const KEY = "tavvy:workspace:v1";
const TAG = "tavvy:group";
const ACTIVE = "tavvy:active-group";
const EMPTY_SPACE = "tavvy:empty-space";
const GROUP_PINNED = "tavvy:group-pinned";
const colors = ["#398dff", "#a855f7", "#00c98a", "#ff7800", "#ff168a"];
export function createWorkspaceService(
  browserApi,
  id = () => crypto.randomUUID(),
  toolbar = null,
) {
  const index = createTabIndex(browserApi);
  const api = index.api;
  let state,
    scanCache,
    scanStamp,
    revision = 0;
  const knownKey = "tavvy:known:v1";
  let savedState,
    savedKnown,
    knownRevision = 0,
    savedKnownRevision = -1,
    scanOrderVersion = 0;
  let refreshPending,
    observedVersion = -1,
    identitiesVersion = 0, identitiesSignature = "";
  let recordsById = new Map();
  const sortedWindows = new Map();
  const pendingRemovals = new Map();
  let removing;
  let tail = Promise.resolve();
  const ready = api.storage.local.get(KEY).then(async (data) => {
    state = data[KEY] ?? {
      version: 1,
      groups: [
        { id: "inbox", title: "Основная", color: colors[0], parentId: null },
      ],
      archive: [],
      known: {},
      settings: normalizeSettings(null),
    };
    if (state.version !== 1)
      throw new Error("Неподдерживаемая версия данных Tavvy");
    state.known ??= {};
    // Keep older archive data in backups without recording new closures.
    state.archive ??= [];
    state.spaces ??= [];
    for (const job of Object.values(state.imports || {}))
      if (job.complete) {
        delete job.completed;
        delete job.groupIds;
      }
    const known = await api.storage.local.get(knownKey);
    if (known[knownKey]) state.known = known[knownKey];
    savedState = data[KEY]?.known
      ? null
      : JSON.stringify({ ...state, known: undefined });
    savedKnown = known[knownKey] ? JSON.stringify(compactKnown()) : "";
    savedKnownRevision = known[knownKey] ? knownRevision : -1;
  });
  function compactKnown() {
    return Object.fromEntries(
      Object.entries(state?.known || {}).map(([id, tab]) => [
        id,
        {
          id: tab.id,
          windowId: tab.windowId,
          groupId: tab.groupId,
          title: tab.title,
          url: tab.url,
          faviconUrl: tab.faviconUrl,
          pinned: tab.pinned,
        },
      ]),
    );
  }
  async function save() {
    const persisted = { ...state };
    delete persisted.known;
    const nextState = JSON.stringify(persisted),
      changes = {};
    if (nextState !== savedState) changes[KEY] = persisted;
    let nextKnown = savedKnown;
    if (knownRevision !== savedKnownRevision) {
      const data = compactKnown();
      nextKnown = JSON.stringify(data);
      if (nextKnown !== savedKnown) changes[knownKey] = data;
    }
    if (Object.keys(changes).length) await api.storage.local.set(changes);
    savedState = nextState;
    savedKnown = nextKnown;
    savedKnownRevision = knownRevision;
  }
  function forgetKnown(id) {
    if (state.known[id]) {
      delete state.known[id];
      knownRevision++;
    }
  }
  const queue = (task) => {
    const result = tail
      .then(() => ready)
      .then(() => index.sync())
      .then(task);
    tail = result.catch(() => {});
    return result;
  };
  function group(groupId) {
    const value = state.groups.find((item) => item.id === groupId);
    if (!value) throw new Error("Группа не найдена");
    return value;
  }
  function space(spaceId) {
    if (spaceId === DEFAULT_SPACE_ID) return { id: DEFAULT_SPACE_ID, name: "", cookieStoreId: null };
    const found = state.spaces.find((item) => item.id === spaceId);
    if (!found) throw new Error("Пространство не найдено");
    return found;
  }
  async function tabContainer(groupId) {
    const spaceId = groupSpaceId(group(groupId));
    const selected = space(spaceId);
    if (spaceId === DEFAULT_SPACE_ID) return {};
    if (typeof selected.cookieStoreId !== "string" || !selected.cookieStoreId.startsWith("firefox-container-"))
      throw new Error("Контейнер пространства недоступен");
    if (!browserApi.contextualIdentities || !await browserApi.permissions?.contains({ permissions: ["cookies"] }))
      throw new Error("Для пространства необходимо разрешение на контейнеры Firefox");
    let identity;
    try { identity = await browserApi.contextualIdentities.get(selected.cookieStoreId); }
    catch (error) {
      if (/^Invalid contextual identity:/i.test(String(error?.message || error))) throw new Error("Контейнер пространства недоступен");
      throw error;
    }
    if (identity?.cookieStoreId !== selected.cookieStoreId) throw new Error("Контейнер пространства недоступен");
    return { cookieStoreId: selected.cookieStoreId };
  }
  async function active(windowId) {
    const value = await api.sessions.getWindowValue(windowId, ACTIVE);
    return state.groups.some((g) => g.id === value) ? value : "inbox";
  }
  async function emptySpace(windowId) {
    const value = await api.sessions.getWindowValue(windowId, EMPTY_SPACE);
    return state.spaces.some((item) => item.id === value) && !groupsInSpace(state.groups, value).length ? value : null;
  }
  function visibleGroups(groupId) {
    if (state.settings?.nestedGroups === false) return new Set([groupId]);
    if (state.settings?.nestedTabsVisibility === "children") {
      const children = new Map();
      for (const item of state.groups) {
        if (!children.has(item.parentId)) children.set(item.parentId, []);
        children.get(item.parentId).push(item.id);
      }
      const visible = new Set([groupId]);
      const pending = [groupId];
      while (pending.length) {
        for (const child of children.get(pending.pop()) || []) {
          if (!visible.has(child)) { visible.add(child); pending.push(child); }
        }
      }
      return visible;
    }
    const groups = new Map(state.groups.map((item) => [item.id, item]));
    const visible = new Set();
    let current = groupId;
    while (current && groups.has(current) && !visible.has(current)) {
      visible.add(current);
      current = groups.get(current).parentId;
    }
    return visible;
  }
  async function scan() {
    const tabs = await api.tabs.query({ windowType: "normal" });
    const stamp =
      index.version + ":" + Boolean(state.settings?.groupPinnedTabs) + ":" + state.groups.map((group) => group.id).join(",");
    if (scanCache && scanStamp === stamp) return scanCache;
    const orderStamp = index.orderVersion;
    const validGroups = new Set(state.groups.map((group) => group.id));
    const windowGroups = new Map();
    const records = await Promise.all(
      tabs
        .filter((tab) => !tab.incognito)
        .map(async (tab) => {
          const utilities = ["import.html", "settings.html"].map((name) => api.runtime?.getURL?.(name)).filter(Boolean);
          if (utilities.some((url) => tab.url === url || tab.url?.startsWith(url + "?") || tab.url?.startsWith(url + "#"))) {
            forgetKnown(tab.id);
            return null;
          }

          let groupId;
          try {
            groupId = await api.sessions.getTabValue(tab.id, TAG);
          } catch {
            return null;
          } // A tab can close while Firefox answers a query.
          if (!validGroups.has(groupId)) {
            if (!windowGroups.has(tab.windowId))
              windowGroups.set(tab.windowId, active(tab.windowId));
            groupId = await windowGroups.get(tab.windowId);
            const tabSpace = state.spaces.find((item) => item.cookieStoreId === tab.cookieStoreId);
            const actualSpace = tabSpace?.id || DEFAULT_SPACE_ID;
            if (groupSpaceId(group(groupId)) !== actualSpace) groupId = groupsInSpace(state.groups, actualSpace)[0]?.id || "inbox";
            try {
              await api.sessions.setTabValue(tab.id, TAG, groupId);
            } catch {
              return null;
            }
          }
          let metadata;
          try {
            metadata = await api.sessions.getTabValue(
              tab.id,
              "tavvy:import-metadata",
            );
          } catch {}
          let localTitle;
          let managedPinned = false;
          if (state.settings?.groupPinnedTabs) {
            try { managedPinned = (await api.sessions.getTabValue(tab.id, GROUP_PINNED)) === true; } catch { return null; }
          }
          if (tab.url?.includes("/local-file.html#")) {
            try {
              localTitle = JSON.parse(
                decodeURIComponent(tab.url.split("#")[1]),
              ).title;
            } catch {}
          }
          const previous = state.known[tab.id];
          const url = tab.pendingUrl || tab.url || "about:newtab";
          const cachedFavicon = tab.discarded && previous?.url === url
            ? previous.faviconUrl
            : "";
          const record = {
            id: tab.id,
            windowId: tab.windowId,
            groupId,
            cookieStoreId: tab.cookieStoreId,
            title:
              localTitle || tab.title || metadata?.title || "Новая вкладка",
            url,
            faviconUrl: tab.favIconUrl || cachedFavicon || metadata?.faviconUrl || "",
            pinned: tab.pinned,
            managedPinned,
            active: tab.active,
            index: tab.index,
            hidden: tab.hidden,
            audible: tab.audible,
            muted: tab.mutedInfo?.muted === true,
            sharingState: tab.sharingState,
            discarded: tab.discarded,
          };
          if (
            !previous ||
            [
              "id",
              "windowId",
              "groupId",
              "title",
              "url",
              "faviconUrl",
              "pinned",
            ].some((key) => previous[key] !== record[key])
          )
            knownRevision++;
          state.known[tab.id] = record;
          return record;
        }),
    );
    const live = index.liveIds();
    for (const key of Object.keys(state.known))
      if (!live.has(Number(key)) && !index.removed.has(Number(key)))
        forgetKnown(key);
    scanCache = records.filter(Boolean);
    recordsById = new Map(scanCache.map((record) => [record.id, record]));
    scanStamp = stamp;
    scanOrderVersion = orderStamp;
    return scanCache;
  }
  async function firefoxSpaces() {
    if (!browserApi.contextualIdentities?.query ||
        !await browserApi.permissions?.contains({ permissions: ["cookies"] })) return [];
    const identities = await browserApi.contextualIdentities.query({});
    const signature = JSON.stringify(identities.map(({ cookieStoreId, name, icon }) => [cookieStoreId, name, icon]));
    if (signature !== identitiesSignature) { identitiesSignature = signature; identitiesVersion++; }
    return identities.filter((item) => typeof item.cookieStoreId === "string" && item.cookieStoreId.startsWith("firefox-container-"));
  }
  async function snapshot(windowId) {
    const identities = await firefoxSpaces();
    const spacePermission = !!(browserApi.contextualIdentities?.query && await browserApi.permissions?.contains({ permissions: ["cookies"] }));
    const records = await scan();
    let sorted = sortedWindows.get(windowId);
    if (!sorted || sorted.version !== scanOrderVersion || sorted.groupPinnedTabs !== !!state.settings?.groupPinnedTabs) {
      sorted = {
        version: scanOrderVersion,
        groupPinnedTabs: !!state.settings?.groupPinnedTabs,
        ids: records
          .filter((tab) => tab.windowId === windowId)
          .sort((a, b) => a.index - b.index)
          .map((tab) => tab.id),
      };
      sortedWindows.set(windowId, sorted);
    }
    const activeGroupId = await active(windowId);
    const selectedEmptySpace = await emptySpace(windowId);
    const activeSpaceId = selectedEmptySpace || groupSpaceId(group(activeGroupId));
    const groups = state.groups;
    const tabs = sorted.ids.map((id) => recordsById.get(id)).filter(Boolean);
    await toolbar?.setDynamic?.(state.settings?.dynamicIcon !== false).catch(console.error);
    await toolbar?.setStyle?.(state.settings.markerStyle).catch(console.error);
    await toolbar?.update(windowId, group(activeGroupId)).catch(console.error);
    return {
      revision,
      groups,
      tabs,
      activeGroupId,
      activeSpaceId,
      spacePermission,
      spaces: [{ id: DEFAULT_SPACE_ID, name: "" }, ...state.spaces.map(({ id, name, icon, cookieStoreId }) => {
        const identity = identities.find((item) => item.cookieStoreId === cookieStoreId);
        return { id, name: identity?.name || name, icon: spaceIcon(identity?.icon || icon), ...(spacePermission && !identity ? { unavailable: true } : {}) };
      }), ...identities.filter((item) => !state.spaces.some((space) => space.cookieStoreId === item.cookieStoreId)).map((item) => ({ id: `container:${item.cookieStoreId}`, name: item.name, icon: spaceIcon(item.icon), firefoxContainer: true }))],
      settings: normalizeSettings(state.settings),
      importReport: state.importReport,
    };
  }
  async function visibility(windowId, groupId, source) {
    const visible = visibleGroups(groupId);
    let records = (source || (await scan())).filter((tab) => tab.windowId === windowId);
    if (state.settings?.groupPinnedTabs) {
      for (const tab of records) {
        if (visible.has(tab.groupId) && tab.managedPinned) {
          if (tab.hidden) await api.tabs.show([tab.id]);
          if (!tab.pinned) await api.tabs.update(tab.id, { pinned: true });
          await api.sessions.setTabValue(tab.id, GROUP_PINNED, false);
        } else if (!visible.has(tab.groupId) && tab.pinned && !tab.active) {
          await api.sessions.setTabValue(tab.id, GROUP_PINNED, true);
          await api.tabs.update(tab.id, { pinned: false });
        }
      }
      records = (await scan()).filter((tab) => tab.windowId === windowId);
    }
    records = records.filter((tab) => !tab.pinned);
    const show = records
      .filter((tab) => visible.has(tab.groupId) && tab.hidden)
      .map((tab) => tab.id);
    if (show.length) await api.tabs.show(show);
    const hide = records
      .filter((tab) => !visible.has(tab.groupId) && !tab.hidden)
      .map((tab) => tab.id);
    if (hide.length) {
      let hidden;
      try { hidden = await api.tabs.hide(hide); }
      catch (error) {
        if (state.settings?.groupPinnedTabs) {
          for (const tab of records.filter((item) => item.managedPinned && hide.includes(item.id))) {
            const current = await api.tabs.get(tab.id).catch(() => null);
            if (current && !current.hidden && !current.pinned) {
              await api.tabs.update(tab.id, { pinned: true });
              await api.sessions.setTabValue(tab.id, GROUP_PINNED, false);
            }
          }
        }
        throw error;
      }
      if (hidden.length !== hide.length) {
        if (state.settings?.groupPinnedTabs) {
          const hiddenIds = new Set(hidden);
          for (const tab of records.filter((item) => item.managedPinned && hide.includes(item.id) && !hiddenIds.has(item.id))) {
            await api.tabs.update(tab.id, { pinned: true });
            await api.sessions.setTabValue(tab.id, GROUP_PINNED, false);
          }
        }
        throw new Error(
          "Firefox не смог скрыть часть вкладок (например, вкладку с захватом экрана).",
        );
      }
    }
  }
  async function activate(windowId, groupId, preferred) {
    group(groupId);
    await api.sessions.setWindowValue(windowId, EMPTY_SPACE, null);
    const previousGroupId = await active(windowId);
    const tabs = (await scan()).filter(
      (tab) =>
        tab.windowId === windowId && tab.groupId === groupId && (!tab.pinned || state.settings?.groupPinnedTabs),
    );
    let target =
      tabs.find((tab) => tab.id === preferred) ||
      tabs.find((tab) => tab.active) ||
      tabs[0];
    if (!target) {
      target = await api.tabs.create({ windowId, active: false, ...await tabContainer(groupId) });
      await api.sessions.setTabValue(target.id, TAG, groupId);
    }
    await api.tabs.show([
      ...new Set([...tabs.map((tab) => tab.id), target.id]),
    ]);
    await api.tabs.update(target.id, { active: true });
    await api.sessions.setWindowValue(windowId, ACTIVE, groupId);
    await api.sessions.setWindowValue(windowId, "tavvy:space-group:" + groupSpaceId(group(groupId)), groupId);
    await visibility(windowId, groupId);
    if (state.settings?.discardInactiveTabs && previousGroupId !== groupId) {
      const candidates = (await scan()).filter(
        (tab) =>
          tab.windowId === windowId &&
          tab.groupId === previousGroupId &&
          tab.hidden &&
          !tab.pinned &&
          !tab.active &&
          tab.audible === false &&
          !tab.discarded,
      );
      for (const candidate of candidates) {
        try {
          const current = await api.tabs.get(candidate.id);
          const currentGroup = await api.sessions.getTabValue(
            candidate.id,
            TAG,
          );
          if (
            currentGroup === previousGroupId &&
            current.hidden &&
            !current.active &&
            !current.pinned &&
            current.audible === false &&
            !current.discarded
          )
            await api.tabs.discard(candidate.id);
        } catch (error) {
          console.warn("Не удалось выгрузить вкладку:", error);
        }
      }
    }
  }
  function isRestrictedPage(url) {
    return /^moz-extension:\/\/[0-9a-f-]{36}\/(?:[^\s]*)$/i.test(url) || (/^about:[a-z0-9-]+(?:[?#][^\s]*)?$/i.test(url) && !/^about:(blank|newtab)$/i.test(url));
  }
  function placeholderUrl(url, title) {
    return api.runtime.getURL("local-file.html") + "#" + encodeURIComponent(JSON.stringify({ url, title }));
  }
  async function importStg(data, windowId) {
    const plan = parseStgBackup(data);
    const fingerprint = await stgFingerprint(plan);
    state.imports ??= {};
    let job = state.imports[fingerprint];
    if (job?.complete) job = null;
    const resuming = !!job;
    if (!job) {
      const inbox = state.groups.find((group) => group.id === "inbox") || { id: "inbox", title: "Основная", color: colors[0], parentId: null };
      delete inbox.spaceId;
      state.groups = [inbox];
      state.spaces = [];
      state.archive = [];
      state.imports = {};
      job = { groupIds: {}, completed: [], complete: false };
      state.imports[fingerprint] = job;
      for (const source of plan.groups) {
        const existing = state.groups.find(
          (g) => g.stgSourceId === source.sourceId && g.title === source.title,
        );
        const target = existing || {
          id: id(),
          title: source.title,
          color: source.color,
          parentId: null,
          stgSourceId: source.sourceId,
        };
        if (!existing) state.groups.push(target);
        job.groupIds[source.sourceId] = target.id;
      }
      await save();
    }
    const completed = new Set(job.completed || []);
    const current = await active(windowId);
    const existingByMarker = new Map();
    await Promise.all(
      (await api.tabs.query({ windowId })).map(async (tab) => {
        const marker = await api.sessions.getTabValue(tab.id, "tavvy:import");
        if (resuming && typeof marker === "string") existingByMarker.set(marker, tab);
      }),
    );
    for (const source of plan.groups) {
      const groupId = job.groupIds[source.sourceId];
      for (let index = 0; index < source.tabs.length; index++)
        await importTab(
          source.tabs[index],
          `${source.sourceId}:${index}`,
          groupId,
          false,
        );
    }
    for (let index = 0; index < plan.pinnedTabs.length; index++)
      await importTab(plan.pinnedTabs[index], `pinned:${index}`, "inbox", true);
    async function importTab(record, key, groupId, pinned) {
      if (completed.has(key)) return;
      const marker = fingerprint + ":" + key;
      let existing = existingByMarker.get(marker);
      if (!existing) {
        const url = record.url.startsWith("file:") || isRestrictedPage(record.url)
          ? placeholderUrl(record.url, record.title)
          : record.url;
        existing = await api.tabs.create({
          windowId,
          active: false,
          pinned,
          ...(!pinned && url !== "about:newtab" && url !== "about:blank"
            ? { discarded: true, title: record.title }
            : {}),
          ...(url === "about:newtab" ? {} : { url }),
        });
        await api.sessions.setTabValue(existing.id, "tavvy:import", marker);
      }
      await api.sessions.setTabValue(existing.id, TAG, groupId);
      await api.sessions.setTabValue(existing.id, "tavvy:import-metadata", {
        title: record.title,
        faviconUrl: record.faviconUrl,
      });
      if (!pinned && !visibleGroups(current).has(groupId)) await api.tabs.hide([existing.id]);
      completed.add(key);
      job.completed.push(key);
      if (job.completed.length % 20 === 0) await save();
    }
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
    await save();
  }
  async function execute(command, windowId) {
    if (!Number.isInteger(windowId)) throw new Error("Не указано окно Firefox");
    const { type } = command;
    if (type === "snapshot") return snapshot(windowId);
    if (type === "exportBackup") {
      const records = await scan();
      const safe = /^(https?:\/\/|file:\/\/|moz-extension:\/\/[0-9a-f-]{36}\/(?:[^\s]*)$|about:blank$|about:newtab$|about:[a-z0-9-]+(?:[?#][^\s]*)?$)/i;
      const ids = new Set(state.groups.map((g) => g.id));
      const serialize = (entry) => {
        let url = entry.url;
        if (url?.includes("/local-file.html#")) {
          try { url = JSON.parse(decodeURIComponent(url.split("#")[1])).url; } catch {}
        }
        return { groupId: ids.has(entry.groupId) ? entry.groupId : "inbox", title: entry.title, url, pinned: !!(entry.pinned || entry.managedPinned), ...(entry.closedAt ? { closedAt: entry.closedAt } : {}) };
      };
      return { format: "tavvy-backup", version: state.spaces.length ? 2 : 1, createdAt: new Date().toISOString(), groups: structuredClone(state.groups), ...(state.spaces.length ? { spaces: state.spaces.map(({ id, name, icon }) => ({ id, name, ...(icon ? { icon: spaceIcon(icon) } : {}) })) } : {}), tabs: records.map(serialize).filter((t) => safe.test(t.url)), archive: state.archive.map(serialize).filter((t) => safe.test(t.url)), settings: normalizeSettings(state.settings) };
    }
    if (type === "importBackup") {
      const plan = parseTavvyBackup(command.backup);
      const spaceMapping = new Map([[DEFAULT_SPACE_ID, DEFAULT_SPACE_ID]]);
      const restoredSpaces = [];
      if (plan.spaces?.length) {
        if (!browserApi.contextualIdentities || !await browserApi.permissions?.contains({ permissions: ["cookies"] }))
          throw new Error("Для восстановления пространств необходимо разрешение на контейнеры Firefox");
        const identities = await browserApi.contextualIdentities.query({});
        const usedContainers = new Set();
        for (const item of plan.spaces) {
          const matches = identities.filter((identity) => identity.name === item.name && !usedContainers.has(identity.cookieStoreId));
          if (matches.length !== 1) throw new Error("Для восстановления пространства нужен один существующий контейнер Firefox с тем же именем");
          const identity = matches[0];
          usedContainers.add(identity.cookieStoreId);
          const spaceId = id();
          restoredSpaces.push({ id: spaceId, name: item.name, cookieStoreId: identity.cookieStoreId, ...(item.icon ? { icon: item.icon } : {}) });
          spaceMapping.set(item.id, spaceId);
        }
      }
      const mapping = new Map(plan.groups.map((g) => [g.id, g.id === "inbox" ? "inbox" : id()]));
      state.spaces = restoredSpaces;
      state.groups = plan.groups.map((g) => ({ id: mapping.get(g.id), title: g.title, color: g.color, parentId: g.parentId ? mapping.get(g.parentId) : null, ...(g.spaceId ? { spaceId: spaceMapping.get(g.spaceId) } : {}) }));
      if (!state.groups.some((g) => g.id === "inbox")) state.groups.unshift({ id: "inbox", title: "Основная", color: colors[0], parentId: null });
      state.archive = [];
      state.imports = {};
      await save();
      const selected = await active(windowId);
      for (const entry of plan.tabs) {
        const local = entry.url.startsWith("file:") || isRestrictedPage(entry.url);
        const url = local ? placeholderUrl(entry.url, entry.title) : entry.url;
        const tab = await api.tabs.create({ windowId, active: false, pinned: entry.pinned, ...await tabContainer(mapping.get(entry.groupId)), ...(url === "about:newtab" ? {} : { url }), ...(!entry.pinned && !url.startsWith("about:") ? { discarded: true, title: entry.title } : {}) });
        await api.sessions.setTabValue(tab.id, TAG, mapping.get(entry.groupId));
        await api.sessions.setTabValue(tab.id, "tavvy:import-metadata", { title: entry.title });
        if (!entry.pinned && !visibleGroups(selected).has(mapping.get(entry.groupId))) await api.tabs.hide([tab.id]);
      }
      for (const entry of plan.archive) state.archive.push({ id: id(), groupId: mapping.get(entry.groupId), title: entry.title, url: entry.url, closedAt: entry.closedAt });
      state.archive = state.archive.slice(0, 200);
      state.settings = plan.settings;
      await save();
      return snapshot(windowId);
    }
    if (type === "importStg") {
      await importStg(command.backup, windowId);
      return snapshot(windowId);
    }
    if (type === "createContainer" || type === "createSpace" || type === "recoverSpace" || type === "setSpaceIcon") {
      throw new Error("Управление контейнерами Firefox в Tavvy недоступно");
    } else if (type === "rebindSpace") {
      if (command.spaceId === DEFAULT_SPACE_ID) throw new Error("Контейнер пространства недоступен");
      const selected = space(command.spaceId);
      const identities = await firefoxSpaces();
      if (identities.some((identity) => identity.cookieStoreId === selected.cookieStoreId))
        throw new Error("Контейнер пространства уже существует");
      const target = identities.find((identity) => identity.cookieStoreId === command.cookieStoreId);
      if (!target || state.spaces.some((item) => item.cookieStoreId === target.cookieStoreId))
        throw new Error("Контейнер пространства недоступен");
      // The user explicitly selected this existing container; preserve all
      // group, tab and archive associations and do not touch Firefox cookies.
      selected.cookieStoreId = target.cookieStoreId;
      selected.name = target.name;
      selected.icon = spaceIcon(target.icon);
      await save();
      const available = groupsInSpace(state.groups, selected.id);
      const previous = await api.sessions.getWindowValue(windowId, "tavvy:space-group:" + selected.id);
      const groupId = available.find((item) => item.id === previous)?.id || available[0]?.id;
      if (groupId) await activate(windowId, groupId);
      else await api.sessions.setWindowValue(windowId, EMPTY_SPACE, selected.id);
    } else if (type === "deleteSpace") {
      if (command.spaceId === DEFAULT_SPACE_ID) throw new Error("Основное пространство удалить нельзя");
      space(command.spaceId);
      // Keep groups, tabs, archive entries and the Firefox container and its cookies.
      for (const item of state.groups)
        if (groupSpaceId(item) === command.spaceId) delete item.spaceId;
      state.spaces = state.spaces.filter((item) => item.id !== command.spaceId);
    } else if (type === "activateSpace") {
      let spaceId = command.spaceId;
      if (typeof spaceId === "string" && spaceId.startsWith("container:")) {
        const cookieStoreId = spaceId.slice("container:".length);
        const identity = (await firefoxSpaces()).find((item) => item.cookieStoreId === cookieStoreId);
        if (!identity) throw new Error("Контейнер пространства недоступен");
        let existing = state.spaces.find((item) => item.cookieStoreId === cookieStoreId);
        if (!existing) {
          if (state.spaces.length >= 100) throw new Error("Слишком много пространств");
          existing = { id: id(), name: identity.name, icon: spaceIcon(identity.icon), cookieStoreId };
          state.spaces.push(existing);
          await save();
        }
        spaceId = existing.id;
      }
      space(spaceId);
      const current = await active(windowId);
      await api.sessions.setWindowValue(windowId, "tavvy:space-group:" + groupSpaceId(group(current)), current);
      const previous = await api.sessions.getWindowValue(windowId, "tavvy:space-group:" + spaceId);
      const available = groupsInSpace(state.groups, spaceId);
      const target = available.find((item) => item.id === previous) || available[0];
      if (target) await activate(windowId, target.id);
      else await api.sessions.setWindowValue(windowId, EMPTY_SPACE, spaceId);
    } else if (type === "createGroup") {
      const title = String(command.title ?? "")
        .trim()
        .slice(0, 100);
      if (!title) throw new Error("Введите название группы");
      const previouslyEmpty = await emptySpace(windowId);
      const groupSpace = command.spaceId || (command.parentId ? groupSpaceId(group(command.parentId)) : DEFAULT_SPACE_ID);
      space(groupSpace);
      const newId = id();
      state.groups.push({
        id: newId,
        title,
        color: colors[state.groups.length % colors.length],
        parentId: command.parentId || null,
        ...(groupSpace === DEFAULT_SPACE_ID ? {} : { spaceId: groupSpace }),
      });
      if (previouslyEmpty) await activate(windowId, newId);
    } else if (type === "clearGroup" || type === "reloadGroup") {
      group(command.groupId);
      const targets = (await scan()).filter((tab) => tab.groupId === command.groupId && (!tab.pinned || state.settings?.groupPinnedTabs));
      if (type === "reloadGroup") {
        for (const tab of targets) await api.tabs.reload(tab.id);
      } else {
        for (const affectedWindow of new Set(targets.map((tab) => tab.windowId))) {
          const selected = targets.find((tab) => tab.windowId === affectedWindow && tab.active);
          if (selected) {
            const replacement = await api.tabs.create({ windowId: affectedWindow, active: false, ...await tabContainer(command.groupId) });
            await api.sessions.setTabValue(replacement.id, TAG, command.groupId);
            await api.tabs.update(replacement.id, { active: true });
          }
        }
        for (const tab of targets) { await api.tabs.remove(tab.id); forgetKnown(tab.id); }
      }
    } else if (type === "moveGroupToSpace") {
      const moving = group(command.groupId);
      const sourceSpace = groupSpaceId(moving);
      const identities = await firefoxSpaces();
      let destination = command.spaceId === DEFAULT_SPACE_ID ? null : state.spaces.find((item) => item.id === command.spaceId);
      const identity = command.spaceId?.startsWith("container:")
        ? identities.find((item) => item.cookieStoreId === command.spaceId.slice(10))
        : destination && identities.find((item) => item.cookieStoreId === destination.cookieStoreId);
      if (command.spaceId !== DEFAULT_SPACE_ID && !identity) throw new Error("Контейнер пространства недоступен");
      if (destination?.id === sourceSpace || (command.spaceId === DEFAULT_SPACE_ID && sourceSpace === DEFAULT_SPACE_ID)) return snapshot(windowId);
      const movedIds = new Set([moving.id]);
      const records = await scan();
      const targets = records.filter((tab) => movedIds.has(tab.groupId) && (!tab.pinned || state.settings?.groupPinnedTabs));
      const transferable = targets.filter((tab) => /^(https?:|about:(blank|newtab)$)/i.test(tab.url));
      let fallback = groupsInSpace(state.groups, sourceSpace).find((item) => !movedIds.has(item.id));
      fallback ||= group("inbox");
      if (!destination && identity) {
        if (state.spaces.length >= 100) throw new Error("Слишком много пространств");
        destination = { id: id(), name: identity.name, icon: spaceIcon(identity.icon), cookieStoreId: identity.cookieStoreId };
      }
      const created = [];
      try {
        for (const tab of transferable) {
          const copy = await api.tabs.create({ windowId: tab.windowId, active: false, pinned: !!(tab.pinned || tab.managedPinned), ...(tab.url === "about:newtab" ? {} : { url: tab.url }), ...(identity ? { cookieStoreId: identity.cookieStoreId } : { cookieStoreId: "firefox-default" }) });
          created.push({ copy, original: tab });
          await api.sessions.setTabValue(copy.id, TAG, tab.groupId);
        }
        for (const { copy, original } of created) if (original.active) await api.tabs.update(copy.id, { active: true });
        for (const tab of targets.filter((item) => item.active && !transferable.includes(item))) {
          let replacement = created.find((item) => item.original.windowId === tab.windowId)?.copy;
          if (!replacement) {
            replacement = await api.tabs.create({ windowId: tab.windowId, active: false, ...(identity ? { cookieStoreId: identity.cookieStoreId } : { cookieStoreId: "firefox-default" }) });
            created.push({ copy: replacement, original: tab });
            await api.sessions.setTabValue(replacement.id, TAG, tab.groupId);
          }
          await api.tabs.update(replacement.id, { active: true });
        }
      } catch (error) {
        for (const original of targets) if (original.active) await api.tabs.update(original.id, { active: true }).catch(() => {});
        for (const { copy } of created) await api.tabs.remove(copy.id).catch(() => {});
        throw error;
      }
      for (const tab of records.filter((item) => movedIds.has(item.groupId) && item.pinned && !state.settings?.groupPinnedTabs))
        await api.sessions.setTabValue(tab.id, TAG, fallback.id);
      if (destination && !state.spaces.includes(destination)) state.spaces.push(destination);
      for (const item of state.groups) if (movedIds.has(item.id)) { if (destination) item.spaceId = destination.id; else delete item.spaceId; }
      for (const tab of targets) { await api.tabs.remove(tab.id); forgetKnown(tab.id); }
      for (const affectedWindow of new Set(targets.map((tab) => tab.windowId))) await visibility(affectedWindow, await active(affectedWindow));
    } else if (type === "renameGroup") {
      if (typeof command.title !== "string" || command.title.length > 100 || !command.title.trim())
        throw new Error("Введите название группы");
      const changedGroup = group(command.groupId);
      changedGroup.title = command.title.trim();
      await toolbar?.updateGroup?.(changedGroup).catch(console.error);
    } else if (type === "setGroupColor") {
      if (typeof command.color !== "string" || !/^#[0-9a-f]{6}$/i.test(command.color))
        throw new Error("Некорректный цвет группы");
      const changedGroup = group(command.groupId);
      changedGroup.color = command.color.toLowerCase();
      await toolbar?.updateGroup?.(changedGroup).catch(console.error);
    } else if (type === "activateGroup")
      await activate(windowId, command.groupId);
    else if (type === "createTab") {
      group(command.groupId);
      const tab = await api.tabs.create({ windowId, active: false, ...await tabContainer(command.groupId) });
      await api.sessions.setTabValue(tab.id, TAG, command.groupId);
      await activate(windowId, command.groupId, tab.id);
    } else if (
      type === "activateTab" ||
      type === "toggleTabMute" ||
      type === "reloadTab" ||
      type === "pinTab" ||
      type === "unpinTab" ||
      type === "closeTab" ||
      type === "moveTab"
    ) {
      const tab = (await scan()).find(
        (tab) =>
          tab.id === command.tabId && tab.windowId === windowId,
      );
      if (!tab)
        throw new Error("Вкладка уже закрыта или находится в другом окне");
      if (type === "activateTab") {
        if (tab.pinned && !state.settings?.groupPinnedTabs) await api.tabs.update(tab.id, { active: true });
        else await activate(windowId, tab.groupId, tab.id);
      }
      if (type === "toggleTabMute" && (tab.audible || tab.muted)) await api.tabs.update(tab.id, { muted: !tab.muted });
      if (type === "reloadTab") await api.tabs.reload(tab.id);
      if (type === "pinTab" && !tab.pinned && !tab.managedPinned) {
        if (state.settings?.groupPinnedTabs && !visibleGroups(await active(windowId)).has(tab.groupId)) {
          await api.sessions.setTabValue(tab.id, GROUP_PINNED, true);
        } else {
          if (tab.hidden) await api.tabs.show([tab.id]);
          await api.tabs.update(tab.id, { pinned: true });
        }
      }
      if (type === "unpinTab") {
        if (tab.managedPinned) {
          await api.sessions.setTabValue(tab.id, GROUP_PINNED, false);
        } else if (tab.pinned) {
          if (!state.settings?.groupPinnedTabs) await api.sessions.setTabValue(tab.id, TAG, await active(windowId));
          await api.tabs.update(tab.id, { pinned: false });
        }
      }
      if (type === "closeTab") {
        await api.tabs.remove(tab.id);
        forgetKnown(tab.id);
      }
      if (type === "moveTab") {
        const destination = group(command.groupId);
        const expected = space(groupSpaceId(destination));
        if ((expected.cookieStoreId && tab.cookieStoreId !== expected.cookieStoreId) ||
            (groupSpaceId(group(tab.groupId)) !== groupSpaceId(destination)))
          throw new Error("Перенос вкладок между пространствами не поддерживается");
        await api.sessions.setTabValue(tab.id, TAG, command.groupId);
        if (Number.isInteger(command.index))
          await api.tabs.move(tab.id, { index: command.index });
        if (tab.active && command.keepActiveGroup === true) {
          const currentGroupId = await active(windowId);
          if (visibleGroups(currentGroupId).has(command.groupId)) await visibility(windowId, currentGroupId);
          else await activate(windowId, currentGroupId);
        } else if (tab.active) await activate(windowId, command.groupId, tab.id);
        else await visibility(windowId, await active(windowId));
      }
    }
    else if (type === "moveGroup") {
      const moving = group(command.groupId);
      const parentId = state.settings?.nestedGroups === false ? moving.parentId : command.parentId;
      let parent = parentId ? group(parentId) : null;
      if (command.beforeId) group(command.beforeId);
      while (parent) {
        if (parent.id === moving.id)
          throw new Error("Нельзя вложить группу в саму себя");
        parent = parent.parentId ? group(parent.parentId) : null;
      }
      moving.parentId = parentId || null;
      state.groups = state.groups.filter((item) => item.id !== moving.id);
      const before = state.groups.findIndex(
        (item) => item.id === command.beforeId,
      );
      state.groups.splice(before < 0 ? state.groups.length : before, 0, moving);
      for (const id of new Set((await scan()).map((tab) => tab.windowId)))
        await visibility(id, await active(id));
    } else if (type === "deleteGroup") {
      if (command.groupId === "inbox")
        throw new Error("Основная группа нужна для несортированных вкладок");
      const deleting = group(command.groupId);
      const candidates = groupsInSpace(state.groups, groupSpaceId(deleting)).filter((item) => item.id !== deleting.id);
      const sourceSpaceId = groupSpaceId(deleting);
      const sourceWillBeEmpty = candidates.length === 0;
      const replacement = candidates.find((item) => item.id === "inbox") || candidates[0] || group("inbox");
      const currentTabs = await scan();
      const windowGroups = new Map();
      for (const tab of currentTabs)
        if (!windowGroups.has(tab.windowId))
          windowGroups.set(tab.windowId, await active(tab.windowId));
      const closeTabs = state.settings?.closeTabsOnGroupDelete !== false;
      const targetTabs = currentTabs.filter((tab) => tab.groupId === deleting.id &&
        (!tab.pinned || state.settings?.groupPinnedTabs));
      if (closeTabs) {
        // Switch first so closing the last visible tab cannot close the window.
        for (const [affectedWindowId, activeId] of windowGroups)
          if (activeId === deleting.id || targetTabs.some((tab) => tab.windowId === affectedWindowId && tab.active))
            await activate(affectedWindowId, replacement.id);
        for (const tab of targetTabs) {
          await api.tabs.remove(tab.id);
          forgetKnown(tab.id);
        }
      } else {
        for (const tab of targetTabs)
          await api.sessions.setTabValue(tab.id, TAG, replacement.id);
      }
      // Global pinned tabs remain open and are no longer associated with the deleted group.
      for (const tab of currentTabs)
        if (tab.groupId === deleting.id && tab.pinned && !state.settings?.groupPinnedTabs)
          await api.sessions.setTabValue(tab.id, TAG, replacement.id);
      for (const child of state.groups)
        if (child.parentId === deleting.id) child.parentId = deleting.parentId;
      for (const entry of state.archive)
        if (entry.groupId === deleting.id) entry.groupId = replacement.id;
      state.groups = state.groups.filter((item) => item.id !== deleting.id);
      for (const [affectedWindowId, activeId] of windowGroups) {
        if (activeId === deleting.id) await activate(affectedWindowId, replacement.id);
        else await visibility(affectedWindowId, activeId);
        if (sourceWillBeEmpty && activeId === deleting.id) await api.sessions.setWindowValue(affectedWindowId, EMPTY_SPACE, sourceSpaceId);
      }
    } else if (type === "saveSettings") {
      const next = normalizeSettings(command.settings);
      const previousSettings = normalizeSettings(state.settings);
      const wasGrouped = !!state.settings?.groupPinnedTabs;
      if (!wasGrouped && next.groupPinnedTabs) {
        const records = await scan();
        const windows = new Map();
        for (const tab of records.filter((item) => item.pinned)) {
          if (!windows.has(tab.windowId)) windows.set(tab.windowId, await active(tab.windowId));
          await api.sessions.setTabValue(tab.id, TAG, windows.get(tab.windowId));
        }
      }
      if (wasGrouped && !next.groupPinnedTabs) {
        const records = await scan();
        for (const tab of records.filter((item) => item.managedPinned)) {
          if (tab.hidden) await api.tabs.show([tab.id]);
          if (!tab.pinned) await api.tabs.update(tab.id, { pinned: true });
          await api.sessions.setTabValue(tab.id, GROUP_PINNED, false);
        }
      }
      state.settings = next;
      await save();
      if (wasGrouped !== next.groupPinnedTabs || previousSettings.nestedGroups !== next.nestedGroups || previousSettings.nestedTabsVisibility !== next.nestedTabsVisibility) {
        const records = await scan();
        for (const id of new Set(records.map((tab) => tab.windowId))) {
          const groupId = await active(id);
          const selected = records.find((tab) => tab.windowId === id && tab.active && !tab.pinned);
          if (selected && !visibleGroups(groupId).has(selected.groupId)) await activate(id, groupId);
          else await visibility(id, groupId);
        }
      }
    }
    else throw new Error("Неизвестная команда");
    return snapshot(windowId);
  }
  return {
    invalidate: (event) => {
      index.mark(event);
      if (event.type === "windowRemoved") sortedWindows.delete(event.windowId);
    },
    dispatch: (command, windowId) =>
      queue(async () => {
        try {
          const result = await execute(command, windowId);
          if (command.type !== "snapshot") {
            revision++;
            observedVersion = index.version;
            await save();
          }
          return structuredClone({
            ...result,
            revision,
            viewVersion: index.version + ":" + revision + ":" + identitiesVersion,
          });
        } catch (error) {
          await save();
          throw error;
        }
      }),
    get needsRefresh() {
      return index.dirty;
    },
    removed: (tabId, isWindowClosing) => {
      index.mark({ type: "removed", tabId });
      pendingRemovals.set(tabId, isWindowClosing);
      if (removing) return removing;
      removing = queue(async () => {
        while (pendingRemovals.size) {
          const batch = [...pendingRemovals];
          pendingRemovals.clear();
          for (const [id, closing] of batch) {
            forgetKnown(id);
            index.forgetRemoved(id);
          }
          revision++;
          await save();
        }
      }).finally(() => {
        removing = null;
      });
      return removing;
    },
    refresh: () => {
      if (refreshPending) return refreshPending;
      refreshPending = queue(async () => {
        const records = await scan();
        await toolbar?.setDynamic?.(state.settings?.dynamicIcon !== false).catch(console.error);
        await toolbar?.setStyle?.(state.settings?.markerStyle).catch(console.error);
        const windowIds = [...new Set(records.map((tab) => tab.windowId))];
        for (const windowId of windowIds) {
          const selected = records.find(
            (tab) => tab.windowId === windowId && tab.active && !tab.pinned,
          );
          const previous = await active(windowId);
          const groupId = selected && !visibleGroups(previous).has(selected.groupId) ? selected.groupId : previous;
          await api.sessions.setWindowValue(windowId, ACTIVE, groupId);
          await visibility(windowId, groupId, records);
          await toolbar?.update(windowId, group(groupId)).catch(console.error);
        }
        const changed = index.version !== observedVersion;
        if (changed) revision++;
        observedVersion = index.version;
        await save();
        return changed;
      }).finally(() => {
        refreshPending = null;
      });
      return refreshPending;
    },
  };
}
