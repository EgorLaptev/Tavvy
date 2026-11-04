import { LANGUAGES } from "../../domain/languages.js";
import { createEventScope } from "../../ui/event-scope.js";
import { normalizeSettings, THEMES, validBackupFolder } from "../../domain/settings.js";
import { versionLabel } from "../../domain/version-names.js";
import { setLanguage, t, format, getLanguage, translateStatic, translateText } from "../../locales/index.js";
export function mountSettings({
  themeView,
  languageView,
  repository,
  onImportGroups,
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
  const animationInput = document.querySelector('input[aria-label="Анимации"]');
  const groupPinnedInput = document.querySelector('input[aria-label="Закреплённые вкладки по группам"]');
  const nestedInput = document.querySelector('input[aria-label="Вложенные группы"]');
  const nestedVisibility = document.querySelector('select[aria-label="Показывать вкладки"]');
  const nestedVisibilityRow = document.querySelector(".nested-visibility-setting");
  const dynamicIconInput = document.querySelector('input[aria-label="Динамическая иконка"]');
  const archiveInput = document.querySelector('input[aria-label="Архив закрытых вкладок"]');
  const backupInput = document.querySelector('input[aria-label="Автоматические копии"]');
  const backupFrequency = document.querySelector('select[aria-label="Частота копирования"]');
  const backupFrequencyRow = document.querySelector(".backup-frequency");
  const backupFolder = document.querySelector(".backup-folder-input");
  const backupNotice = document.querySelector(".backup-notice");
  const appearanceGroup = document.querySelector(".settings-appearance");
  const languageCurrent = document.querySelector(".language-current");
  for (const [value, text] of LANGUAGES) {
    const label = document.createElement("label");
    label.className = "theme-option";
    const name = document.createElement("span");
    name.textContent = text;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "language";
    input.value = value;
    label.append(name, input);
    languageView.append(label);
  }
  let savePending = Promise.resolve();
  listen(document.querySelector(".backup-open"), "click", async () => {
    if (!onBackupStatus) return;
    try {
      const status = await onBackupStatus();
      backupNotice.textContent = status.error ? format("common.error_message", {error: translateText(status.error)}) : status.lastSuccess ? format("settings.backup.last_backup_date", {date: new Date(status.lastSuccess).toLocaleString(getLanguage())}) : t("settings.backup.the_folder_is_inside_firefox_downloads");
    } catch { backupNotice.textContent = t("settings.backup.could_not_get_backup_status"); }
  });
  listen(document.querySelector(".backup-create"), "click", async () => {
    if (!onBackup) { backupNotice.textContent = t("settings.backup.backups_are_available_in_the_firefox_extension"); return; }
    backupNotice.textContent = t("settings.backup.creating_backup");
    try { await savePending; await onBackup(); backupNotice.textContent = format("settings.backup.backup_saved_to_downloads_folder", {folder: savedSettings.backupFolder}); }
    catch (error) { backupNotice.textContent = format("settings.backup.could_not_create_backup_error", {error: translateText(error.message)}); }
  });
  const markerRow = document.createElement("div");
  markerRow.className = "setting marker-setting";
  const markerTitle = document.createElement("strong");
  markerTitle.textContent = "Метки групп";
  markerTitle.dataset.i18n = "settings.markers.title";
  const markerSelect = document.createElement("div");
  markerSelect.className = "marker-options";
  markerSelect.setAttribute("role", "radiogroup");
  markerSelect.setAttribute("aria-label", "Форма меток групп");
  markerSelect.setAttribute("data-i18n-aria-label", "settings.markers.style");
  for (const [value, title, key] of [
    ["blob", "Блоб", "settings.markers.blob"],
    ["circle", "Круг", "settings.markers.circle"],
    ["square", "Скруглённый квадрат", "settings.markers.rounded_square"],
    ["diamond", "Ромб", "settings.markers.diamond"],
    ["letters2", "Первые две буквы", "settings.markers.first_two_letters"],
    ["letters", "Первые три буквы", "settings.markers.first_three_letters"],
    ["none", "Без метки", "settings.markers.no_marker"],
  ]) {
    const label = document.createElement("label");
    label.className = "marker-option";
    label.title = title;
    label.setAttribute("data-i18n-title", key);
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "marker-style";
    input.value = value;
    input.setAttribute("aria-label", title);
    input.setAttribute("data-i18n-aria-label", key);
    const preview = document.createElement("span");
    preview.className = `marker-preview marker-preview-${value}`;
    preview.setAttribute("aria-hidden", "true");
    label.append(input, preview);
    markerSelect.append(label);
  }
  markerRow.append(markerTitle, markerSelect);
  appearanceGroup.append(markerRow);
  if (appVersion) {
    const version = document.createElement("div");
    version.className = "app-version";
    version.textContent = versionLabel(appVersion, translateText);
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
    if (appVersion) document.querySelector(".app-version").textContent = versionLabel(appVersion, translateText);
    const light =
      savedSettings.theme === "Светлая" ||
      (["Как в системе", "Стандартная"].includes(savedSettings.theme) && systemTheme.matches);
    document.documentElement.classList.toggle("light-theme", light);
    document.documentElement.classList.toggle(
      "dark-theme",
      savedSettings.theme === "Тёмная",
    );
    document.documentElement.classList.toggle("standard-theme", savedSettings.theme === "Стандартная");
    document.documentElement.classList.toggle(
      "animations-off",
      !savedSettings.animations,
    );
    document.documentElement.dataset.markerStyle =
      savedSettings.markerStyle;
    markerSelect.querySelectorAll("input").forEach((input) => {
      input.checked = input.value === (savedSettings.markerStyle);
    });
    animationInput.checked = Boolean(savedSettings.animations);
    languageCurrent.textContent = LANGUAGES.find(([code]) => code === savedSettings.language)?.[1] || "English";
    languageView.querySelectorAll('input[name="language"]').forEach((input) => {
      input.checked = input.value === savedSettings.language;
    });
    groupPinnedInput.checked = Boolean(savedSettings.groupPinnedTabs);
    nestedInput.checked = savedSettings.nestedGroups !== false;
    nestedVisibility.value = savedSettings.nestedTabsVisibility;
    nestedVisibilityRow.hidden = !nestedInput.checked;
    dynamicIconInput.checked = savedSettings.dynamicIcon !== false;
    archiveInput.checked = savedSettings.archiveEnabled !== false;
    backupInput.checked = Boolean(savedSettings.backupEnabled);
    backupFrequency.value = savedSettings.backupFrequency || "daily";
    backupFolder.value = savedSettings.backupFolder || "Tavvy";
    backupFrequencyRow.hidden = !backupInput.checked;
    discardInput.checked = Boolean(savedSettings.discardInactiveTabs);
    panelWidth.value = Math.max(
      320,
      Math.min(800, Number(savedSettings.width) || 440),
    );
    panelHeight.value = Math.max(
      200,
      Math.min(800, Number(savedSettings.height) || 300),
    );
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
          JSON.stringify({ width: Number(panelWidth.value), height: Number(panelHeight.value) }),
        );
      } catch {
        // Settings remain usable if the synchronous startup cache is unavailable.
      }
    }
    themeInputs.forEach((input) => {
      input.checked = input.value === savedSettings.theme;
    });
    document.querySelector(".theme-current").textContent = translateText(savedSettings.theme);
  }
  function saveSettings() {
    savedSettings = normalizeSettings(savedSettings);
    savePending = Promise.resolve(repository.write(savedSettings));
  }
  listen(languageView, "change", (event) => {
    if (!event.target.matches('input[name="language"]')) return;
    savedSettings.language = event.target.value;
    setLanguage(savedSettings.language);
    translateStatic(document.querySelector(".popup"));
    applySettings();
    if (appVersion) document.querySelector(".app-version").textContent = versionLabel(appVersion, translateText);
    saveSettings();
    onLanguageChange?.();
  });
  listen(animationInput, "change", () => {
    savedSettings.animations = animationInput.checked;
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
  listen(archiveInput, "change", () => {
    savedSettings.archiveEnabled = archiveInput.checked;
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
    backupNotice.textContent = format("settings.backup.backup_folder_path", {folder});
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
  themeInputs.forEach((input) =>
    listen(input, "change", () => {
      document.documentElement.classList.add("theme-changing");
      savedSettings.theme = input.value;
      delete savedSettings.brightness;
      applySettings();
      saveSettings();
      setTimeout(
        () => document.documentElement.classList.remove("theme-changing"),
        300,
      );
    }),
  );
  [panelWidth, panelHeight].forEach((input) =>
    listen(input, "input", () => {
      savedSettings.width = Number(panelWidth.value);
      savedSettings.height = Number(panelHeight.value);
      applySettings();
      saveSettings();
    }),
  );
  listen(systemTheme, "change", applySettings);
  applySettings();
  const importButton = document.querySelector('[aria-label="Импортировать"]');
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
      if (
        data.version !== 1 ||
        !data.settings ||
        !THEMES.includes(data.settings.theme) ||
        typeof data.settings.animations !== "boolean"
      )
        throw new Error();
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
      `${((slider.value - slider.min) / (slider.max - slider.min)) * 100}%`,
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
