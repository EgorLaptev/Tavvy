// Browser data is hydrated once, then only dirty tabs/windows are read again.
// All writes update the cache immediately; native events are reconciled afterwards.
export function createTabIndex(browser, limit = 16) {
    const tabs = new Map(),
        sessions = new Map();
    const dirtyTabs = new Set(),
        dirtyWindows = new Set(),
        removed = new Set();
    let initialized = false,
        version = 0,
        orderVersion = 0,
        syncPromise;

    async function parallel(items, task) {
        let cursor = 0;

        await Promise.all(
            Array.from({ length: Math.min(limit, items.length) }, async () => {
                while (cursor < items.length) {
                    const index = cursor++;

                    await task(items[index]);
                }
            }),
        );
    }

    function put(tab) {
        if (!Number.isInteger(tab?.id) || removed.has(tab.id)) return;
        if (tab.active)
            for (const value of tabs.values())
                if (
                    value.windowId === tab.windowId &&
                    value.id !== tab.id &&
                    value.active
                )
                    tabs.set(value.id, { ...value, active: false });

        const old = tabs.get(tab.id);

        if (
            !old ||
            old.index !== tab.index ||
            old.windowId !== tab.windowId ||
            old.pinned !== tab.pinned
        )
            orderVersion++;

        const next = { ...old, ...tab };

        if (
            !old ||
            Object.keys(tab).some((key) => !Object.is(old[key], tab[key]))
        ) {
            tabs.set(tab.id, next);
            version++;
        }
    }

    async function value(id, key) {
        let values = sessions.get(id);

        if (!values) {
            values = new Map();
            sessions.set(id, values);
        }

        if (!values.has(key))
            values.set(
                key,
                Promise.resolve(browser.sessions.getTabValue(id, key)).catch(
                    (error) => {
                        values.delete(key);
                        throw error;
                    },
                ),
            );

        return values.get(key);
    }

    async function hydrate(tab) {
        if (tab.incognito) return;
        put(tab);

        try {
            await Promise.all([
                value(tab.id, "tavvy:group"),
                value(tab.id, "tavvy:import-metadata"),
            ]);
        } catch {
            /* Closed while being hydrated. */
        }
    }

    async function sync() {
        if (syncPromise) return syncPromise;
        if (initialized && !dirtyTabs.size && !dirtyWindows.size) return;
        syncPromise = (async () => {
            if (!initialized) {
                const initial = await browser.tabs.query({
                    windowType: "normal",
                });

                await parallel(initial, hydrate);
                initialized = true;
            }

            const windowIds = [...dirtyWindows];

            windowIds.forEach((id) => dirtyWindows.delete(id));
            await parallel(windowIds, async (windowId) => {
                let current;

                try {
                    current = await browser.tabs.query({ windowId });
                } catch {
                    return;
                }

                const live = new Set(current.map((t) => t.id));

                for (const [id, tab] of tabs)
                    if (tab.windowId === windowId && !live.has(id)) {
                        tabs.delete(id);
                        orderVersion++;
                        version++;
                    }

                await parallel(current, hydrate);
            });

            const ids = [...dirtyTabs];

            ids.forEach((id) => dirtyTabs.delete(id));
            await parallel(ids, async (id) => {
                if (removed.has(id)) return;

                try {
                    await hydrate(await browser.tabs.get(id));
                } catch {
                    tabs.delete(id);
                    sessions.delete(id);
                    orderVersion++;
                    version++;
                }
            });
        })();

        try {
            await syncPromise;
        } finally {
            syncPromise = null;
        }
    }

    function mark(event) {
        if (event.type === "updated" && tabs.has(event.tabId)) {
            put({ ...tabs.get(event.tabId), ...event.changes });

            return;
        }

        if (event.type === "activated" && tabs.has(event.tabId)) {
            put({
                ...tabs.get(event.tabId),
                windowId: event.windowId,
                active: true,
            });

            return;
        }

        if (event.type === "removed") {
            removed.add(event.tabId);
            tabs.delete(event.tabId);
            orderVersion++;
            sessions.delete(event.tabId);
            dirtyTabs.delete(event.tabId);
            version++;
            if (Number.isInteger(event.windowId))
                dirtyWindows.add(event.windowId);
        } else if (event.type === "windowRemoved") {
            dirtyWindows.delete(event.windowId);

            for (const [id, tab] of tabs)
                if (tab.windowId === event.windowId) {
                    tabs.delete(id);
                    sessions.delete(id);
                    orderVersion++;
                    version++;
                }
        } else if (event.type === "window") dirtyWindows.add(event.windowId);
        else if (Number.isInteger(event.tabId)) dirtyTabs.add(event.tabId);
    }

    async function writeGroup(id, key, data) {
        await browser.sessions.setTabValue(id, key, data);

        let values = sessions.get(id);

        if (!values) {
            values = new Map();
            sessions.set(id, values);
        }

        values.set(key, Promise.resolve(data));
        version++;
    }

    const api = {
        ...browser,
        sessions: {
            ...browser.sessions,
            getTabValue: value,
            setTabValue: writeGroup,
            // Window values are read live: Firefox changes them itself when it
            // restores a session, so a cached copy can silently go stale.
            getWindowValue: (id, key) =>
                browser.sessions.getWindowValue(id, key),
            async setWindowValue(id, key, data) {
                if ((await browser.sessions.getWindowValue(id, key)) === data)
                    return;
                await browser.sessions.setWindowValue(id, key, data);
                version++;
            },
        },
        tabs: {
            ...browser.tabs,
            async query(filter = {}) {
                await sync();

                return [...tabs.values()].filter(
                    (tab) =>
                        !removed.has(tab.id) &&
                        (filter.windowId === undefined ||
                            tab.windowId === filter.windowId),
                );
            },
            async create(options) {
                await sync();

                const tab = await browser.tabs.create(options);

                put(tab);

                return tab;
            },
            async update(id, options) {
                const tab = await browser.tabs.update(id, options);

                put(tab);

                return tab;
            },
            async remove(id) {
                await browser.tabs.remove(id);
                mark({ type: "removed", tabId: id });
            },
            async show(ids) {
                const changed = ids.filter((id) => tabs.get(id)?.hidden);

                if (changed.length) await browser.tabs.show(changed);
                for (const id of changed)
                    put({ ...tabs.get(id), hidden: false });
            },
            async hide(ids) {
                const changed = ids.filter((id) => !tabs.get(id)?.hidden);
                const hidden = changed.length
                    ? await browser.tabs.hide(changed)
                    : [];

                for (const id of hidden)
                    if (tabs.has(id)) put({ ...tabs.get(id), hidden: true });

                return hidden;
            },
            async discard(id) {
                await browser.tabs.discard(id);
                if (tabs.has(id)) put({ ...tabs.get(id), discarded: true });
            },
            async move(id, options) {
                const result = await browser.tabs.move(id, options);
                const ids = Array.isArray(id) ? id : [id];
                const sources = ids
                    .map((item) => tabs.get(item)?.windowId)
                    .filter((windowId) => windowId !== undefined);

                if (
                    Number.isInteger(options.windowId) &&
                    sources.some((windowId) => windowId !== options.windowId)
                ) {
                    // Moved to another window: the windows involved are read again.
                    for (const windowId of [...sources, options.windowId])
                        dirtyWindows.add(windowId);
                    for (const item of ids) dirtyTabs.add(item);

                    return result;
                }

                const old = tabs.get(id);

                if (old) {
                    const ordered = [...tabs.values()]
                        .filter(
                            (t) => t.windowId === old.windowId && t.id !== id,
                        )
                        .sort((a, b) => a.index - b.index);

                    ordered.splice(
                        options.index < 0 ? ordered.length : options.index,
                        0,
                        old,
                    );
                    ordered.forEach((tab, index) => put({ ...tab, index }));
                }

                for (const tab of Array.isArray(result)
                    ? result
                    : result
                      ? [result]
                      : [])
                    put(tab);

                return result;
            },
        },
    };

    return {
        api,
        sync,
        mark,
        get orderVersion() {
            return orderVersion;
        },
        get version() {
            return version;
        },
        get dirty() {
            return dirtyTabs.size > 0 || dirtyWindows.size > 0;
        },
        get removed() {
            return removed;
        },
        forgetRemoved(id) {
            removed.delete(id);
        },
        liveIds: () => new Set(tabs.keys()),
    };
}
