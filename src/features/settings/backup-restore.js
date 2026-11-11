import { previewBackup } from "../../domain/backup-preview.js";
import { t, format, translateText } from "../../locales/index.js";

/** Result line after restoring a Simple Tab Groups backup. */
function importResult(report) {
  if (!report) throw new Error(t("import_page.import_result_missing"));
  let text = report.alreadyImported
    ? t("import_page.backup_already_imported_no_duplicates")
    : format("import_page.import_complete", {
        groups: report.groups,
        tabs: report.tabs,
        pinned: report.pinnedTabs,
      });
  if (report.browserPages)
    text += format("import_page.import_browser_pages_result", {
      count: report.browserPages,
    });
  if (report.localFiles)
    text += format("import_page.import_local_files_result", {
      count: report.localFiles,
    });
  return text;
}

/**
 * The restore area of the settings page, placed instead of `importButton`: pick or drop a
 * backup file, preview its contents, then restore it. `waitForSave()` resolves once pending
 * settings are saved; `onSettingsRestored(settings)` applies settings from a Tavvy backup.
 */
export function mountBackupRestore({
  listen,
  importButton,
  onRestoreBackup,
  waitForSave,
  onSettingsRestored,
}) {
  const area = document.createElement("div");
  area.className = "backup-restore";
  // A literal template keeps the static markup visible to the add-on linter.
  area.innerHTML = `<label class="backup-dropzone"><span class="backup-dropzone-title" data-i18n="settings.backup.drop_file">Перетащите файл сюда или выберите</span><span class="backup-dropzone-filename" aria-live="polite"></span><input class="backup-file-input" type="file" accept=".json,application/json" data-i18n-aria-label="import_page.choose_json_file" aria-label="Выбрать JSON-файл"></label><div class="backup-file-summary" hidden aria-live="polite"><strong class="backup-file-counts"></strong><p class="backup-file-extra"></p><ul class="backup-file-groups"></ul><p class="backup-file-more"></p></div><p class="backup-restore-help" data-i18n="settings.backup.safety_backup">Перед восстановлением будет создана резервная копия текущих вкладок.</p><p class="backup-restore-help backup-restore-warning" data-i18n="import_page.replaces_all_tabs">Все текущие группы и вкладки во всех окнах будут закрыты и заменены содержимым файла.</p><button class="backup-restore-submit" type="button" disabled data-i18n="settings.backup.restore_selected">Восстановить</button><p class="backup-restore-status" role="status" aria-live="polite"></p>`;
  importButton.before(area);
  importButton.hidden = true;
  const zone = area.querySelector(".backup-dropzone");
  const picker = area.querySelector(".backup-file-input");
  const filename = area.querySelector(".backup-dropzone-filename");
  const submit = area.querySelector(".backup-restore-submit");
  const result = area.querySelector(".backup-restore-status");
  const summary = area.querySelector(".backup-file-summary");
  const counts = area.querySelector(".backup-file-counts");
  const extra = area.querySelector(".backup-file-extra");
  const groups = area.querySelector(".backup-file-groups");
  const more = area.querySelector(".backup-file-more");
  let selectedData = null,
    selectionId = 0;

  function showPreview(preview) {
    counts.textContent = format("settings.backup.preview_counts", {
      groups: preview.groups.length,
      tabs: preview.tabs,
      pinned: preview.pinned,
    });
    const details = [];
    if (preview.spaces)
      details.push(
        format("settings.backup.preview_spaces", { count: preview.spaces }),
      );
    if (preview.legacy)
      details.push(
        format("settings.backup.preview_legacy", { count: preview.legacy }),
      );
    extra.textContent = details.join(" · ");
    groups.replaceChildren(
      ...preview.groups.slice(0, 30).map((group) => {
        const row = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = group.title;
        const count = document.createElement("span");
        count.textContent = String(group.tabs);
        row.append(name, count);
        return row;
      }),
    );
    more.textContent =
      preview.groups.length > 30
        ? format("settings.backup.preview_more", {
            count: preview.groups.length - 30,
          })
        : "";
    summary.hidden = false;
  }

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
      const data = JSON.parse((await file.text()).replace(/^﻿/, ""));
      const preview = previewBackup(data);
      if (current !== selectionId) return;
      selectedData = data;
      showPreview(preview);
      result.textContent = "";
      submit.disabled = false;
    } catch (error) {
      if (current !== selectionId) return;
      result.dataset.error = "true";
      result.textContent = format("import_page.import_failed_error", {
        error: translateText(error.message),
      });
    }
  }
  listen(picker, "change", () => selectFile(picker.files?.[0]));
  for (const name of ["dragenter", "dragover"])
    listen(zone, name, (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      zone.classList.add("is-dragging");
    });
  listen(zone, "dragleave", (event) => {
    if (!zone.contains(event.relatedTarget))
      zone.classList.remove("is-dragging");
  });
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
    result.dataset.error = "false";
    result.textContent = t("import_page.reading_file");
    try {
      const data = selectedData;
      await waitForSave();
      const restored = await onRestoreBackup(data);
      if (data.format === "tavvy-backup") {
        onSettingsRestored(restored.settings);
        result.textContent = t("import_page.backup_restored");
      } else result.textContent = importResult(restored.importReport);
    } catch (error) {
      result.dataset.error = "true";
      result.textContent = format("import_page.import_failed_error", {
        error: translateText(error.message),
      });
    } finally {
      submit.disabled = !selectedData;
      picker.disabled = false;
    }
  });
}
