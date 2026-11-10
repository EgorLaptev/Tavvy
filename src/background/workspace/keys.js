// Storage and Firefox session keys. Changing any value breaks existing user data.
export const WORKSPACE_KEY = "tavvy:workspace:v1";
export const KNOWN_KEY = "tavvy:known:v1";
/** The group used most recently in any window (kept for older versions; no longer read). */
export const LAST_ACTIVE_GROUP_KEY = "tavvy:last-active-group:v1";

// sessions.setTabValue keys
export const TAB_GROUP = "tavvy:group";
export const TAB_GROUP_PINNED = "tavvy:group-pinned";
export const TAB_IMPORT_MARKER = "tavvy:import";
export const TAB_IMPORT_METADATA = "tavvy:import-metadata";

// sessions.setWindowValue keys
export const WINDOW_ACTIVE_GROUP = "tavvy:active-group";
/** `WINDOW_ACTIVE_GROUP` value of a window that shows no group (a new window, as in STG). */
export const NO_GROUP = "";
export const WINDOW_EMPTY_SPACE = "tavvy:empty-space";
export const windowSpaceGroupKey = (spaceId) => "tavvy:space-group:" + spaceId;
