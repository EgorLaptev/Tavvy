import { parseStgBackup } from "../domain/stg-import.js";
import { normalizeSettings } from "../domain/settings.js";
import { setLanguage, t, format, translateStatic } from "../locales/index.js";
setLanguage("en");
translateStatic(document.documentElement);
browser.storage.local.get("tavvy:workspace:v1").then((data) => {
  setLanguage(data["tavvy:workspace:v1"]?.settings?.language);
  translateStatic(document.documentElement);
}).catch(() => {});
const input = document.querySelector("input[type=file]");
const status = document.querySelector("#status");
const retry = document.querySelector("#retry");
const done = document.querySelector("#done");
let file,
  busy = false;
const requestedWindow = Number(
  new URL(location.href).searchParams.get("windowId"),
);
async function targetWindow() {
  if (Number.isInteger(requestedWindow) && requestedWindow > 0) {
    try {
      const window = await browser.windows.get(requestedWindow);
      if (!window.incognito) return window.id;
    } catch {}
  }
  return (await browser.windows.getCurrent()).id;
}
async function command(payload) {
  const result = await browser.runtime.sendMessage({
    channel: "tavvy-command",
    windowId: await targetWindow(),
    command: payload,
  });
  if (!result?.ok)
    throw new Error(
      t(result?.error ||
        "Нет ответа фонового процесса. Перезагрузите Tavvy в about:debugging.",
      ),
    );
  return result.snapshot;
}
async function importFile() {
  if (!file || busy) return;
  busy = true;
  input.disabled = true;
  retry.hidden = true;
  done.hidden = true;
  status.dataset.error = "false";
  try {
    status.textContent = t("Чтение файла…");
    const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
    if (data.format === "tavvy-backup") {
      await command({ type: "importBackup", backup: data });
      status.textContent = t("Копия Tavvy восстановлена. Существующие вкладки сохранены; вкладки из копии добавлены в текущее окно.");
    } else if (Array.isArray(data.groups)) {
      const plan = parseStgBackup(data);
      status.textContent = format("Импорт групп: {groups}, вкладок: {tabs}.\nМожно оставить эту страницу открытой — она покажет результат.", {groups: plan.groups.length, tabs: plan.tabCount});
      const snapshot = await command({ type: "importStg", backup: data });
      const report = snapshot.importReport;
      if (!report)
        throw new Error(
          "Не получен результат импорта. Проверьте, что установлена последняя сборка Tavvy.",
        );
      status.textContent = report.alreadyImported
        ? t("Этот бэкап уже импортирован. Новые дубликаты не созданы.")
        : format("Готово. Групп: {groups}. Вкладок: {tabs}. Закреплённых: {pinned}.", {groups: report.groups, tabs: report.tabs, pinned: report.pinnedTabs});
      if (report.localFiles)
        status.textContent += format("\nЛокальные файлы ({count}) сохранены вкладками с исходным адресом.", {count: report.localFiles});
    } else {
      if (
        data.version !== 1 ||
        !data.settings ||
        typeof data.settings.animations !== "boolean"
      )
        throw new Error(t("Это не бэкап STG и не файл настроек Tavvy."));
      await command({
        type: "saveSettings",
        settings: normalizeSettings(data.settings),
      });
      status.textContent = t("Настройки импортированы.");
    }
    done.hidden = false;
  } catch (error) {
    status.dataset.error = "true";
    status.textContent = format("Импорт не выполнен: {error}", {error: t(error.message)});
    retry.hidden = false;
  } finally {
    busy = false;
    input.disabled = false;
    input.value = "";
  }
}
input.addEventListener("change", () => {
  file = input.files[0];
  if (file) importFile();
});
retry.addEventListener("click", importFile);
done.addEventListener("click", async () => {
  const tab = await browser.tabs.getCurrent();
  if (tab) await browser.tabs.remove(tab.id);
});
