import { setLanguage, t, translateStatic } from "../locales/index.js";
setLanguage("en");
translateStatic(document.documentElement);
browser.storage.local.get("tavvy:workspace:v1").then((data) => {
  setLanguage(data["tavvy:workspace:v1"]?.settings?.language);
  translateStatic(document.documentElement);
}).catch(() => {});
const input = document.querySelector("input");
try {
  const data = JSON.parse(decodeURIComponent(location.hash.slice(1)));
  if (!data.url?.startsWith("file:")) throw new Error();
  input.value = data.url;
  if (data.title) { document.title = data.title; document.querySelector("h1").textContent = data.title; }
} catch { document.querySelector('[role="status"]').textContent = t("Ссылка повреждена"); }
document.querySelector("button").addEventListener("click", async () => {
  input.select();
  try { await navigator.clipboard.writeText(input.value); document.querySelector('[role="status"]').textContent = t("Адрес скопирован"); }
  catch { document.querySelector('[role="status"]').textContent = t("Адрес выделен — нажмите Ctrl+C"); }
});
