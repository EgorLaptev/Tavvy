import { DEFAULT_SPACE_ID, groupSpaceId } from "../../domain/spaces.js";

export const CONTAINER_PREFIX = "firefox-container-";
/** Snapshot ids for Firefox containers that are not linked to a Tavvy space yet. */
export const UNLINKED_CONTAINER_PREFIX = "container:";
export const MAX_SPACES = 100;

/**
 * Tavvy "spaces" link groups to Firefox containers (contextual identities).
 * This module resolves them and talks to the containers API.
 */
export function createContainers({ browserApi, store }) {
  let identitiesVersion = 0;
  let identitiesSignature = "";

  async function hasPermission() {
    return !!(
      browserApi.contextualIdentities?.query &&
      (await browserApi.permissions?.contains({ permissions: ["cookies"] }))
    );
  }

  function space(spaceId) {
    if (spaceId === DEFAULT_SPACE_ID)
      return { id: DEFAULT_SPACE_ID, name: "", cookieStoreId: null };
    const found = store.state.spaces.find((item) => item.id === spaceId);
    if (!found) throw new Error("Пространство не найдено");
    return found;
  }

  /** Firefox containers available to Tavvy (empty without the cookies permission). */
  async function listContainers() {
    if (!(await hasPermission())) return [];
    const identities = await browserApi.contextualIdentities.query({});
    const signature = JSON.stringify(
      identities.map(({ cookieStoreId, name, icon }) => [
        cookieStoreId,
        name,
        icon,
      ]),
    );
    if (signature !== identitiesSignature) {
      identitiesSignature = signature;
      identitiesVersion++;
    }
    return identities.filter(
      (item) =>
        typeof item.cookieStoreId === "string" &&
        item.cookieStoreId.startsWith(CONTAINER_PREFIX),
    );
  }

  /** `tabs.create` options that open a tab in the group's container. Throws if unavailable. */
  async function tabOptionsForGroup(group) {
    const spaceId = groupSpaceId(group);
    if (spaceId === DEFAULT_SPACE_ID) return {};
    const selected = space(spaceId);
    if (
      typeof selected.cookieStoreId !== "string" ||
      !selected.cookieStoreId.startsWith(CONTAINER_PREFIX)
    )
      throw new Error("Контейнер пространства недоступен");
    if (
      !browserApi.contextualIdentities ||
      !(await browserApi.permissions?.contains({ permissions: ["cookies"] }))
    )
      throw new Error(
        "Для пространства необходимо разрешение на контейнеры Firefox",
      );
    let identity;
    try {
      identity = await browserApi.contextualIdentities.get(
        selected.cookieStoreId,
      );
    } catch (error) {
      if (
        /^Invalid contextual identity:/i.test(String(error?.message || error))
      )
        throw new Error("Контейнер пространства недоступен");
      throw error;
    }
    if (identity?.cookieStoreId !== selected.cookieStoreId)
      throw new Error("Контейнер пространства недоступен");
    return { cookieStoreId: selected.cookieStoreId };
  }

  /** The space whose container a tab with `cookieStoreId` belongs to. */
  function spaceIdForCookieStore(cookieStoreId) {
    return (
      store.state.spaces.find((item) => item.cookieStoreId === cookieStoreId)
        ?.id || DEFAULT_SPACE_ID
    );
  }

  return {
    space,
    hasPermission,
    listContainers,
    tabOptionsForGroup,
    spaceIdForCookieStore,
    get identitiesVersion() {
      return identitiesVersion;
    },
  };
}
