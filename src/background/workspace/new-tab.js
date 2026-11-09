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
 *
 * This runs immediately, outside the command queue: the swap must finish within a few
 * frames, before the user starts typing. The replacement is created already active and
 * without a URL — only then does Firefox focus the address bar (activating a tab later
 * with `tabs.update` leaves the focus in the page).
 */
export function createNewTabHandler(ctx) {
  const { api, browserApi, store, index } = ctx;

  async function replace(tab) {
    await store.ready;
    const groupId = await ctx.activeGroupId(tab.windowId);
    const group = findGroup(store.state.groups, groupId);
    if (groupSpaceId(group) === DEFAULT_SPACE_ID) return;
    // Restored tabs (Ctrl+Shift+T) already carry a group.
    if (await browserApi.sessions.getTabValue(tab.id, TAB_GROUP)) return;
    const container = await ctx.tabOptionsForGroup(group);
    let replacement;
    try {
      replacement = await browserApi.tabs.create({ windowId: tab.windowId, index: tab.index, active: true, ...container });
      index.mark({ type: "tab", tabId: replacement.id });
      await api.sessions.setTabValue(replacement.id, TAB_GROUP, groupId);
    } catch (error) {
      if (replacement) await ctx.closeTab(replacement.id).catch(() => {});
      throw error;
    }
    // The user may have typed an address into the original tab while the replacement opened.
    const original = await browserApi.tabs.get(tab.id).catch(() => null);
    if (original && !isBlankUrl(original.pendingUrl || original.url)) {
      await api.tabs.update(tab.id, { active: true }).catch(() => {});
      await ctx.closeTab(replacement.id).catch(() => {});
      return;
    }
    if (original) await ctx.closeTab(tab.id);
  }

  function created(tab) {
    if (!isPlainNewTab(tab)) return Promise.resolve();
    ctx.pendingNewTabs.add(tab.id);
    return replace(tab).finally(() => {
      ctx.pendingNewTabs.delete(tab.id);
      index.mark({ type: "window", windowId: tab.windowId });
    });
  }

  return { created };
}
