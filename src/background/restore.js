import { parseStgBackup } from "../domain/stg-import.js";
import { parseTavvyBackup } from "../domain/tavvy-backup.js";

// Serialize restores so each safety backup is taken before its own changes.
export function createRestoreManager(browser, service, backups) {
  let tail = Promise.resolve();
  return (command, windowId) => {
    const result = tail.then(async () => {
      if (command.type === "importStg") parseStgBackup(command.backup);
      else parseTavvyBackup(command.backup);
      const existing = command.closeExistingTabs === true
        ? (await browser.tabs.query({ windowId })).filter((tab) => {
          const url = tab.pendingUrl || tab.url || "";
          return !tab.incognito && Number.isInteger(tab.id) &&
            (/^(https?:\/\/|file:\/\/|about:[a-z0-9-]+(?:[?#][^\s]*)?$)/i.test(url) ||
             url.startsWith(browser.runtime.getURL("local-file.html") + "#"));
        }).map((tab) => tab.id)
        : [];
      // Do not alter tabs if the backup fails, even when automatic backups are off.
      await backups.download(windowId, { fresh: true });
      const snapshot = await service.dispatch(command, windowId);
      if (existing.length && !(command.type === "importStg" && snapshot.importReport?.alreadyImported)) {
        // Tabs may have been closed while the import ran. Keep newly opened tabs.
        const current = await browser.tabs.query({ windowId });
        const stillOpen = new Set(current.map((tab) => tab.id));
        const closing = existing.filter((id) => stillOpen.has(id));
        const closingSet = new Set(closing);
        // Firefox can close a window when its last visible tab is removed,
        // even if restored tabs are hidden. Keep a visible tab in that case.
        if (closing.length && !current.some((tab) => !closingSet.has(tab.id) && !tab.hidden))
          await browser.tabs.create({ windowId, active: true });
        if (closing.length) await browser.tabs.remove(closing);
        return service.dispatch({ type: "snapshot" }, windowId);
      }
      return snapshot;
    });
    tail = result.catch(() => {});
    return result;
  };
}
