import { groupMoveTargets } from "./menu-model.js";
import { groupTitle } from "../state/labels.js";
import { t } from "../../locales/index.js";

/** Context menu of a group header. */
export function createGroupMenu(ctx) {
  const { menu } = ctx;

  function addMoveToGroup(group) {
    const current = ctx.viewIndex.groups.get(group.id);
    const entries = groupMoveTargets(ctx.snapshot.groups, ctx.viewIndex.groups, group.id).map((item) => ({
      label: groupTitle(item, t),
      group: item,
      action: () => ctx.run({ type: "moveGroup", groupId: group.id, parentId: item.id }),
    }));
    if (current.parentId) entries.unshift({ label: t("groups.move_to_root"), root: true, action: () => ctx.run({ type: "moveGroup", groupId: group.id, parentId: null }) });
    menu.addSubmenu(t("groups.move_to_group"), entries, "group-context-move-group");
  }

  /** `rename` starts the inline title editor of this group. */
  function open(event, group, rename) {
    event.preventDefault();
    event.stopPropagation();
    menu.reset();
    menu.menu.replaceChildren();
    menu.addAction(t("groups.rename_group"), rename);
    menu.addAction(t("groups.reload_group"), () => ctx.run({ type: "reloadGroup", groupId: group.id }));
    menu.addAction(t("groups.open_in_new_window"), () => ctx.run({ type: "openGroupInNewWindow", groupId: group.id }));
    if (ctx.snapshot.settings.nestedGroups !== false && group.id !== "inbox") addMoveToGroup(group);
    menu.addSubmenuTrigger(t("groups.move_to_container"), (trigger) => ctx.containerPicker.show(group.id, trigger), false, "group-context-move");
    menu.addAction(t("groups.clear_group"), () => { if (window.confirm(t("groups.clear_confirm"))) ctx.run({ type: "clearGroup", groupId: group.id }); }, false, "group-context-clear");
    menu.addAction(t("groups.delete_group"), () => ctx.run({ type: "deleteGroup", groupId: group.id }), group.id === "inbox", "group-context-delete");
    menu.openAt(event);
  }

  return { open };
}
