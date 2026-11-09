import { element, favicon } from "../dom.js";
import { tabTitle } from "../state/labels.js";
import { renderTabStatus } from "./status-icons.js";
import { t } from "../../locales/index.js";

/** Tab rows (`.tab-row[data-tab-id]`): created once per tab and patched on later renders. */
export function createTabRows(ctx) {
  function create(tab) {
    const tabId = tab.id;
    const row = element("div", "tab-row");
    row.dataset.tabId = tab.id;
    const label = element("span", "tab-title");
    const statuses = element("span", "tab-statuses");
    row.append(favicon(tab), label, statuses);
    row.addEventListener("click", () =>
      ctx.run({ type: "activateTab", tabId: tabId }),
    );
    row.addEventListener("contextmenu", (event) => ctx.tabMenu.open(event, tabId));
    return { row, label, statuses, title: null, icon: tab.faviconUrl };
  }

  /** Returns the row of `tab`, creating it or updating only what changed. */
  function rowFor(tab) {
    let item = ctx.tabViews.get(tab.id);
    if (!item) {
      item = create(tab);
      ctx.tabViews.set(tab.id, item);
    }
    if (item.title !== tab.title) {
      item.label.textContent = tabTitle(tab, t);
      item.title = tab.title;
    }
    if (item.icon !== tab.faviconUrl) {
      item.row.firstChild.replaceWith(favicon(tab));
      item.icon = tab.faviconUrl;
    }
    renderTabStatus(item.statuses, tab, ctx.run);
    return item.row;
  }

  /** Drops rows that the last render did not use. */
  function prune(used) {
    for (const [id, item] of ctx.tabViews)
      if (!used.has(id)) {
        item.row.remove();
        ctx.tabViews.delete(id);
      }
  }

  return { rowFor, prune };
}
