import { normalizeSettings } from "./settings.js";
import { DEFAULT_SPACE_ID, SPACE_ICONS } from "./spaces.js";

export function parseTavvyBackup(data) {
    if (
        !data ||
        data.format !== "tavvy-backup" ||
        ![1, 2].includes(data.version) ||
        !Array.isArray(data.groups) ||
        !Array.isArray(data.tabs) ||
        !Array.isArray(data.archive) ||
        data.groups.length > 1000 ||
        data.tabs.length > 10000 ||
        data.archive.length > 200
    )
        throw new Error("Повреждённый или неподдерживаемый бэкап Tavvy");
    if (
        (data.version === 2 && !Array.isArray(data.spaces)) ||
        (data.version === 1 && data.spaces !== undefined)
    )
        throw new Error("Повреждённый или неподдерживаемый бэкап Tavvy");

    const spaceIds = new Set([DEFAULT_SPACE_ID]);
    const spaces = [];

    if (data.spaces !== undefined) {
        if (!Array.isArray(data.spaces) || data.spaces.length > 100)
            throw new Error("Повреждены данные пространств");

        for (const space of data.spaces) {
            if (
                !space ||
                typeof space.id !== "string" ||
                !space.id ||
                spaceIds.has(space.id) ||
                typeof space.name !== "string" ||
                !space.name.trim() ||
                space.name.length > 100 ||
                (space.icon !== undefined && !SPACE_ICONS.includes(space.icon))
            )
                throw new Error("Повреждены данные пространств");
            spaceIds.add(space.id);
            spaces.push({
                id: space.id,
                name: space.name,
                ...(space.icon ? { icon: space.icon } : {}),
            });
        }
    }

    const ids = new Set();
    const groups = data.groups.map((g) => {
        if (
            !g ||
            typeof g.id !== "string" ||
            !g.id ||
            ids.has(g.id) ||
            typeof g.title !== "string" ||
            !g.title.trim() ||
            typeof g.color !== "string" ||
            !/^(#[\da-f]{3,8}|hsla?\([\d.,%\s]+\)|rgba?\([\d.,%\s]+\))$/i.test(
                g.color,
            )
        )
            throw new Error("Повреждены данные группы");
        ids.add(g.id);

        const spaceId = g.spaceId || DEFAULT_SPACE_ID;

        if (!spaceIds.has(spaceId))
            throw new Error("Повреждены данные пространств");

        return {
            id: g.id,
            title: g.title.slice(0, 120),
            color: g.color,
            parentId: g.parentId ?? null,
            ...(spaceId === DEFAULT_SPACE_ID ? {} : { spaceId }),
        };
    });
    const map = new Map(groups.map((g) => [g.id, g]));

    for (const g of groups) {
        const seen = new Set([g.id]);
        let parent = g.parentId;

        while (parent !== null) {
            if (!map.has(parent) || seen.has(parent))
                throw new Error("Повреждена вложенность групп");
            seen.add(parent);
            parent = map.get(parent).parentId;
        }
    }

    const safe =
        /^(https?:\/\/|file:\/\/|moz-extension:\/\/[0-9a-f-]{36}\/(?:[^\s]*)$|about:blank$|about:newtab$|about:[a-z0-9-]+(?:[?#][^\s]*)?$)/i;

    function entry(t) {
        if (
            !t ||
            typeof t.url !== "string" ||
            !safe.test(t.url) ||
            !ids.has(t.groupId)
        )
            throw new Error("Повреждены данные вкладки");

        return {
            groupId: t.groupId,
            url: t.url,
            title: typeof t.title === "string" ? t.title.slice(0, 1000) : t.url,
            pinned: t.pinned === true,
            closedAt: Number.isFinite(t.closedAt) ? t.closedAt : Date.now(),
        };
    }

    return {
        groups,
        tabs: data.tabs.map(entry),
        archive: data.archive.map(entry),
        settings: normalizeSettings(data.settings),
        ...(data.spaces === undefined ? {} : { spaces }),
    };
}
