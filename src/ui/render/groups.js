import { spaceIcon } from "../../domain/spaces.js";
import { markerLetters } from "../../domain/group-marker.js";
import { element, icon, button, reorderChildren } from "../dom.js";
import { animatePanelChange } from "../panel-layout.js";
import { mountMarkers } from "../markers.js";
import { toggleExpanded, groupChildren } from "../state/tree.js";
import { groupTitle, groupSpace } from "../state/labels.js";
import { renderGroupStatus } from "./status-icons.js";
import { startGroupRename } from "./group-rename.js";
import { t } from "../../locales/index.js";

/**
 * Group cards (`section.group[data-group-id]`) and the panel render. Cards are created once
 * per group and reused, so focus and running animations survive snapshot updates.
 */
export function createGroupList(ctx) {
  const { container } = ctx;

  function contains(outerId, innerId) {
    const outer = ctx.groupViews.get(outerId)?.node, inner = ctx.groupViews.get(innerId)?.node;
    return !!(outer && inner && outer.contains(inner));
  }

  function create(group) {
    const node = element("section", "group");
    node.dataset.groupId = group.id;
    const controls = element("div", "group-controls"),
      marker = element("span", "marker"),
      title = element("strong");
    const header = button(groupTitle(group, t), "group-header", marker, () =>
      ctx.run({ type: "activateGroup", groupId: group.id }),
    );
    const spaceGlyph = element("span", "spaces-icon spaces-icon-container");
    spaceGlyph.setAttribute("aria-hidden", "true");
    const spaceLabel = button(t("spaces.title"), "group-space-label", spaceGlyph, (event) => {
      event.stopPropagation();
      if (ctx.menu.isOpen()) ctx.menu.reset();
      ctx.containerPicker.show(group.id, spaceLabel);
    });
    spaceLabel.setAttribute("aria-haspopup", "menu");
    spaceLabel.setAttribute("aria-expanded", "false");
    header.append(title);
    const colorInput = button(`${t("groups.group_color")}: ${group.title}`, "group-color-input", document.createTextNode(""), () =>
      ctx.palette.toggle(colorInput, group.id),
    );
    colorInput.setAttribute("aria-expanded", "false");
    colorInput.setAttribute("aria-haspopup", "true");
    const count = element("span", "count");
    const toggle = button(t("groups.show_tabs"), "group-toggle", count, () =>
      animatePanelChange(() => {
        toggleExpanded(ctx.opened, group.id, contains);
        render();
      }),
    );
    toggle.setAttribute("aria-expanded", "false");
    toggle.append(icon("m6 4 4 4-4 4", "arrow"));
    const add = button(
      t("groups.new_tab_in_group"),
      "add-subgroup",
      document.createTextNode("+"),
      () => ctx.run({ type: "createTab", groupId: group.id }),
    );
    const statuses = element("span", "tab-statuses group-statuses");
    controls.append(header, colorInput, add, statuses, spaceLabel, toggle);
    const tabs = element("div", "tabs is-closed"),
      inner = element("div", "tabs-inner"),
      children = element("div", "subgroups");
    tabs.append(inner);
    node.append(controls, tabs, children);
    const view = {
      node,
      controls,
      title,
      spaceLabel,
      spaceGlyph,
      statuses,
      header,
      count,
      marker,
      colorInput,
      toggle,
      tabs,
      inner,
      children,
    };
    controls.addEventListener("contextmenu", (event) =>
      ctx.groupMenu.open(event, group, () => startGroupRename(ctx, view, group.id)),
    );
    return view;
  }

  function update(view, group) {
    const { snapshot, viewIndex } = ctx;
    // Compare the displayed (translated) title, so the default group is not rewritten every render.
    const title = groupTitle(group, t);
    if (view.title.textContent !== title || view.rawTitle !== group.title) {
      view.rawTitle = group.title;
      view.title.textContent = title;
      view.marker.dataset.label = markerLetters(group.title);
      view.marker.dataset.label2 = markerLetters(group.title, 2);
      view.colorInput.setAttribute("aria-label", `${t("groups.group_color")}: ${group.title}`);
    }
    if (view.color !== group.color) {
      view.marker.style.background = group.color;
      view.marker.style.setProperty("--marker-color", group.color);
      view.color = group.color;
    }
    const { space, label: spaceLabel } = groupSpace(group, snapshot.spaces, t);
    view.spaceLabel.hidden = !group.spaceId;
    view.spaceGlyph.style.maskImage = group.spaceId ? `url("${ctx.spaceIconUrl(spaceIcon(space?.icon))}")` : "";
    view.spaceLabel.title = spaceLabel;
    view.spaceLabel.setAttribute("aria-label", view.spaceLabel.title);
    view.header.setAttribute("aria-label", group.spaceId ? `${title} — ${view.spaceLabel.title}` : title);
    renderGroupStatus(view.statuses, viewIndex.groupStatus.get(group.id) || 0);
    const count = String(viewIndex.byGroup.get(group.id)?.length || 0);
    if (view.count.textContent !== count) view.count.textContent = count;
    view.node.classList.toggle("active", group.id === snapshot.activeGroupId);
    view.node.hidden = !ctx.filterResult.visible.has(group.id);
  }

  /** Puts every card under its parent (or the panel) in snapshot order. */
  function layout() {
    const { snapshot, viewIndex, groupViews } = ctx;
    const ids = groupChildren(snapshot.groups, viewIndex.groups, snapshot.settings.nestedGroups !== false);
    const children = new Map([...ids].map(([parent, list]) => [parent, list.map((id) => groupViews.get(id).node)]));
    // Reparent before removing obsolete child positions.
    for (const [parent, rows] of children)
      if (parent)
        for (const node of rows) {
          const target = groupViews.get(parent).children;
          if (node.parentElement !== target) target.append(node);
        }
    for (const [id, view] of groupViews)
      reorderChildren(view.children, children.get(id) || []);
    reorderChildren(container, [...(children.get(null) || []), ...ctx.newGroup.nodes]);
  }

  function render() {
    if (ctx.disposed) return;
    const { snapshot, viewIndex, groupViews } = ctx;
    const query = ctx.search.value.trim().toLocaleLowerCase();
    ctx.filterResult = viewIndex.search(query);
    for (const [id, view] of groupViews)
      if (!viewIndex.groups.has(id)) {
        view.node.remove();
        groupViews.delete(id);
        ctx.opened.delete(id);
      }
    for (const group of snapshot.groups) {
      let view = groupViews.get(group.id);
      if (!view) {
        view = create(group);
        groupViews.set(group.id, view);
        ctx.dragTargetsDirty = true;
      }
      update(view, group);
    }
    layout();
    ctx.tabLists.render();
    mountMarkers();
  }

  /** Drops every card so the next render rebuilds them, e.g. after a language change. */
  function reset() {
    for (const view of ctx.groupViews.values()) view.node.remove();
    ctx.groupViews.clear();
    ctx.tabViews.clear();
  }

  return { render, reset };
}
