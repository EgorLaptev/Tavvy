import { findGroup } from "../../domain/group-tree.js";
import { DEFAULT_SPACE_ID, groupSpaceId } from "../../domain/spaces.js";
import { isBlankUrl } from "../../domain/urls.js";
import { TAB_GROUP } from "./keys.js";

/** A tab the user opened with Ctrl+T / the + button, as opposed to a link or a restored tab. */
export function isPlainNewTab(tab) {
  return (
    !tab.incognito &&
    !tab.pinned &&
    tab.active &&
    tab.openerTabId == null &&
    tab.cookieStoreId === "firefox-default" &&
    isBlankUrl(tab.pendingUrl || tab.url)
  );
}

/**
 * Firefox opens new tabs without a container. When the window's group uses a container,
 * the new tab is replaced by an equivalent tab in that container.
 */
export function createNewTabHandler(ctx) {
  const { api, browserApi, store } = ctx;

  async function replace(tab) {
    const groupId = await ctx.activeGroupId(tab.windowId);
    const group = findGroup(store.state.groups, groupId);
    if (groupSpaceId(group) === DEFAULT_SPACE_ID) return;
    const original = await browserApi.tabs.get(tab.id).catch(() => null);
    // Restored tabs (Ctrl+Shift+T) already carry a group.
    if (!original?.active || !isBlankUrl(original.pendingUrl || original.url) || (await api.sessions.getTabValue(tab.id, TAB_GROUP)))
      return;
    const container = await ctx.tabOptionsForGroup(group);
    let replacement;
    try {
      replacement = await api.tabs.create({ windowId: tab.windowId, index: original.index, active: false, ...container });
      await api.sessions.setTabValue(replacement.id, TAB_GROUP, groupId);
      const current = await browserApi.tabs.get(tab.id).catch(() => null);
      if (!current?.active || !isBlankUrl(current.pendingUrl || current.url) || (await ctx.activeGroupId(tab.windowId)) !== groupId) {
        await api.tabs.remove(replacement.id);
        return;
      }
      await api.tabs.update(replacement.id, { active: true });
      await ctx.closeTab(tab.id);
    } catch (error) {
      if (replacement) await api.tabs.update(tab.id, { active: true }).catch(() => {});
      if (replacement) await api.tabs.remove(replacement.id).catch(() => {});
      throw error;
    }
  }

  function created(tab) {
    if (!isPlainNewTab(tab)) return Promise.resolve();
    ctx.pendingNewTabs.add(tab.id);
    return ctx.queue(() => replace(tab)).finally(() => {
      ctx.pendingNewTabs.delete(tab.id);
      ctx.index.mark({ type: "window", windowId: tab.windowId });
    });
  }

  return { created };
}
