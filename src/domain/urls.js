// URL classification shared by the background service and backups.

const BLANK = /^about:(blank|newtab|home)$/i;
const EXTENSION_PAGE = /^moz-extension:\/\/[0-9a-f-]{36}\/(?:[^\s]*)$/i;
const ABOUT_PAGE = /^about:[a-z0-9-]+(?:[?#][^\s]*)?$/i;

/** An empty new-tab page (or a tab that has not loaded anything yet). */
export function isBlankUrl(url) {
  return !url || BLANK.test(url);
}

/**
 * Browser-internal or extension pages that a tab cannot be created with directly
 * (about:preferences, about:addons, moz-extension://…). about:blank/newtab are excluded.
 */
export function isInternalPage(url) {
  return (
    EXTENSION_PAGE.test(url ?? "") ||
    (ABOUT_PAGE.test(url ?? "") && !/^about:(blank|newtab)$/i.test(url))
  );
}

/** Pages that can be reopened as-is in another Firefox container. */
export function isTransferableUrl(url) {
  return /^(https?:|about:(blank|newtab)$)/i.test(url ?? "");
}

/** URLs allowed in backup files. */
export const BACKUP_SAFE_URL =
  /^(https?:\/\/|file:\/\/|moz-extension:\/\/[0-9a-f-]{36}\/(?:[^\s]*)$|about:blank$|about:newtab$|about:[a-z0-9-]+(?:[?#][^\s]*)?$)/i;

const PLACEHOLDER_MARK = "/local-file.html#";

/** Tavvy's placeholder page for URLs an extension cannot open (file:, about:…). */
export function placeholderUrl(baseUrl, url, title) {
  return baseUrl + "#" + encodeURIComponent(JSON.stringify({ url, title }));
}

export function needsPlaceholder(url) {
  return url.startsWith("file:") || isInternalPage(url);
}

export function readPlaceholder(url) {
  if (!url?.includes(PLACEHOLDER_MARK)) return null;
  try {
    return JSON.parse(decodeURIComponent(url.split("#")[1]));
  } catch {
    return null;
  }
}
