import en from "../locales/en.json" with { type: "json" };
import ru from "../locales/ru.json" with { type: "json" };
import zhCN from "../locales/zh-CN.json" with { type: "json" };
import es from "../locales/es.json" with { type: "json" };
import fr from "../locales/fr.json" with { type: "json" };
import de from "../locales/de.json" with { type: "json" };
import { drawMarker } from "../domain/group-marker.js";
import { DEFAULT_SETTINGS } from "../domain/settings.js";

const locales = { en, ru, "zh-CN": zhCN, es, fr, de };
const rootId = "tavvy-move-tab";

export function mountTabContextMenu(api, service, notify, createCanvas = () => document.createElement("canvas")) {
  let generation = 0;
  let childIds = [];
  let destinations = new Map();
  // Firefox preserves menu items between background restarts; rebuild our menu once.
  const initialized = api.menus.removeAll().then(() => {
    api.menus.create({ id: rootId, title: en.groups.move_tab_to_group, contexts: ["tab"] });
  });
  let updateQueue = initialized;
  api.menus.onHidden.addListener(() => { generation++; });
  api.menus.onShown.addListener((info, tab) => {
    if (!info.contexts.includes("tab") || !tab || tab.incognito) return;
    const current = ++generation;
    updateQueue = updateQueue.catch(console.error).then(async () => {
      const snapshot = await service.dispatch({ type: "snapshot" }, tab.windowId);
      if (generation !== current) return;
      const locale = locales[snapshot.settings.language] || en;
      await api.menus.update(rootId, {
        title: locale.groups.move_tab_to_group,
        enabled: !(tab.pinned && !snapshot.settings.groupPinnedTabs),
      });
      if (generation !== current) return;
      for (const id of childIds) await api.menus.remove(id);
      childIds = [];
      destinations = new Map();
      if (generation !== current) return;
      for (const [index, group] of snapshot.groups.entries()) {
        const id = `${rootId}-${index}`;
        const title = group.id === "inbox" && group.title === "Основная" ? locale.groups.main : group.title;
        const canvas = createCanvas();
        canvas.width = canvas.height = 32;
        drawMarker(canvas.getContext("2d"), group.id, group.color, 32, snapshot.settings.markerStyle ?? DEFAULT_SETTINGS.markerStyle, group.title);
        api.menus.create({ id, parentId: rootId, title: title.replaceAll("&", "&&"), contexts: ["tab"], icons: { 32: canvas.toDataURL("image/png") } });
        childIds.push(id);
        destinations.set(id, group.id);
      }
      if (generation === current) await api.menus.refresh();
    });
    updateQueue.catch(console.error);
  });
  api.menus.onClicked.addListener((info, tab) => {
    const groupId = destinations.get(info.menuItemId);
    if (!groupId || !tab || tab.incognito || !Number.isInteger(tab.id) || !Number.isInteger(tab.windowId)) return;
    service.dispatch({ type: "moveTab", tabId: tab.id, groupId, keepActiveGroup: true }, tab.windowId)
      .then(notify).catch(console.error);
  });
  initialized.catch(console.error);
}
