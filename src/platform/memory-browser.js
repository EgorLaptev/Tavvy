// In-memory browser adapter for preview and repeatable performance tests.
// It never opens, hides or closes the user's real browser tabs.
export function createMemoryBrowser({
  groups,
  tabs,
  settings = {},
  onSettings = () => {},
}) {
  const storage = new Map([
      [
        "tavvy:workspace:v1",
        {
          version: 1,
          groups: structuredClone(groups),
          known: {},
          archive: [],
          settings,
        },
      ],
    ]),
    sessions = new Map(),
    windowValues = new Map(),
    listeners = new Set();
  let nextId = Math.max(0, ...tabs.map((tab) => tab.id)) + 1;
  const records = new Map(
    tabs.map((tab) => [
      tab.id,
      {
        active: false,
        pinned: false,
        hidden: false,
        audible: false,
        discarded: false,
        ...tab,
      },
    ]),
  );
  for (const tab of tabs) sessions.set(tab.id + ":tavvy:group", tab.groupId);
  let service;
  const api = {
    isDemo: true,
    bind(value) {
      service = value;
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: structuredClone(storage.get(key)) };
        },
        async set(values) {
          for (const [key, value] of Object.entries(values))
            storage.set(key, structuredClone(value));
          if (values["tavvy:workspace:v1"])
            onSettings(values["tavvy:workspace:v1"].settings);
        },
      },
    },
    sessions: {
      async getTabValue(id, key) {
        return sessions.get(id + ":" + key);
      },
      async setTabValue(id, key, value) {
        sessions.set(id + ":" + key, structuredClone(value));
      },
      async getWindowValue(id, key) {
        return windowValues.get(id + ":" + key);
      },
      async setWindowValue(id, key, value) {
        windowValues.set(id + ":" + key, value);
      },
    },
    windows: {
      async getCurrent() {
        return { id: 1, incognito: false };
      },
    },
    runtime: {
      getURL: (path) => path,
      onMessage: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
      },
      async sendMessage(message) {
        try {
          const snapshot = await service.dispatch(
            message.command,
            message.windowId,
          );
          if (message.command.type !== "snapshot")
            for (const listener of listeners)
              listener({ channel: "tavvy", type: "changed" });
          return { ok: true, snapshot };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      },
    },
    tabs: {
      async query(filter = {}) {
        return [...records.values()]
          .filter(
            (tab) =>
              filter.windowId === undefined || tab.windowId === filter.windowId,
          )
          .map((tab) => ({ ...tab }));
      },
      async get(id) {
        if (!records.has(id)) throw new Error("Вкладка закрыта");
        return { ...records.get(id) };
      },
      async getCurrent() {
        return null;
      },
      async create(options) {
        const tab = {
          id: nextId++,
          index: records.size,
          title: options.title || "Новая вкладка",
          url: "about:newtab",
          pinned: false,
          active: false,
          hidden: false,
          audible: false,
          discarded: false,
          ...options,
        };
        records.set(tab.id, tab);
        return { ...tab };
      },
      async update(id, options) {
        const tab = records.get(id);
        if (options.active)
          for (const item of records.values())
            if (item.windowId === tab.windowId) item.active = false;
        Object.assign(tab, options);
        if (options.active) tab.discarded = false;
        return { ...tab };
      },
      async remove(id) {
        records.delete(id);
      },
      async show(ids) {
        for (const id of ids) records.get(id).hidden = false;
      },
      async hide(ids) {
        for (const id of ids) records.get(id).hidden = true;
        return ids;
      },
      async discard(id) {
        records.get(id).discarded = true;
      },
      async move(id, { index }) {
        const tab = records.get(id);
        const ordered = [...records.values()]
          .filter((item) => item.windowId === tab.windowId && item.id !== id)
          .sort((a, b) => a.index - b.index);
        ordered.splice(index < 0 ? ordered.length : index, 0, tab);
        ordered.forEach((item, position) => (item.index = position));
        return { ...tab };
      },
    },
  };
  return api;
}
