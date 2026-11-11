import { buildViewIndex, snapshotChanged } from "../view-index.js";
import { animatePanelChange } from "../panel-layout.js";
import { pathToGroup, collapseSubtree } from "./tree.js";
import { t, format } from "../../locales/index.js";

/** Status line after a Simple Tab Groups import, or null when the snapshot has no report. */
export function importReportMessage(report) {
    if (!report) return null;
    return report.alreadyImported
        ? t("import_page.this_backup_has_already_been_imported")
        : format("import_page.import_summary", {
              groups: report.groups,
              tabs: report.tabs,
              pinned: report.pinnedTabs,
          });
}

/**
 * Applies confirmed snapshots to the popup state on `ctx`: `snapshot`, its `viewIndex`, and
 * the set of expanded groups `opened`. The command client calls these hooks in order.
 */
export function createViewState(ctx) {
    function setSnapshot(next) {
        const changed = !ctx.snapshot || snapshotChanged(ctx.snapshot, next);
        ctx.snapshot = next;
        if (changed) ctx.viewIndex = buildViewIndex(next);
        return changed;
    }

    /** Remembers the group of a tab being closed, so the group can collapse once it is empty. */
    function beforeCommand(command) {
        return command.type === "closeTab"
            ? { closedGroup: ctx.viewIndex.tabs.get(command.tabId)?.groupId }
            : {};
    }

    function applyResponse(command, next, { closedGroup } = {}) {
        const changed = setSnapshot(next);
        const { snapshot, viewIndex } = ctx;
        const nested = snapshot.settings.nestedGroups !== false;
        // A new tab is shown by expanding the path to its group.
        if (command.type === "createTab")
            ctx.opened = pathToGroup(command.groupId, viewIndex.groups, nested);
        if (closedGroup && !viewIndex.byGroup.get(closedGroup)?.length)
            collapseSubtree(
                ctx.opened,
                closedGroup,
                (id) => viewIndex.groups.get(id)?.parentId,
            );
        // Selecting a group switches the window; the popup closes like Firefox panels do.
        if (command.type === "activateGroup" && !ctx.api.isDemo) {
            window.close();
            return;
        }
        if (changed || command.type === "createTab")
            animatePanelChange(ctx.render);
        if (command.type === "importStg") {
            const message = importReportMessage(snapshot.importReport);
            if (message) ctx.status.textContent = message;
        }
    }

    return { setSnapshot, beforeCommand, applyResponse };
}
