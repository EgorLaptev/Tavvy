// In-memory browser adapter for preview and repeatable performance tests.
// It never opens, hides or closes the user's real browser tabs.
export function createMemoryBrowser({
    groups,
    tabs,
    settings = {},
    onSettings = () => {},
    containers = null,
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
            async create({ tabId } = {}) {
                const id =
                    Math.max(
                        1,
                        ...[...records.values()].map((tab) => tab.windowId),
                    ) + 1;
                const tab = records.get(tabId);

                if (tab)
                    Object.assign(tab, {
                        windowId: id,
                        index: 0,
                        active: true,
                    });

                return { id, tabs: tab ? [{ ...tab }] : [] };
            },
            async update(id) {
                return { id };
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
                            filter.windowId === undefined ||
                            tab.windowId === filter.windowId,
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
                    title: options.title || "New tab",
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
                if (typeof options.muted === "boolean")
                    tab.mutedInfo = { muted: options.muted };
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
            async reload(id) {
                if (!records.has(id)) throw new Error("Вкладка закрыта");
            },
            async discard(id) {
                records.get(id).discarded = true;
            },
            async move(ids, { index, windowId }) {
                const moved = [];

                for (const id of Array.isArray(ids) ? ids : [ids]) {
                    const tab = records.get(id);

                    if (Number.isInteger(windowId) && windowId !== tab.windowId)
                        Object.assign(tab, { windowId, active: false });

                    const ordered = [...records.values()]
                        .filter(
                            (item) =>
                                item.windowId === tab.windowId &&
                                item.id !== id,
                        )
                        .sort((a, b) => a.index - b.index);

                    ordered.splice(index < 0 ? ordered.length : index, 0, tab);
                    ordered.forEach(
                        (item, position) => (item.index = position),
                    );
                    moved.push({ ...tab });
                }

                return Array.isArray(ids) ? moved : moved[0];
            },
        },
    };

    if (containers) {
        const identities = structuredClone(containers);
        let granted = settings.experimentalSpaces === true;

        api.permissions = {
            async request() {
                granted = true;

                return true;
            },
            async contains() {
                return granted;
            },
        };
        api.contextualIdentities = {
            async query() {
                return structuredClone(identities);
            },
            async create({ name, color, icon }) {
                const used = new Set(
                    identities.map((item) => item.cookieStoreId),
                );
                let number = 1;

                while (used.has(`firefox-container-${number}`)) number++;

                const identity = {
                    name,
                    color,
                    icon,
                    cookieStoreId: `firefox-container-${number}`,
                };

                identities.push(identity);

                return structuredClone(identity);
            },
            async get(cookieStoreId) {
                const identity = identities.find(
                    (item) => item.cookieStoreId === cookieStoreId,
                );

                if (!identity)
                    throw new Error(
                        `Invalid contextual identity: ${cookieStoreId}`,
                    );

                return structuredClone(identity);
            },
            async update(cookieStoreId, details) {
                const identity = identities.find(
                    (item) => item.cookieStoreId === cookieStoreId,
                );

                if (!identity)
                    throw new Error(
                        `Invalid contextual identity: ${cookieStoreId}`,
                    );
                Object.assign(identity, details);

                return structuredClone(identity);
            },
        };
    }

    return api;
}
