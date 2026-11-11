import { parseStgBackup } from "./stg-import.js";
import { parseTavvyBackup } from "./tavvy-backup.js";

// Validate before displaying a summary; the original data is still validated
// again by the background before it changes any browser state.
export function previewBackup(data) {
    if (data?.format === "tavvy-backup") {
        const plan = parseTavvyBackup(data);
        const counts = new Map(plan.groups.map((group) => [group.id, 0]));
        let pinned = 0;
        for (const tab of plan.tabs) {
            if (tab.pinned) pinned++;
            else counts.set(tab.groupId, (counts.get(tab.groupId) || 0) + 1);
        }
        return {
            groups: plan.groups.map((group) => ({
                title: group.title,
                tabs: counts.get(group.id) || 0,
            })),
            tabs: plan.tabs.length - pinned,
            pinned,
            spaces: plan.spaces?.length || 0,
            legacy: plan.archive.length,
        };
    }
    const plan = parseStgBackup(data);
    return {
        groups: plan.groups.map((group) => ({
            title: group.title,
            tabs: group.tabs.length,
        })),
        tabs: plan.groups.reduce(
            (count, group) => count + group.tabs.length,
            0,
        ),
        pinned: plan.pinnedTabs.length,
        spaces: 0,
        legacy: 0,
    };
}
