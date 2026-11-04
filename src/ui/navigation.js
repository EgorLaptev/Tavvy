import { createEventScope } from "./event-scope.js";
import { animatePanelChange } from "./panel-layout.js";
export function mountNavigation() {
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
    showSettings(true),
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
    else if (!backupView.hidden) subpage(backupView, false);
    else showSettings(false);
  });
  return { themeView, languageView, dispose };
}
