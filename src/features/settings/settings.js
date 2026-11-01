import { createEventScope } from "../../ui/event-scope.js";
import { normalizeSettings, THEMES, validBackupFolder } from "../../domain/settings.js";
import { versionLabel } from "../../domain/version-names.js";
import { setLanguage, t, format, getLanguage, translateStatic } from "../../locales/index.js";
export function mountSettings({
  themeView,
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
  const languageRow = document.createElement("label");
  languageRow.className = "setting language-setting";
  const languageTitle = document.createElement("strong");
  languageTitle.textContent = "Язык";
  const languageSelect = document.createElement("select");
  languageSelect.setAttribute("aria-label", "Язык");
  for (const [value, label] of [["en", "English"], ["ru", "Русский"], ["zh-CN", "简体中文"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    languageSelect.append(option);
  }
  languageRow.append(languageTitle, languageSelect);
  document.querySelector(".settings-view").prepend(languageRow);
  let savePending = Promise.resolve();
  listen(document.querySelector(".backup-open"), "click", async () => {
    if (!onBackupStatus) return;
    try {
      const status = await onBackupStatus();
      backupNotice.textContent = status.error ? format("Ошибка: {error}", {error: t(status.error)}) : status.lastSuccess ? format("Последняя копия: {date}", {date: new Date(status.lastSuccess).toLocaleString(getLanguage())}) : t("Папка находится внутри загрузок Firefox.");
    } catch { backupNotice.textContent = t("Не удалось получить состояние резервного копирования."); }
  });
  listen(document.querySelector(".backup-create"), "click", async () => {
    if (!onBackup) { backupNotice.textContent = t("Создание копий доступно в расширении Firefox."); return; }
    backupNotice.textContent = t("Создание копии…");
    try { await savePending; await onBackup(); backupNotice.textContent = format("Копия сохранена в Загрузки/{folder}.", {folder: savedSettings.backupFolder}); }
    catch (error) { backupNotice.textContent = format("Не удалось создать копию: {error}", {error: t(error.message)}); }
  });
  const markerRow = document.createElement("div");
  markerRow.className = "setting marker-setting";
  const markerTitle = document.createElement("strong");
  markerTitle.textContent = "Метки групп";
  const markerSelect = document.createElement("div");
  markerSelect.className = "marker-options";
  markerSelect.setAttribute("role", "radiogroup");
  markerSelect.setAttribute("aria-label", "Форма меток групп");
  for (const [value, title] of [
    ["blob", "Блоб"],
    ["circle", "Круг"],
    ["square", "Скруглённый квадрат"],
    ["diamond", "Ромб"],
    ["letters2", "Первые две буквы"],
    ["letters", "Первые три буквы"],
    ["none", "Без метки"],
  ]) {
    const label = document.createElement("label");
    label.className = "marker-option";
    label.title = title;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "marker-style";
    input.value = value;
    input.setAttribute("aria-label", title);
    const preview = document.createElement("span");
    preview.className = `marker-preview marker-preview-${value}`;
    preview.setAttribute("aria-hidden", "true");
    label.append(input, preview);
    markerSelect.append(label);
  }
  markerRow.append(markerTitle, markerSelect);
  document.querySelector(".settings-view").append(markerRow);
  if (appVersion) {
    const version = document.createElement("div");
    version.className = "app-version";
    version.textContent = versionLabel(appVersion, t);
    document.querySelector(".github-link").before(version);
  }
  const themeInputs = [...themeView.querySelectorAll("input[name=theme]")];
  const panelWidth = document.querySelector("#panel-width");
  const panelHeight = document.querySelector("#panel-height");
  const systemTheme = matchMedia("(prefers-color-scheme: light)");
  let savedSettings = repository.read();
  setLanguage(savedSettings.language);
  function applySettings() {
    if (!THEMES.includes(savedSettings.theme))
      savedSettings.theme = "Чёрная";
    if (appVersion) document.querySelector(".app-version").textContent = versionLabel(appVersion, t);
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
      savedSettings.markerStyle || "blob";
    markerSelect.querySelectorAll("input").forEach((input) => {
      input.checked = input.value === (savedSettings.markerStyle || "blob");
    });
    animationInput.checked = Boolean(savedSettings.animations);
    languageSelect.value = savedSettings.language || "en";
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
    document.querySelector(".theme-current").textContent = t(savedSettings.theme);
  }
  function saveSettings() {
    savedSettings = normalizeSettings(savedSettings);
    savePending = Promise.resolve(repository.write(savedSettings));
  }
  listen(languageSelect, "change", () => {
    savedSettings.language = languageSelect.value;
    setLanguage(savedSettings.language);
    translateStatic(document.querySelector(".popup"));
    markerSelect.querySelectorAll(".marker-option").forEach((label, index) => {
      const key = ["Блоб", "Круг", "Скруглённый квадрат", "Ромб", "Первые две буквы", "Первые три буквы", "Без метки"][index];
      label.title = t(key);
      label.querySelector("input").setAttribute("aria-label", t(key));
    });
    applySettings();
    if (appVersion) document.querySelector(".app-version").textContent = versionLabel(appVersion, t);
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
      backupNotice.textContent = t("Укажи относительную папку внутри загрузок, например Tavvy/Backups.");
      return;
    }
    savedSettings.backupFolder = folder;
    backupFolder.value = folder;
    backupNotice.textContent = format("Папка: Загрузки/{folder}", {folder});
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
          throw new Error(t("Импорт групп доступен в расширении Firefox"));
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
      alert(t(error.message || "Не удалось загрузить файл"));
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
  }
  sizeSliders.forEach((slider) => {
    updateSliderFill(slider);
    listen(slider, "input", () => updateSliderFill(slider));
  });
  return dispose;
}
