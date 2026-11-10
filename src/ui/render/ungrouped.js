import { element, icon, button } from "../dom.js";
import { animatePanelChange } from "../panel-layout.js";
import { t } from "../../locales/index.js";

/**
 * The "No group" card above the groups: tabs without a group, like Simple Tab Groups'
 * unsynced tabs. They are visible in a window without a group and hidden once the window
 * shows a group; clicking one opens it here. Shown only while such tabs exist.
 */
export function createUngroupedList(ctx) {
  let open = false;
  const node = element("section", "group ungrouped");
  const controls = element("div", "group-controls"),
    title = element("strong"),
    count = element("span", "count");
  const toggle = button(t("groups.show_tabs"), "group-toggle", count, () =>
    animatePanelChange(() => {
      open = !open;
      ctx.render();
    }),
  );
  toggle.append(icon("m6 4 4 4-4 4", "arrow"));
  const header = button(t("groups.ungrouped"), "group-header", title, () => toggle.click());
  controls.append(header, toggle);
  const tabs = element("div", "tabs is-closed"),
    inner = element("div", "tabs-inner");
  tabs.append(inner);
  node.append(controls, tabs);
  const view = { tabs, inner };

  function rows() {
    return ctx.filterResult.rows(null);
  }

  /** Header, count and visibility; called on every render. */
  function update() {
    title.textContent = t("groups.ungrouped");
    header.setAttribute("aria-label", title.textContent);
    toggle.setAttribute("aria-label", t("groups.show_tabs"));
    const total = rows().length;
    if (count.textContent !== String(total)) count.textContent = String(total);
    node.hidden = !total;
    node.classList.toggle("active", ctx.snapshot.activeGroupId === null);
  }

  /** Rows of the expanded card (see `createTabLists`). */
  function render(bounds, used) {
    const expanded = open && !node.hidden;
    toggle.setAttribute("aria-expanded", String(expanded));
    tabs.classList.toggle("is-closed", !expanded);
    if (!expanded) {
      inner.replaceChildren();
      tabs.style.height = "0px";
      return;
    }
    ctx.tabLists.fill(view, rows(), bounds, used);
  }

  return { node, update, render };
}
