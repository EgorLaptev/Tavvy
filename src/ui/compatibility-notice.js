import { setLanguage, t } from "../locales/index.js";

const KEY = "tavvy:tab-manager-notice:v1";

export async function showCompatibilityNotice(api, popup, windowId) {
  if (api.isDemo) return;
  popup.classList.add("showing-compatibility-notice");
  const stored = await api.storage.local.get(KEY);
  if (stored[KEY] === true) {
    popup.classList.remove("showing-compatibility-notice");
    return;
  }

  const workspace = await api.storage.local.get("tavvy:workspace:v1");
  const initialLanguage = workspace["tavvy:workspace:v1"]?.settings?.language || "en";
  let language = initialLanguage;
  setLanguage(language);
  const notice = document.createElement("section");
  notice.className = "compatibility-notice";
  notice.setAttribute("aria-label", t("onboarding.title"));
  const title = document.createElement("h1");
  title.textContent = t("onboarding.title");
  const message = document.createElement("p");
  message.textContent = t("onboarding.message");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "compatibility-notice-continue";
  const actions = document.createElement("div");
  actions.className = "compatibility-notice-actions";
  const languageControl = document.createElement("label");
  languageControl.className = "compatibility-notice-language";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<path d="M4 5h10M9 3v2m3 0c-.4 4-3.4 7-7 8m1-5c1.3 2.1 3.3 3.8 5.5 4.7M13 20l3.5-9 3.5 9m-5.8-3h4.6"/>';
  const select = document.createElement("select");
  for (const [value, text] of [["en", "English"], ["ru", "Русский"], ["zh-CN", "简体中文"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = language;
  languageControl.append(svg, select);
  actions.append(button, languageControl);
  const error = document.createElement("p");
  error.className = "compatibility-notice-error";
  error.setAttribute("role", "alert");
  notice.append(title, message, actions, error);
  function translate() {
    notice.setAttribute("aria-label", t("onboarding.title"));
    title.textContent = t("onboarding.title");
    message.textContent = t("onboarding.message");
    button.textContent = t("onboarding.understood");
    select.setAttribute("aria-label", t("settings.language"));
    languageControl.title = t("settings.language");
    if (error.textContent) error.textContent = t("onboarding.save_failed");
  }
  select.addEventListener("change", () => {
    language = select.value;
    setLanguage(language);
    translate();
  });
  translate();
  popup.prepend(notice);
  await new Promise((resolve) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      select.disabled = true;
      try {
        if (language !== initialLanguage) {
          const send = (command) => api.runtime.sendMessage({ channel: "tavvy-command", windowId, command });
          const current = await send({ type: "snapshot" });
          if (!current?.ok) throw new Error("Could not load settings");
          const saved = await send({ type: "saveSettings", settings: { ...current.snapshot.settings, language } });
          if (!saved?.ok) throw new Error("Could not save language");
        }
        await api.storage.local.set({ [KEY]: true });
        notice.remove();
        popup.classList.remove("showing-compatibility-notice");
        resolve();
      } catch {
        error.textContent = t("onboarding.save_failed");
        button.disabled = false;
        select.disabled = false;
      }
    });
  });
}
