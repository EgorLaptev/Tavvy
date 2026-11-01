import { createTabIndex } from "../platform/tab-index.js";
import { parseStgBackup, stgFingerprint } from "../domain/stg-import.js";
import { normalizeSettings } from "../domain/settings.js";
import { parseTavvyBackup } from "../domain/tavvy-backup.js";
const KEY = "tavvy:workspace:v1";
const TAG = "tavvy:group";
const ACTIVE = "tavvy:active-group";
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
    observedVersion = -1;
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
  async function active(windowId) {
    const value = await api.sessions.getWindowValue(windowId, ACTIVE);
    return state.groups.some((g) => g.id === value) ? value : "inbox";
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
          const utility = api.runtime?.getURL?.("import.html");
          if (
            utility &&
            (tab.url === utility || tab.url?.startsWith(utility + "?"))
          ) {
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
  async function snapshot(windowId) {
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
    const tabs = sorted.ids.map((id) => recordsById.get(id)).filter(Boolean);
    const activeGroupId = await active(windowId);
    await toolbar?.setDynamic?.(state.settings?.dynamicIcon !== false).catch(console.error);
    await toolbar?.setStyle?.(state.settings.markerStyle).catch(console.error);
    await toolbar?.update(windowId, group(activeGroupId)).catch(console.error);
    return {
      revision,
      groups: state.groups,
      tabs,
      archive: state.archive,
      activeGroupId,
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
      target = await api.tabs.create({ windowId, active: false });
      await api.sessions.setTabValue(target.id, TAG, groupId);
    }
    await api.tabs.show([
      ...new Set([...tabs.map((tab) => tab.id), target.id]),
    ]);
    await api.tabs.update(target.id, { active: true });
    await api.sessions.setWindowValue(windowId, ACTIVE, groupId);
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
  function archive(record) {
    if (state.settings?.archiveEnabled === false || !record || record.pinned) return;
    state.archive.unshift({
      id: id(),
      title: record.title,
      url: record.url,
      faviconUrl: record.faviconUrl,
      groupId: record.groupId,
      closedAt: Date.now(),
    });
    state.archive = state.archive.slice(0, 200);
  }
  function safeUrl(url) {
    if (
      api.runtime?.getURL &&
      url.startsWith(api.runtime.getURL("local-file.html") + "#")
    )
      return url;
    return /^(https?:|file:)/i.test(url) ||
      url === "about:blank" ||
      url === "about:newtab"
      ? url
      : undefined;
  }
  async function importStg(data, windowId) {
    const plan = parseStgBackup(data);
    const fingerprint = await stgFingerprint(plan);
    state.imports ??= {};
    let job = state.imports[fingerprint];
    if (job?.complete) {
      state.importReport = { ...job.report, alreadyImported: true };
      return;
    }
    if (!job) {
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
        if (typeof marker === "string") existingByMarker.set(marker, tab);
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
        const local = record.url.startsWith("file:");
        const url = local
          ? api.runtime.getURL("local-file.html") +
            "#" +
            encodeURIComponent(
              JSON.stringify({ url: record.url, title: record.title }),
            )
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
      const safe = /^(https?:\/\/|file:\/\/|about:blank$|about:newtab$)/i;
      const ids = new Set(state.groups.map((g) => g.id));
      const serialize = (entry) => {
        let url = entry.url;
        if (url?.includes("/local-file.html#")) {
          try { url = JSON.parse(decodeURIComponent(url.split("#")[1])).url; } catch {}
        }
        return { groupId: ids.has(entry.groupId) ? entry.groupId : "inbox", title: entry.title, url, pinned: !!(entry.pinned || entry.managedPinned), ...(entry.closedAt ? { closedAt: entry.closedAt } : {}) };
      };
      return { format: "tavvy-backup", version: 1, createdAt: new Date().toISOString(), groups: structuredClone(state.groups), tabs: records.map(serialize).filter((t) => safe.test(t.url)), archive: state.archive.map(serialize).filter((t) => safe.test(t.url)), settings: normalizeSettings(state.settings) };
    }
    if (type === "importBackup") {
      const plan = parseTavvyBackup(command.backup);
      const mapping = new Map(plan.groups.map((g) => [g.id, g.id === "inbox" ? "inbox" : id()]));
      for (const g of plan.groups) if (g.id !== "inbox") state.groups.push({ id: mapping.get(g.id), title: g.title, color: g.color, parentId: g.parentId ? mapping.get(g.parentId) : null });
      await save();
      const selected = await active(windowId);
      for (const entry of plan.tabs) {
        const local = entry.url.startsWith("file:");
        const url = local ? api.runtime.getURL("local-file.html") + "#" + encodeURIComponent(JSON.stringify({ url: entry.url, title: entry.title })) : entry.url;
        const tab = await api.tabs.create({ windowId, active: false, pinned: entry.pinned, ...(url === "about:newtab" ? {} : { url }), ...(!entry.pinned && !url.startsWith("about:") ? { discarded: true, title: entry.title } : {}) });
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
    if (type === "createGroup") {
      const title = String(command.title ?? "")
        .trim()
        .slice(0, 100);
      if (!title) throw new Error("Введите название группы");
      if (command.parentId) group(command.parentId);
      state.groups.push({
        id: id(),
        title,
        color: colors[state.groups.length % colors.length],
        parentId: command.parentId || null,
      });
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
      const tab = await api.tabs.create({ windowId, active: false });
      await api.sessions.setTabValue(tab.id, TAG, command.groupId);
      await activate(windowId, command.groupId, tab.id);
    } else if (
      type === "activateTab" ||
      type === "toggleTabMute" ||
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
        archive(tab);
        forgetKnown(tab.id);
      }
      if (type === "moveTab") {
        group(command.groupId);
        await api.sessions.setTabValue(tab.id, TAG, command.groupId);
        if (Number.isInteger(command.index))
          await api.tabs.move(tab.id, { index: command.index });
        if (tab.active) await activate(windowId, command.groupId, tab.id);
        else await visibility(windowId, await active(windowId));
      }
    } else if (type === "restoreTab") {
      const entry = state.archive.find((entry) => entry.id === command.entryId);
      if (!entry) throw new Error("Запись архива не найдена");
      const groupId = state.groups.some((g) => g.id === entry.groupId)
        ? entry.groupId
        : "inbox";
      const url = safeUrl(entry.url);
      const tab = await api.tabs.create({
        windowId,
        active: false,
        ...(url ? { url } : {}),
      });
      await api.sessions.setTabValue(tab.id, TAG, groupId);
      await activate(windowId, groupId, tab.id);
      state.archive = state.archive.filter((item) => item.id !== entry.id);
    } else if (type === "deleteArchivedTab") {
      state.archive = state.archive.filter(
        (item) => item.id !== command.entryId,
      );
    } else if (type === "clearArchive") state.archive = [];
    else if (type === "moveGroup") {
      const moving = group(command.groupId);
      const parentId = state.settings?.nestedGroups === false ? moving.parentId : command.parentId;
      let parent = parentId ? group(parentId) : null;
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
      const currentTabs = await scan();
      const windowGroups = new Map();
      for (const tab of currentTabs)
        if (!windowGroups.has(tab.windowId))
          windowGroups.set(tab.windowId, await active(tab.windowId));
      for (const tab of currentTabs)
        if (tab.groupId === deleting.id)
          await api.sessions.setTabValue(tab.id, TAG, "inbox");
      for (const child of state.groups)
        if (child.parentId === deleting.id) child.parentId = deleting.parentId;
      state.groups = state.groups.filter((item) => item.id !== deleting.id);
      // Deleting a group never closes its real tabs.
      for (const [affectedWindowId, activeId] of windowGroups) {
        if (activeId === deleting.id) await activate(affectedWindowId, "inbox");
        else await visibility(affectedWindowId, activeId);
      }
    } else if (type === "saveSettings") {
      const next = normalizeSettings(command.settings);
      const previousSettings = normalizeSettings(state.settings);
      if (state.settings?.archiveEnabled === false && next.archiveEnabled) {
        state.archive = [];
      }
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
            viewVersion: index.version + ":" + revision,
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
            if (!closing) archive(state.known[id]);
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
