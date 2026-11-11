/**
 * Text shown for groups, tabs and containers. Default names were stored in Russian by older
 * versions, so they are translated here instead of being shown verbatim. `t` is the
 * translation function, passed in so these rules can be tested without the locale bundle.
 */

const LEGACY_MAIN_GROUP = "Основная";
const LEGACY_NEW_TAB = "Новая вкладка";

export function groupTitle(group, t) {
  return group.id === "inbox" && group.title === LEGACY_MAIN_GROUP
    ? t("groups.main")
    : group.title;
}

export function tabTitle(tab, t) {
  return tab.url === "about:newtab" && tab.title === LEGACY_NEW_TAB
    ? t("tabs.new_tab")
    : tab.title;
}

/** The container of a group: its record in `spaces` and the label used for its badge. */
export function groupSpace(group, spaces, t) {
  const space = (spaces || []).find(
    (item) => item.id === (group.spaceId || "default"),
  );
  const name = group.spaceId
    ? space?.name || group.spaceId
    : t("spaces.default");
  return {
    space,
    label: space?.unavailable
      ? `${name}: ${t("spaces.container_unavailable")}`
      : name,
  };
}

const DRAFT_COLORS = ["#398dff", "#a855f7", "#00c98a", "#ff7800", "#ff168a"];

/** Marker colour of the "new group" draft; cycles with the number of existing groups. */
export function draftMarkerColor(groupCount) {
  return DRAFT_COLORS[groupCount % DRAFT_COLORS.length];
}
