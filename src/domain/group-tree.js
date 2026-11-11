// Pure operations on the group list. Array order is display order.
export const INBOX_ID = "inbox";
export const GROUP_COLORS = [
    "#398dff",
    "#a855f7",
    "#00c98a",
    "#ff7800",
    "#ff168a",
];
export const MAX_GROUP_TITLE = 100;

export function defaultInbox() {
    return {
        id: INBOX_ID,
        title: "Основная",
        color: GROUP_COLORS[0],
        parentId: null,
    };
}

export function findGroup(groups, groupId) {
    const found = groups.find((item) => item.id === groupId);
    if (!found) throw new Error("Группа не найдена");
    return found;
}

export function hasGroup(groups, groupId) {
    return groups.some((item) => item.id === groupId);
}

export function nextGroupColor(groups) {
    return GROUP_COLORS[groups.length % GROUP_COLORS.length];
}

/**
 * Groups whose tabs are shown while `groupId` is selected:
 * only the group itself, its descendants ("children" mode) or its ancestors.
 */
export function visibleGroupIds(groups, groupId, settings) {
    if (settings?.nestedGroups === false) return new Set([groupId]);
    if (settings?.nestedTabsVisibility === "children") {
        const children = new Map();
        for (const item of groups) {
            if (!children.has(item.parentId)) children.set(item.parentId, []);
            children.get(item.parentId).push(item.id);
        }
        const visible = new Set([groupId]);
        const pending = [groupId];
        while (pending.length) {
            for (const child of children.get(pending.pop()) || []) {
                if (!visible.has(child)) {
                    visible.add(child);
                    pending.push(child);
                }
            }
        }
        return visible;
    }
    const byId = new Map(groups.map((item) => [item.id, item]));
    const visible = new Set();
    let current = groupId;
    while (current && byId.has(current) && !visible.has(current)) {
        visible.add(current);
        current = byId.get(current).parentId;
    }
    return visible;
}

/** Throws when nesting `groupId` under `parentId` would create a cycle. */
export function assertNoCycle(groups, groupId, parentId) {
    let parent = parentId ? findGroup(groups, parentId) : null;
    while (parent) {
        if (parent.id === groupId)
            throw new Error("Нельзя вложить группу в саму себя");
        parent = parent.parentId ? findGroup(groups, parent.parentId) : null;
    }
}

/** Returns a new list with `moving` placed before `beforeId` (or last). */
export function placeGroup(groups, moving, beforeId) {
    const rest = groups.filter((item) => item.id !== moving.id);
    const before = rest.findIndex((item) => item.id === beforeId);
    rest.splice(before < 0 ? rest.length : before, 0, moving);
    return rest;
}

/** Removes a group and attaches its children to its parent. */
export function removeGroup(groups, groupId) {
    const removed = findGroup(groups, groupId);
    for (const child of groups)
        if (child.parentId === groupId) child.parentId = removed.parentId;
    return groups.filter((item) => item.id !== groupId);
}

export function normalizeNewTitle(value) {
    const title = String(value ?? "")
        .trim()
        .slice(0, MAX_GROUP_TITLE);
    if (!title) throw new Error("Введите название группы");
    return title;
}

export function normalizeRenamedTitle(value) {
    if (
        typeof value !== "string" ||
        value.length > MAX_GROUP_TITLE ||
        !value.trim()
    )
        throw new Error("Введите название группы");
    return value.trim();
}

export function normalizeGroupColor(value) {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
        throw new Error("Некорректный цвет группы");
    return value.toLowerCase();
}
