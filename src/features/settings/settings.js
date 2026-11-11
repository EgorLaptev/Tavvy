import { LANGUAGES } from "../../domain/languages.js";
import { createEventScope } from "../../ui/event-scope.js";
import {
    normalizeSettings,
    THEMES,
    validBackupFolder,
} from "../../domain/settings.js";
import { versionLabel } from "../../domain/version-names.js";
import {
    setLanguage,
    t,
    format,
    getLanguage,
    translateStatic,
    translateText,
} from "../../locales/index.js";
import {
    createPageSelects,
    fillLanguageView,
    createMarkerOptions,
} from "./controls.js";
import { mountBackupRestore } from "./backup-restore.js";
import {
    themeClasses,
    panelSize,
    sliderProgress,
    isSettingsExport,
} from "./appearance.js";

/**
 * Connects the settings view to `repository` ({read, write}). Changes are applied to the
 * page immediately and saved through the repository; returns a dispose function.
 */
export function mountSettings({
    themeView,
    languageView,
    repository,
    onImportGroups,
    onRestoreBackup,
    onOpenImport,
    cachePopupSize = false,
    onBackup,
    onBackupStatus,
    appVersion,
    onLanguageChange,
}) {
    const { listen, dispose } = createEventScope();
    const discardInput = document.querySelector(
        'input[aria-label="Выгружать неактивные вкладки"]',
    );
    const animationInput = document.querySelector(
        'input[aria-label="Анимации"]',
    );
    const closeTabsOnGroupDelete = document.querySelector(
        ".close-tabs-on-group-delete",
    );
    const groupPinnedInput = document.querySelector(
        'input[aria-label="Закреплённые вкладки по группам"]',
    );
    const nestedInput = document.querySelector(
        'input[aria-label="Вложенные группы"]',
    );
    const nestedVisibility = document.querySelector(
        'select[aria-label="Показывать вкладки"]',
    );
    const nestedVisibilityRow = document.querySelector(
        ".nested-visibility-setting",
    );
    const dynamicIconInput = document.querySelector(
        'input[aria-label="Динамическая иконка"]',
    );
    const backupInput = document.querySelector(
        'input[aria-label="Автоматические копии"]',
    );
    const backupFrequency = document.querySelector(
        'select[aria-label="Частота копирования"]',
    );
    const backupFrequencyRow = document.querySelector(".backup-frequency");
    const backupFolder = document.querySelector(".backup-folder-input");
    const backupNotice = document.querySelector(".backup-notice");
    const appearanceGroup = document.querySelector(".settings-appearance");
    const languageCurrent = document.querySelector(".language-current");
    let themeSelect, languageSelect;
    if (document.documentElement.classList.contains("settings-page"))
        ({ themeSelect, languageSelect } = createPageSelects(appearanceGroup));
    fillLanguageView(languageView);
    let savePending = Promise.resolve();
    async function updateBackupStatus() {
        if (!onBackupStatus) return;
        try {
            const status = await onBackupStatus();
            backupNotice.textContent = status.error
                ? format("common.error_message", {
                      error: translateText(status.error),
                  })
                : status.lastSuccess
                  ? format("settings.backup.last_backup_date", {
                        date: new Date(status.lastSuccess).toLocaleString(
                            getLanguage(),
                        ),
                    })
                  : t("settings.backup.the_folder_is_inside_firefox_downloads");
        } catch {
            backupNotice.textContent = t(
                "settings.backup.could_not_get_backup_status",
            );
        }
    }
    listen(document.querySelector(".backup-open"), "click", updateBackupStatus);
    if (document.documentElement.classList.contains("settings-page"))
        void updateBackupStatus();
    listen(document.querySelector(".backup-create"), "click", async () => {
        if (!onBackup) {
            backupNotice.textContent = t(
                "settings.backup.backups_are_available_in_the_firefox_extension",
            );
            return;
        }
        backupNotice.textContent = t("settings.backup.creating_backup");
        try {
            await savePending;
            await onBackup();
            backupNotice.textContent = format(
                "settings.backup.backup_saved_to_downloads_folder",
                { folder: savedSettings.backupFolder },
            );
        } catch (error) {
            backupNotice.textContent = format(
                "settings.backup.could_not_create_backup_error",
                { error: translateText(error.message) },
            );
        }
    });
    const markerSelect = createMarkerOptions(appearanceGroup);
    if (appVersion) {
        const version = document.createElement("div");
        version.className = "app-version";
        version.textContent = versionLabel(appVersion);
        document.querySelector(".github-link").before(version);
    }
    const themeInputs = [...themeView.querySelectorAll("input[name=theme]")];
    const panelWidth = document.querySelector("#panel-width");
    const panelHeight = document.querySelector("#panel-height");
    const systemTheme = matchMedia("(prefers-color-scheme: light)");
    let savedSettings = normalizeSettings(repository.read());
    setLanguage(savedSettings.language);
    function applySettings() {
        if (!THEMES.includes(savedSettings.theme))
            savedSettings.theme = "Чёрная";
        if (appVersion)
            document.querySelector(".app-version").textContent =
                versionLabel(appVersion);
        const theme = themeClasses(savedSettings.theme, systemTheme.matches);
        document.documentElement.classList.toggle("light-theme", theme.light);
        document.documentElement.classList.toggle("dark-theme", theme.dark);
        document.documentElement.classList.toggle(
            "standard-theme",
            theme.standard,
        );
        document.documentElement.classList.toggle(
            "animations-off",
            !savedSettings.animations,
        );
        document.documentElement.dataset.markerStyle =
            savedSettings.markerStyle;
        markerSelect.querySelectorAll("input").forEach((input) => {
            input.checked = input.value === savedSettings.markerStyle;
        });
        animationInput.checked = Boolean(savedSettings.animations);
        if (themeSelect) themeSelect.value = savedSettings.theme;
        if (languageSelect) languageSelect.value = savedSettings.language;
        languageCurrent.textContent =
            LANGUAGES.find(([code]) => code === savedSettings.language)?.[1] ||
            "English";
        languageView
            .querySelectorAll('input[name="language"]')
            .forEach((input) => {
                input.checked = input.value === savedSettings.language;
            });
        closeTabsOnGroupDelete.checked =
            savedSettings.closeTabsOnGroupDelete !== false;
        groupPinnedInput.checked = Boolean(savedSettings.groupPinnedTabs);
        nestedInput.checked = savedSettings.nestedGroups !== false;
        nestedVisibility.value = savedSettings.nestedTabsVisibility;
        nestedVisibilityRow.hidden = !nestedInput.checked;
        dynamicIconInput.checked = savedSettings.dynamicIcon !== false;
        backupInput.checked = Boolean(savedSettings.backupEnabled);
        backupFrequency.value = savedSettings.backupFrequency || "fourHours";
        backupFolder.value = savedSettings.backupFolder || "Tavvy";
        backupFrequencyRow.hidden = !backupInput.checked;
        discardInput.checked = Boolean(savedSettings.discardInactiveTabs);
        const size = panelSize(savedSettings);
        panelWidth.value = size.width;
        panelHeight.value = size.height;
        updateSliderFill(panelWidth);
        updateSliderFill(panelHeight);
        document.documentElement.style.setProperty(
            "--panel-width",
            panelWidth.value + "px",
        );
        document.documentElement.style.setProperty(
            "--panel-height",
            panelHeight.value + "px",
        );
        if (cachePopupSize) {
            try {
                localStorage.setItem(
                    "tavvy:popup-size:v1",
                    JSON.stringify({
                        width: Number(panelWidth.value),
                        height: Number(panelHeight.value),
                    }),
                );
            } catch {
                // Settings remain usable if the synchronous startup cache is unavailable.
            }
        }
        themeInputs.forEach((input) => {
            input.checked = input.value === savedSettings.theme;
        });
        document.querySelector(".theme-current").textContent = translateText(
            savedSettings.theme,
        );
    }
    function saveSettings() {
        savedSettings = normalizeSettings(savedSettings);
        savePending = Promise.resolve(repository.write(savedSettings));
    }
    function chooseLanguage(value) {
        savedSettings.language = value;
        setLanguage(savedSettings.language);
        translateStatic(document.querySelector(".popup"));
        applySettings();
        if (appVersion)
            document.querySelector(".app-version").textContent =
                versionLabel(appVersion);
        saveSettings();
        onLanguageChange?.();
    }
    listen(languageView, "change", (event) => {
        if (event.target.matches('input[name="language"]'))
            chooseLanguage(event.target.value);
    });
    if (languageSelect)
        listen(languageSelect, "change", () =>
            chooseLanguage(languageSelect.value),
        );
    listen(animationInput, "change", () => {
        savedSettings.animations = animationInput.checked;
        applySettings();
        saveSettings();
    });
    listen(closeTabsOnGroupDelete, "change", () => {
        savedSettings.closeTabsOnGroupDelete = closeTabsOnGroupDelete.checked;
        applySettings();
        saveSettings();
    });
    listen(groupPinnedInput, "change", () => {
        savedSettings.groupPinnedTabs = groupPinnedInput.checked;
        applySettings();
        saveSettings();
    });
    listen(nestedInput, "change", () => {
        savedSettings.nestedGroups = nestedInput.checked;
        applySettings();
        saveSettings();
    });
    listen(nestedVisibility, "change", () => {
        savedSettings.nestedTabsVisibility = nestedVisibility.value;
        saveSettings();
    });
    listen(dynamicIconInput, "change", () => {
        savedSettings.dynamicIcon = dynamicIconInput.checked;
        saveSettings();
    });
    listen(backupInput, "change", () => {
        savedSettings.backupEnabled = backupInput.checked;
        applySettings();
        saveSettings();
    });
    listen(backupFrequency, "change", () => {
        savedSettings.backupFrequency = backupFrequency.value;
        saveSettings();
    });
    listen(backupFolder, "change", () => {
        const folder = backupFolder.value.trim();
        if (!validBackupFolder(folder)) {
            backupFolder.value = savedSettings.backupFolder || "Tavvy";
            backupNotice.textContent = t("settings.backup.backup_folder_help");
            return;
        }
        savedSettings.backupFolder = folder;
        backupFolder.value = folder;
        backupNotice.textContent = format(
            "settings.backup.backup_folder_path",
            {
                folder,
            },
        );
        saveSettings();
    });
    listen(markerSelect, "change", (event) => {
        savedSettings.markerStyle = event.target.value;
        applySettings();
        saveSettings();
    });
    listen(discardInput, "change", () => {
        savedSettings.discardInactiveTabs = discardInput.checked;
        applySettings();
        saveSettings();
    });
    function chooseTheme(value) {
        document.documentElement.classList.add("theme-changing");
        savedSettings.theme = value;
        delete savedSettings.brightness;
        applySettings();
        saveSettings();
        setTimeout(
            () => document.documentElement.classList.remove("theme-changing"),
            300,
        );
    }
    themeInputs.forEach((input) =>
        listen(input, "change", () => chooseTheme(input.value)),
    );
    if (themeSelect)
        listen(themeSelect, "change", () => chooseTheme(themeSelect.value));
    // Resizing the popup while dragging its width slider moves the slider under
    // the pointer (Firefox anchors the popup to the toolbar). Commit on release.
    listen(panelWidth, "change", () => {
        savedSettings.width = Number(panelWidth.value);
        applySettings();
        saveSettings();
    });
    listen(panelHeight, "change", () => {
        savedSettings.height = Number(panelHeight.value);
        applySettings();
        saveSettings();
    });
    listen(systemTheme, "change", applySettings);
    applySettings();
    const importButton = document.querySelector('[aria-label="Импортировать"]');
    if (document.documentElement.classList.contains("settings-page"))
        mountBackupRestore({
            listen,
            importButton,
            onRestoreBackup,
            waitForSave: () => savePending,
            onSettingsRestored(settings) {
                savedSettings = normalizeSettings(settings);
                setLanguage(savedSettings.language);
                translateStatic(document.querySelector(".popup"));
                applySettings();
                onLanguageChange?.();
            },
        });
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json,application/json";
    importInput.hidden = true;
    document.body.append(importInput);
    listen(importButton, "click", () => {
        if (onOpenImport) onOpenImport();
        else importInput.click();
    });
    listen(importInput, "change", async () => {
        try {
            if (!importInput.files[0]) return;
            const data = JSON.parse(await importInput.files[0].text());
            if (Array.isArray(data.groups)) {
                if (!onImportGroups)
                    throw new Error(t("errors.group_import_requires_firefox"));
                await onImportGroups(data);
                return;
            }
            if (!isSettingsExport(data)) throw new Error();
            savedSettings = normalizeSettings(data.settings);
            applySettings();
            saveSettings();
        } catch (error) {
            alert(translateText(error.message || "Не удалось загрузить файл"));
        } finally {
            importInput.value = "";
        }
    });
    const sizeSliders = [panelWidth, panelHeight];
    function updateSliderFill(slider) {
        slider.style.setProperty(
            "--progress",
            sliderProgress(slider.value, slider.min, slider.max),
        );
        const output = slider.parentElement.querySelector("output");
        if (output) output.textContent = `${slider.value} px`;
    }
    sizeSliders.forEach((slider) => {
        updateSliderFill(slider);
        listen(slider, "input", () => updateSliderFill(slider));
    });
    return dispose;
}
