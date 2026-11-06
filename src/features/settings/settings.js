import { previewBackup } from "../../domain/backup-preview.js";
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
  onRestoreBackup,
  onOpenImport,
  cachePopupSize = false,
  onBackup,
  onBackupStatus,
  appVersion,
  onLanguageChange,
  requestSpacesPermission,
}) {
  const { listen, dispose } = createEventScope();
  const discardInput = document.querySelector(
    'input[aria-label="Выгружать неактивные вкладки"]',
  );
  const animationInput = document.querySelector('input[aria-label="Анимации"]');
  const closeTabsOnGroupDelete = document.querySelector(".close-tabs-on-group-delete");
  const groupPinnedInput = document.querySelector('input[aria-label="Закреплённые вкладки по группам"]');
  const nestedInput = document.querySelector('input[aria-label="Вложенные группы"]');
  const nestedVisibility = document.querySelector('select[aria-label="Показывать вкладки"]');
  const nestedVisibilityRow = document.querySelector(".nested-visibility-setting");
  const experimentalSpaces = document.querySelector(".experimental-spaces");
  const spacesPermissionNotice = document.querySelector(".spaces-permission-notice");
  const dynamicIconInput = document.querySelector('input[aria-label="Динамическая иконка"]');
  const backupInput = document.querySelector('input[aria-label="Автоматические копии"]');
  const backupFrequency = document.querySelector('select[aria-label="Частота копирования"]');
  const backupFrequencyRow = document.querySelector(".backup-frequency");
  const backupFolder = document.querySelector(".backup-folder-input");
  const backupNotice = document.querySelector(".backup-notice");
  const appearanceGroup = document.querySelector(".settings-appearance");
  const languageCurrent = document.querySelector(".language-current");
  let themeSelect, languageSelect;
  if (document.documentElement.classList.contains("settings-page")) {
    function makeSelect(button, labelKey, labelText) {
      const row = document.createElement("label");
      row.className = "setting";
      const title = document.createElement("strong");
      title.dataset.i18n = labelKey;
      title.textContent = labelText;
      const select = document.createElement("select");
      select.setAttribute("aria-label", labelText);
      select.setAttribute("data-i18n-aria-label", labelKey);
      row.append(title, select);
      button.before(row);
      button.hidden = true;
      return select;
    }
    themeSelect = makeSelect(appearanceGroup.querySelector(".theme-open:not(.language-open)"), "settings.theme.title", "Тема");
    for (const [value, key, label] of [["Чёрная", "black", "Чёрная"], ["Тёмная", "dark", "Тёмная"], ["Светлая", "light", "Светлая"], ["Стандартная", "default", "Стандартная"], ["Как в системе", "system", "Как в системе"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.dataset.i18n = `settings.theme.${key}`;
      option.textContent = label;
      themeSelect.append(option);
    }
    languageSelect = makeSelect(appearanceGroup.querySelector(".language-open"), "settings.language", "Язык");
    document.querySelector("#settings-tabs-title").after(languageSelect.closest(".setting"));
    for (const [value, label] of LANGUAGES) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      languageSelect.append(option);
    }
  }
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
  async function updateBackupStatus() {
    if (!onBackupStatus) return;
    try {
      const status = await onBackupStatus();
      backupNotice.textContent = status.error ? format("common.error_message", {error: translateText(status.error)}) : status.lastSuccess ? format("settings.backup.last_backup_date", {date: new Date(status.lastSuccess).toLocaleString(getLanguage())}) : t("settings.backup.the_folder_is_inside_firefox_downloads");
    } catch { backupNotice.textContent = t("settings.backup.could_not_get_backup_status"); }
  }
  listen(document.querySelector(".backup-open"), "click", updateBackupStatus);
  if (document.documentElement.classList.contains("settings-page")) void updateBackupStatus();
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
    if (appVersion) document.querySelector(".app-version").textContent = versionLabel(appVersion);
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
    if (themeSelect) themeSelect.value = savedSettings.theme;
    if (languageSelect) languageSelect.value = savedSettings.language;
    languageCurrent.textContent = LANGUAGES.find(([code]) => code === savedSettings.language)?.[1] || "English";
    languageView.querySelectorAll('input[name="language"]').forEach((input) => {
      input.checked = input.value === savedSettings.language;
    });
    closeTabsOnGroupDelete.checked = savedSettings.closeTabsOnGroupDelete !== false;
    groupPinnedInput.checked = Boolean(savedSettings.groupPinnedTabs);
    nestedInput.checked = savedSettings.nestedGroups !== false;
    nestedVisibility.value = savedSettings.nestedTabsVisibility;
    nestedVisibilityRow.hidden = !nestedInput.checked;
    dynamicIconInput.checked = savedSettings.dynamicIcon !== false;
    experimentalSpaces.checked = savedSettings.experimentalSpaces;
    backupInput.checked = Boolean(savedSettings.backupEnabled);
    backupFrequency.value = savedSettings.backupFrequency || "fourHours";
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
  function chooseLanguage(value) {
    savedSettings.language = value;
    setLanguage(savedSettings.language);
    translateStatic(document.querySelector(".popup"));
    applySettings();
    if (appVersion) document.querySelector(".app-version").textContent = versionLabel(appVersion);
    saveSettings();
    onLanguageChange?.();
  }
  listen(languageView, "change", (event) => {
    if (event.target.matches('input[name="language"]')) chooseLanguage(event.target.value);
  });
  if (languageSelect) listen(languageSelect, "change", () => chooseLanguage(languageSelect.value));
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
  listen(experimentalSpaces, "change", async () => {
    if (experimentalSpaces.checked) {
      let granted = false;
      try { granted = await requestSpacesPermission?.(); } catch {}
      if (!granted) {
        experimentalSpaces.checked = false;
        spacesPermissionNotice.hidden = false;
        return;
      }
    }
    spacesPermissionNotice.hidden = true;
    savedSettings.experimentalSpaces = experimentalSpaces.checked;
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
  function chooseTheme(value) {
    document.documentElement.classList.add("theme-changing");
    savedSettings.theme = value;
    delete savedSettings.brightness;
    applySettings();
    saveSettings();
    setTimeout(() => document.documentElement.classList.remove("theme-changing"), 300);
  }
  themeInputs.forEach((input) => listen(input, "change", () => chooseTheme(input.value)));
  if (themeSelect) listen(themeSelect, "change", () => chooseTheme(themeSelect.value));
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
  if (document.documentElement.classList.contains("settings-page")) {
    const area = document.createElement("div");
    area.className = "backup-restore";
    area.innerHTML = `<label class="backup-dropzone"><span class="backup-dropzone-title" data-i18n="settings.backup.drop_file">Перетащите файл сюда или выберите</span><span class="backup-dropzone-filename" aria-live="polite"></span><input class="backup-file-input" type="file" accept=".json,application/json" data-i18n-aria-label="import_page.choose_json_file" aria-label="Выбрать JSON-файл"></label><div class="backup-file-summary" hidden aria-live="polite"><strong class="backup-file-counts"></strong><p class="backup-file-extra"></p><ul class="backup-file-groups"></ul><p class="backup-file-more"></p></div><p class="backup-restore-help" data-i18n="settings.backup.safety_backup">Перед восстановлением будет создана резервная копия текущих вкладок.</p><label class="backup-restore-option"><input class="backup-close-existing" type="checkbox" checked><span data-i18n="import_page.close_existing_tabs">Закрыть текущие вкладки этого окна после восстановления</span></label><button class="backup-restore-submit" type="button" disabled data-i18n="settings.backup.restore_selected">Восстановить</button><p class="backup-restore-status" role="status" aria-live="polite"></p>`;
    importButton.before(area);
    importButton.hidden = true;
    const zone = area.querySelector(".backup-dropzone");
    const picker = area.querySelector(".backup-file-input");
    const filename = area.querySelector(".backup-dropzone-filename");
    const submit = area.querySelector(".backup-restore-submit");
    const result = area.querySelector(".backup-restore-status");
    const closeExisting = area.querySelector(".backup-close-existing");
    const summary = area.querySelector(".backup-file-summary");
    const counts = area.querySelector(".backup-file-counts");
    const extra = area.querySelector(".backup-file-extra");
    const groups = area.querySelector(".backup-file-groups");
    const more = area.querySelector(".backup-file-more");
    let selectedData = null, selectionId = 0;
    async function selectFile(file) {
      const current = ++selectionId;
      selectedData = null;
      summary.hidden = true;
      filename.textContent = file?.name || "";
      submit.disabled = true;
      result.textContent = file ? t("import_page.reading_file") : "";
      result.dataset.error = "false";
      if (!file) return;
      try {
        const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
        const preview = previewBackup(data);
        if (current !== selectionId) return;
        selectedData = data;
        counts.textContent = format("settings.backup.preview_counts", { groups: preview.groups.length, tabs: preview.tabs, pinned: preview.pinned });
        const details = [];
        if (preview.spaces) details.push(format("settings.backup.preview_spaces", { count: preview.spaces }));
        if (preview.legacy) details.push(format("settings.backup.preview_legacy", { count: preview.legacy }));
        extra.textContent = details.join(" · ");
        groups.replaceChildren(...preview.groups.slice(0, 30).map((group) => {
          const row = document.createElement("li");
          const name = document.createElement("span");
          name.textContent = group.title;
          const count = document.createElement("span");
          count.textContent = String(group.tabs);
          row.append(name, count);
          return row;
        }));
        more.textContent = preview.groups.length > 30 ? format("settings.backup.preview_more", { count: preview.groups.length - 30 }) : "";
        summary.hidden = false;
        result.textContent = "";
        submit.disabled = false;
      } catch (error) {
        if (current !== selectionId) return;
        result.dataset.error = "true";
        result.textContent = format("import_page.import_failed_error", { error: translateText(error.message) });
      }
    }
    listen(picker, "change", () => selectFile(picker.files?.[0]));
    for (const name of ["dragenter", "dragover"]) listen(zone, name, (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      zone.classList.add("is-dragging");
    });
    listen(zone, "dragleave", (event) => { if (!zone.contains(event.relatedTarget)) zone.classList.remove("is-dragging"); });
    listen(zone, "drop", (event) => {
      event.preventDefault();
      zone.classList.remove("is-dragging");
      if (!picker.disabled) selectFile(event.dataTransfer?.files?.[0]);
    });
    listen(submit, "click", async () => {
      if (!selectedData || !onRestoreBackup) return;
      summary.hidden = true;
      submit.disabled = true;
      picker.disabled = true;
      closeExisting.disabled = true;
      result.dataset.error = "false";
      result.textContent = t("import_page.reading_file");
      try {
        const data = selectedData;
        await savePending;
        const restored = await onRestoreBackup(data, closeExisting.checked);
        if (data.format === "tavvy-backup") {
          savedSettings = normalizeSettings(restored.settings);
          setLanguage(savedSettings.language);
          translateStatic(document.querySelector(".popup"));
          applySettings();
          onLanguageChange?.();
          result.textContent = t("import_page.backup_restored");
        } else {
          const report = restored.importReport;
          if (!report) throw new Error(t("import_page.import_result_missing"));
          result.textContent = report.alreadyImported ? t("import_page.backup_already_imported_no_duplicates") : format("import_page.import_complete", { groups: report.groups, tabs: report.tabs, pinned: report.pinnedTabs });
          if (report.browserPages) result.textContent += format("import_page.import_browser_pages_result", { count: report.browserPages });
          if (report.localFiles) result.textContent += format("import_page.import_local_files_result", { count: report.localFiles });
        }
      } catch (error) {
        result.dataset.error = "true";
        result.textContent = format("import_page.import_failed_error", { error: translateText(error.message) });
      } finally {
        submit.disabled = !selectedData;
        picker.disabled = false;
        closeExisting.disabled = false;
      }
    });
  }
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
