import { mountPageTheme } from "./page-theme.js";
import { setLanguage, t, translateStatic } from "../locales/index.js";
mountPageTheme(browser);
setLanguage("en");
translateStatic(document.documentElement);
browser.storage.local
  .get("tavvy:workspace:v1")
  .then((data) => {
    setLanguage(data["tavvy:workspace:v1"]?.settings?.language);
    translateStatic(document.documentElement);
  })
  .catch(() => {});
const input = document.querySelector("input");
try {
  const data = JSON.parse(decodeURIComponent(location.hash.slice(1)));
  const browserPage =
    typeof data.url === "string" &&
    /^(?:about:[a-z0-9-]+(?:[?#][^\s]*)?|moz-extension:\/\/[0-9a-f-]{36}\/(?:[^\s]*))$/i.test(
      data.url,
    );
  if (!data.url?.startsWith("file:") && !browserPage) throw new Error();
  if (browserPage) {
    document.querySelector("h1").dataset.i18n = "local_file.browser_page";
    document.querySelector("main > p").dataset.i18n =
      "local_file.browser_page_instructions";
    document.querySelector("input").dataset.i18nAriaLabel =
      "local_file.page_address";
    translateStatic(document.documentElement);
  }
  input.value = data.url;
  if (data.title) {
    document.title = data.title;
    document.querySelector("h1").textContent = data.title;
  }
} catch {
  document.querySelector('[role="status"]').textContent = t(
    "local_file.the_link_is_invalid",
  );
}
document.querySelector("button").addEventListener("click", async () => {
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
    document.querySelector('[role="status"]').textContent = t(
      "local_file.address_copied",
    );
  } catch {
    document.querySelector('[role="status"]').textContent = t(
      "local_file.address_selected_press_ctrl_c",
    );
  }
});
