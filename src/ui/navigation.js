import { createEventScope } from "./event-scope.js";
import { animatePanelChange } from "./panel-layout.js";
export function mountNavigation({ onOpenSettings, settingsPage = false } = {}) {
  const { listen, dispose } = createEventScope();
  const settingsView = document.querySelector(".settings-view");
  const settingsBar = document.querySelector(".settings-bar");
  const themeView = document.querySelector(".theme-view:not(.language-view)");
  const languageView = document.querySelector(".language-view");
  const backupView = document.querySelector(".backup-view");
  function showSettings(show) {
    animatePanelChange(() => {
      document
        .querySelectorAll('.group-toggle[aria-expanded="true"]')
        .forEach((toggle) => {
          if (toggle.getAttribute("aria-expanded") === "true") toggle.click();
        });
      document.querySelector(".groups").hidden = show;
      document.querySelector(".bottom-bar").hidden = show;
      settingsView.hidden = !show;
      settingsBar.hidden = !show;
    });
  }
  function subpage(view, show) {
    animatePanelChange(() => {
      settingsView.hidden = show;
      view.hidden = !show;
    });
  }
  listen(document.querySelector(".settings-button"), "click", () =>
    onOpenSettings ? onOpenSettings() : showSettings(true),
  );
  listen(document.querySelector(".theme-open"), "click", () =>
    subpage(themeView, true),
  );
  listen(document.querySelector(".language-open"), "click", () =>
    subpage(languageView, true),
  );
  listen(document.querySelector(".backup-open"), "click", () =>
    subpage(backupView, true),
  );
  listen(document.querySelector(".settings-back"), "click", () => {
    if (!themeView.hidden) subpage(themeView, false);
    else if (!languageView.hidden) subpage(languageView, false);
    else if (!settingsPage && !backupView.hidden) subpage(backupView, false);
    else if (!settingsPage) showSettings(false);
  });
  if (settingsPage) {
    showSettings(true);
    const back = document.querySelector(".settings-back");
    const updateBack = () => { back.hidden = themeView.hidden && languageView.hidden; };
    const observer = new MutationObserver(updateBack);
    for (const view of [themeView, languageView]) observer.observe(view, { attributes: true, attributeFilter: ["hidden"] });
    updateBack();
    const backupButton = document.querySelector(".backup-open");
    const backupSection = document.createElement("section");
    backupSection.className = "settings-group settings-backups";
    const heading = document.createElement("h2");
    heading.dataset.i18n = "settings.backup.backups";
    heading.textContent = "Резервные копии";
    const dataSection = backupButton.closest(".settings-group");
    backupButton.hidden = true;
    backupSection.append(heading, backupView, backupButton);
    dataSection.remove();
    backupView.hidden = false;
    backupSection.id = "backup";
    settingsView.append(backupSection);
    const windowSection = document.querySelector("#settings-window-title").closest(".settings-group");
    const appearanceSection = document.querySelector(".settings-appearance");
    const generalSection = document.querySelector("#settings-tabs-title").closest(".settings-group");
    generalSection.id = "general";
    appearanceSection.id = "appearance";
    const leftColumn = document.createElement("div");
    const rightColumn = document.createElement("div");
    leftColumn.className = rightColumn.className = "settings-column";
    leftColumn.append(generalSection, windowSection);
    rightColumn.append(appearanceSection, backupSection);
    settingsView.replaceChildren(leftColumn, rightColumn);
    const anchor = window.location.hash.slice(1);
    if (["general", "appearance", "backup"].includes(anchor))
      requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
    return { themeView, languageView, dispose: () => { observer.disconnect(); dispose(); } };
  }
  return { themeView, languageView, dispose };
}
