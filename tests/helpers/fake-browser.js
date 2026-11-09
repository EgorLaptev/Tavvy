import assert from "node:assert/strict";
import { createWorkspaceService } from "../../src/background/workspace-service.js";

/**
 * In-memory fake of the Firefox APIs the workspace service uses: three tabs in window 1
 * (the third pinned) and one in window 2. Session values live in `tags` ("tabId:key").
 */
export function fixture() {
  let next = 10,
    counter = 0;
  const values = {},
    tags = new Map(),
    windows = new Map();
  const records = [
    {
      id: 1,
      windowId: 1,
      title: "Первая",
      url: "https://example.com",
      active: true,
      index: 0,
      pinned: false,
    },
    {
      id: 2,
      windowId: 1,
      title: "Вторая",
      url: "https://mozilla.org",
      active: false,
      index: 1,
      pinned: false,
    },
    {
      id: 3,
      windowId: 1,
      title: "Закреплённая",
      url: "https://example.org",
      active: false,
      index: 2,
      pinned: true,
    },
    {
      id: 4,
      windowId: 2,
      title: "Другое окно",
      url: "https://example.net",
      active: true,
      index: 0,
      pinned: false,
    },
  ];
  const api = {
    runtime: { getURL: (path) => `moz-extension://test/${path}` },
    storage: {
      local: {
        get: async (key) => structuredClone({ [key]: values[key] }),
        set: async (data) => Object.assign(values, structuredClone(data)),
      },
    },
    sessions: {
      getTabValue: async (id, key) => tags.get(`${id}:${key}`),
      setTabValue: async (id, key, value) => tags.set(`${id}:${key}`, value),
      getWindowValue: async (id, key) => windows.get(`${id}:${key}`),
      setWindowValue: async (id, key, value) => windows.set(`${id}:${key}`, value),
    },
    tabs: {
      query: async () => structuredClone(records),
      get: async (id) => structuredClone(records.find((tab) => tab.id === id)),
      discard: async (id) => {
        records.find((tab) => tab.id === id).discarded = true;
      },
      create: async (options) => {
        const tab = {
          id: next++,
          index: records.length,
          title: "Новая вкладка",
          url: "about:newtab",
          pinned: false,
          hidden: false,
          ...options,
        };
        records.push(tab);
        return { ...tab };
      },
      update: async (id, options) => {
        const tab = records.find((t) => t.id === id);
        if (options.active)
          records
            .filter((t) => t.windowId === tab.windowId)
            .forEach((t) => (t.active = false));
        Object.assign(tab, options);
        if (typeof options.muted === "boolean") tab.mutedInfo = { muted: options.muted };
        return { ...tab };
      },
      show: async (ids) =>
        ids.forEach((id) => (records.find((t) => t.id === id).hidden = false)),
      hide: async (ids) => {
        ids.forEach((id) => {
          const tab = records.find((t) => t.id === id);
          assert.equal(tab.active, false, "never hide an active tab");
          assert.equal(tab.pinned, false, "never hide a pinned tab");
          tab.hidden = true;
        });
        return ids;
      },
      remove: async (id) => {
        records.splice(
          records.findIndex((t) => t.id === id),
          1,
        );
      },
      move: async (id, { index }) => {
        records.find((t) => t.id === id).index = index;
      },
    },
  };
  const service = () => createWorkspaceService(api, () => `id-${++counter}`);
  return { api, records, tags, windows, values, service };
}
