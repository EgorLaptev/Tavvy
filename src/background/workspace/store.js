import { normalizeSettings } from "../../domain/settings.js";
import { defaultInbox } from "../../domain/group-tree.js";
import { KNOWN_KEY, LAST_ACTIVE_GROUP_KEY, WORKSPACE_KEY } from "./keys.js";

function defaultState() {
    return {
        version: 1,
        groups: [defaultInbox()],
        archive: [],
        known: {},
        settings: normalizeSettings(null),
    };
}

/** Upgrades a stored workspace in place to the current in-memory shape. */
export function migrateWorkspace(state) {
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
    return state;
}

function compactKnown(known) {
    return Object.fromEntries(
        Object.entries(known || {}).map(([id, tab]) => [
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

/**
 * Owns the persisted workspace (`tavvy:workspace:v1`) and the compact records of
 * open tabs (`tavvy:known:v1`). Writes only what changed since the last save.
 */
export function createWorkspaceStore(storage) {
    let state;
    let savedState, savedKnown;
    let knownRevision = 0,
        savedKnownRevision = -1;

    let lastActiveGroupId = null;
    /** No workspace was stored yet: the windows open at installation join the default group. */
    let firstRun = false;

    const ready = storage.get(WORKSPACE_KEY).then(async (data) => {
        const stored = data[WORKSPACE_KEY];
        const known = await storage.get(KNOWN_KEY);
        // Tab records without a workspace mean the groups were lost or are unreadable.
        // Starting with defaults would let tabs be reassigned and the real data overwritten.
        if (!stored && Object.keys(known[KNOWN_KEY] || {}).length)
            throw new Error(
                "Данные групп Tavvy не найдены. Восстановите резервную копию.",
            );
        firstRun = !stored;
        state = migrateWorkspace(stored ?? defaultState());
        if (known[KNOWN_KEY]) state.known = known[KNOWN_KEY];
        lastActiveGroupId =
            (await storage.get(LAST_ACTIVE_GROUP_KEY))[LAST_ACTIVE_GROUP_KEY] ??
            null;
        // A new or legacy workspace (one that embeds `known`) is written on the next save.
        savedState =
            !stored || stored.known
                ? null
                : JSON.stringify({ ...state, known: undefined });
        savedKnown = known[KNOWN_KEY]
            ? JSON.stringify(compactKnown(state.known))
            : "";
        savedKnownRevision = known[KNOWN_KEY] ? knownRevision : -1;
    });

    async function save() {
        const persisted = { ...state };
        delete persisted.known;
        const nextState = JSON.stringify(persisted);
        const changes = {};
        if (nextState !== savedState) changes[WORKSPACE_KEY] = persisted;
        let nextKnown = savedKnown;
        if (knownRevision !== savedKnownRevision) {
            const data = compactKnown(state.known);
            nextKnown = JSON.stringify(data);
            if (nextKnown !== savedKnown) changes[KNOWN_KEY] = data;
        }
        if (Object.keys(changes).length) await storage.set(changes);
        savedState = nextState;
        savedKnown = nextKnown;
        savedKnownRevision = knownRevision;
    }

    return {
        ready,
        save,
        get state() {
            return state;
        },
        /** Records the latest description of an open tab. */
        remember(record, changed) {
            if (changed) knownRevision++;
            state.known[record.id] = record;
        },
        forget(tabId) {
            if (state.known[tabId]) {
                delete state.known[tabId];
                knownRevision++;
            }
        },
        get firstRun() {
            return firstRun;
        },
        /** Called once every open window has been assigned. */
        endFirstRun() {
            firstRun = false;
        },
        get lastActiveGroupId() {
            return lastActiveGroupId;
        },
        async setLastActiveGroupId(groupId) {
            if (groupId === lastActiveGroupId) return;
            lastActiveGroupId = groupId;
            await storage.set({ [LAST_ACTIVE_GROUP_KEY]: groupId });
        },
        knownTab: (tabId) => state.known[tabId],
        knownIds: () => Object.keys(state.known),
    };
}
