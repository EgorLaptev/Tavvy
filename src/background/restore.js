import { parseStgBackup } from "../domain/stg-import.js";
import { parseTavvyBackup } from "../domain/tavvy-backup.js";

/**
 * Restoring replaces every group and closes the previous tabs in all windows
 * (see the import commands), so a backup of the current state is always saved first.
 * Restores are serialized so each safety backup is taken before its own changes.
 */
export function createRestoreManager(browser, service, backups) {
    let tail = Promise.resolve();

    return (command, windowId) => {
        const result = tail.then(async () => {
            if (command.type === "importStg") parseStgBackup(command.backup);
            else parseTavvyBackup(command.backup);
            // Do not alter tabs if the backup fails, even when automatic backups are off.
            await backups.download(windowId, { fresh: true });

            return service.dispatch(command, windowId);
        });

        tail = result.catch(() => {});

        return result;
    };
}
