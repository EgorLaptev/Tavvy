const ALARM = "tavvy-backup";
const KEY = "tavvy:backup-status:v1";
import { normalizeSettings } from "../domain/settings.js";
const intervals = {
    hourly: 3600000,
    fourHours: 14400000,
    daily: 86400000,
    weekly: 604800000,
    monthly: 2592000000,
};

export function createBackupManager(browser, service, notify = () => {}) {
    let pending,
        pendingAutomatic = false;
    async function settings() {
        const data = await browser.storage.local.get("tavvy:workspace:v1");
        return normalizeSettings(data["tavvy:workspace:v1"]?.settings);
    }
    async function status() {
        return (await browser.storage.local.get(KEY))[KEY] || {};
    }
    async function saveStatus(value) {
        await browser.storage.local.set({ [KEY]: value });
        notify();
    }
    async function download(
        windowId,
        { fresh = false, automatic = false } = {},
    ) {
        if (pending) {
            if (!fresh && !automatic && !pendingAutomatic) return pending;
            await pending;
        }
        pendingAutomatic = automatic;
        pending = (async () => {
            let url;
            try {
                const backup = await service.dispatch(
                    { type: "exportBackup" },
                    windowId,
                );
                const folder = normalizeSettings(await settings()).backupFolder;
                url = URL.createObjectURL(
                    new Blob([JSON.stringify(backup, null, 2)], {
                        type: "application/json",
                    }),
                );
                const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                const downloadId = await browser.downloads.download({
                    url,
                    filename: `${folder}/backup-${stamp}.json`,
                    saveAs: false,
                    conflictAction: "uniquify",
                });
                let item;
                for (let attempt = 0; attempt < 120; attempt++) {
                    [item] = await browser.downloads.search({ id: downloadId });
                    if (item?.state === "complete") break;
                    if (!item || item.state === "interrupted")
                        throw new Error(item?.error || "Загрузка прервана");
                    await new Promise((resolve) => setTimeout(resolve, 250));
                }
                if (item?.state !== "complete")
                    throw new Error("Не удалось дождаться завершения загрузки");
                await saveStatus({ lastSuccess: Date.now(), error: "" });
                if (automatic) {
                    // Remove only this completed download from history, never the file.
                    try {
                        await browser.downloads.erase({ id: downloadId });
                    } catch (error) {
                        console.warn(
                            "Could not remove automatic backup from download history:",
                            error,
                        );
                    }
                }
            } catch (error) {
                await saveStatus({ ...(await status()), error: error.message });
                throw error;
            } finally {
                if (url) URL.revokeObjectURL(url);
            }
        })().finally(() => {
            pending = null;
            pendingAutomatic = false;
        });
        return pending;
    }
    async function schedule() {
        const config = await settings();
        await browser.alarms.clear(ALARM);
        if (!config.backupEnabled) return;
        const info = await status();
        const last = info.lastSuccess || info.enabledAt || Date.now();
        if (!info.lastSuccess && !info.enabledAt)
            await saveStatus({ ...info, enabledAt: last });
        await browser.alarms.create(ALARM, {
            when: Math.max(
                Date.now() + 1000,
                last +
                    (intervals[config.backupFrequency] || intervals.fourHours),
            ),
        });
    }
    async function runAlarm(alarm) {
        if (alarm.name !== ALARM) return;
        const config = await settings();
        if (!config.backupEnabled) return;
        try {
            const window = await browser.windows.getLastFocused({
                windowTypes: ["normal"],
            });
            if (!window?.id || window.incognito)
                throw new Error("Нет доступного обычного окна Firefox");
            await download(window.id, { fresh: true, automatic: true });
            await schedule();
        } catch (error) {
            await saveStatus({ ...(await status()), error: error.message });
            await browser.alarms.create(ALARM, { delayInMinutes: 60 });
        }
    }
    return { download, schedule, runAlarm, status };
}
