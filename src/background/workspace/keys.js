// Storage and Firefox session keys. Changing any value breaks existing user data.
export const WORKSPACE_KEY = "tavvy:workspace:v1";
export const KNOWN_KEY = "tavvy:known:v1";

// sessions.setTabValue keys
export const TAB_GROUP = "tavvy:group";
export const TAB_GROUP_PINNED = "tavvy:group-pinned";
export const TAB_IMPORT_MARKER = "tavvy:import";
export const TAB_IMPORT_METADATA = "tavvy:import-metadata";

// sessions.setWindowValue keys
export const WINDOW_ACTIVE_GROUP = "tavvy:active-group";
export const WINDOW_EMPTY_SPACE = "tavvy:empty-space";
export const windowSpaceGroupKey = (spaceId) => "tavvy:space-group:" + spaceId;
