import { INBOX_ID, findGroup } from "../../../domain/group-tree.js";
import { DEFAULT_SPACE_ID, groupSpaceId, groupsInSpace, spaceIcon } from "../../../domain/spaces.js";
import { isTransferableUrl, placeholderUrl, readPlaceholder } from "../../../domain/urls.js";
import { MAX_SPACES, UNLINKED_CONTAINER_PREFIX } from "../containers.js";
import { TAB_GROUP } from "../keys.js";

/** Commands that link groups to Firefox containers ("spaces"). */
export function createSpaceCommands(ctx) {
  const { api, store } = ctx;
  const groupPinned = () => !!store.state.settings?.groupPinnedTabs;

  function newSpace(identity) {
    if (store.state.spaces.length >= MAX_SPACES) throw new Error("Слишком много пространств");
    return { id: ctx.newId(), name: identity.name, icon: spaceIcon(identity.icon), cookieStoreId: identity.cookieStoreId };
  }

  /** Selects the group last used in `spaceId` in this window, or marks the space as empty there. */
  async function selectSpace(windowId, spaceId) {
    const available = groupsInSpace(store.state.groups, spaceId);
    const previous = await ctx.lastGroupInSpace(windowId, spaceId);
    const target = available.find((item) => item.id === previous) || available[0];
    if (target) await ctx.activate(windowId, target.id);
    else await ctx.setEmptySpaceId(windowId, spaceId);
  }

  async function rebindSpace(command, windowId) {
    if (command.spaceId === DEFAULT_SPACE_ID) throw new Error("Контейнер пространства недоступен");
    const selected = ctx.space(command.spaceId);
    const identities = await ctx.listContainers();
    if (identities.some((identity) => identity.cookieStoreId === selected.cookieStoreId))
      throw new Error("Контейнер пространства уже существует");
    const target = identities.find((identity) => identity.cookieStoreId === command.cookieStoreId);
    if (!target || store.state.spaces.some((item) => item.cookieStoreId === target.cookieStoreId))
      throw new Error("Контейнер пространства недоступен");
    // The user explicitly selected this existing container; preserve all
    // group, tab and archive associations and do not touch Firefox cookies.
    selected.cookieStoreId = target.cookieStoreId;
    selected.name = target.name;
    selected.icon = spaceIcon(target.icon);
    await store.save();
    await selectSpace(windowId, selected.id);
  }

  async function deleteSpace(command) {
    if (command.spaceId === DEFAULT_SPACE_ID) throw new Error("Основное пространство удалить нельзя");
    ctx.space(command.spaceId);
    // Keep groups, tabs, archive entries and the Firefox container and its cookies.
    for (const item of store.state.groups) if (groupSpaceId(item) === command.spaceId) delete item.spaceId;
    store.state.spaces = store.state.spaces.filter((item) => item.id !== command.spaceId);
  }

  async function activateSpace(command, windowId) {
    let spaceId = command.spaceId;
    if (typeof spaceId === "string" && spaceId.startsWith(UNLINKED_CONTAINER_PREFIX)) {
      const cookieStoreId = spaceId.slice(UNLINKED_CONTAINER_PREFIX.length);
      const identity = (await ctx.listContainers()).find((item) => item.cookieStoreId === cookieStoreId);
      if (!identity) throw new Error("Контейнер пространства недоступен");
      let existing = store.state.spaces.find((item) => item.cookieStoreId === cookieStoreId);
      if (!existing) {
        existing = newSpace(identity);
        store.state.spaces.push(existing);
        await store.save();
      }
      spaceId = existing.id;
    }
    ctx.space(spaceId);
    const current = await ctx.activeGroupId(windowId);
    if (current) await ctx.rememberGroupInSpace(windowId, groupSpaceId(findGroup(store.state.groups, current)), current);
    await selectSpace(windowId, spaceId);
  }

  /** Destination space and container for `moveGroupToSpace`. */
  async function resolveDestination(spaceId) {
    const identities = await ctx.listContainers();
    if (spaceId === DEFAULT_SPACE_ID) return { space: null, identity: null };
    if (spaceId?.startsWith(UNLINKED_CONTAINER_PREFIX)) {
      const cookieStoreId = spaceId.slice(UNLINKED_CONTAINER_PREFIX.length);
      const identity = identities.find((item) => item.cookieStoreId === cookieStoreId);
      if (!identity) throw new Error("Контейнер пространства недоступен");
      return { space: null, identity };
    }
    const space = store.state.spaces.find((item) => item.id === spaceId) || null;
    const identity = space && identities.find((item) => item.cookieStoreId === space.cookieStoreId);
    if (!identity) throw new Error("Контейнер пространства недоступен");
    return { space, identity };
  }

  /**
   * URL for reopening a tab in another container. Pages a tab cannot be created with
   * (Firefox pages, local files, other extensions) become Tavvy's placeholder page that
   * keeps the original address, so nothing is lost. `undefined` opens a new-tab page.
   */
  function reopenUrl(tab) {
    if (tab.url === "about:newtab") return undefined;
    if (isTransferableUrl(tab.url) || readPlaceholder(tab.url)) return tab.url;
    return placeholderUrl(api.runtime.getURL("local-file.html"), tab.url, tab.title);
  }

  /** Reopens a group's tabs in another container and links the group to it. */
  async function moveGroupToSpace(command, windowId) {
    const moving = findGroup(store.state.groups, command.groupId);
    const sourceSpace = groupSpaceId(moving);
    let { space: destination, identity } = await resolveDestination(command.spaceId);
    if (destination?.id === sourceSpace || (command.spaceId === DEFAULT_SPACE_ID && sourceSpace === DEFAULT_SPACE_ID))
      return ctx.snapshot(windowId);
    const records = await ctx.scan();
    const targets = records.filter((tab) => tab.groupId === moving.id && (!tab.pinned || groupPinned()));
    const fallback =
      groupsInSpace(store.state.groups, sourceSpace).find((item) => item.id !== moving.id) || findGroup(store.state.groups, INBOX_ID);
    if (!destination && identity) destination = newSpace(identity);
    const cookieStoreId = identity ? identity.cookieStoreId : "firefox-default";
    const created = [];
    try {
      for (const tab of targets) {
        const url = reopenUrl(tab);
        const copy = await api.tabs.create({
          windowId: tab.windowId,
          active: false,
          pinned: !!(tab.pinned || tab.managedPinned),
          ...(url ? { url } : {}),
          cookieStoreId,
        });
        created.push({ copy, original: tab });
        await api.sessions.setTabValue(copy.id, TAB_GROUP, tab.groupId);
      }
      for (const { copy, original } of created) if (original.active) await api.tabs.update(copy.id, { active: true });
    } catch (error) {
      for (const original of targets) if (original.active) await api.tabs.update(original.id, { active: true }).catch(() => {});
      for (const { copy } of created) await api.tabs.remove(copy.id).catch(() => {});
      throw error;
    }
    // Global pinned tabs stay in their container, so they move to a group that remains there.
    if (!groupPinned())
      for (const tab of records.filter((item) => item.groupId === moving.id && item.pinned))
        await api.sessions.setTabValue(tab.id, TAB_GROUP, fallback.id);
    if (destination && !store.state.spaces.includes(destination)) store.state.spaces.push(destination);
    if (destination) moving.spaceId = destination.id;
    else delete moving.spaceId;
    for (const tab of targets) await ctx.closeTab(tab.id);
    for (const affected of new Set(targets.map((tab) => tab.windowId)))
      await ctx.applyVisibility(affected, await ctx.activeGroupId(affected));
  }

  const unsupported = () => {
    throw new Error("Управление контейнерами Firefox в Tavvy недоступно");
  };

  return {
    rebindSpace,
    deleteSpace,
    activateSpace,
    moveGroupToSpace,
    createContainer: unsupported,
    createSpace: unsupported,
    recoverSpace: unsupported,
    setSpaceIcon: unsupported,
  };
}
