import { translateText } from "../locales/index.js";

/**
 * Callbacks that connect the settings view to the background: the settings repository,
 * backups, restore and import. The preview has no background, so backup actions are absent.
 */
export function settingsOptions(ctx, { onLanguageChange }) {
    const { api, windowId, client } = ctx;
    const demo = api.isDemo;
    return {
        appVersion: api.runtime.getManifest?.().version ?? api.appVersion,
        onLanguageChange,
        cachePopupSize: !demo,
        onBackup: demo
            ? null
            : async () => {
                  const result = await client.send({ type: "backupNow" });
                  if (!result?.ok)
                      throw new Error(
                          result?.error || "Ошибка резервного копирования",
                      );
              },
        onBackupStatus: demo
            ? null
            : async () => {
                  const result = await client.send({ type: "backupStatus" });
                  if (!result?.ok)
                      throw new Error(result?.error || "Ошибка состояния");
                  return result.status;
              },
        onImportGroups: (backup) => ctx.run({ type: "importStg", backup }),
        onRestoreBackup: demo
            ? null
            : async (backup) => {
                  const type =
                      backup?.format === "tavvy-backup"
                          ? "importBackup"
                          : "importStg";
                  const result = await client.send({ type, backup });
                  if (!result?.ok)
                      throw new Error(
                          translateText(
                              result?.error || "Фоновый процесс недоступен",
                          ),
                      );
                  await ctx.run({ type: "snapshot" });
                  return result.snapshot;
              },
        onOpenImport: demo
            ? undefined
            : () =>
                  api.tabs
                      .create({
                          windowId,
                          url:
                              api.runtime.getURL("import.html") +
                              "?windowId=" +
                              windowId,
                      })
                      .catch((error) => {
                          ctx.status.textContent = error.message;
                      }),
        repository: {
            read: () => ctx.snapshot.settings,
            write: (settings) => {
                return ctx.run({ type: "saveSettings", settings });
            },
        },
    };
}
