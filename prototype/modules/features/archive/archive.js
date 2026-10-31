import { animatePanelResize } from "../../ui/transitions.js";
export function mountArchive({ recentTabs }) {
  const recentButton = document.querySelector(".recent-button");
  const recentList = document.querySelector(".recent-list");
  function renderRecent() {
    recentList.replaceChildren();
    recentButton.classList.toggle("is-visible", recentTabs.length > 0);
    recentButton.setAttribute("aria-hidden", String(recentTabs.length === 0));
    recentButton.tabIndex = recentTabs.length ? 0 : -1;
    if (!recentTabs.length) {
      const empty = document.createElement("div");
      empty.textContent = "Нет недавно закрытых вкладок";
      recentList.append(empty);
      return;
    }
    recentTabs.forEach((entry, index) => {
      const { title, closedAt, row, source } = entry;
      const item = document.createElement("div");
      item.className = "recent-row";
      const icon = document.createElement("span");
      icon.className = "tab-favicon";
      icon.textContent = title.charAt(0).toUpperCase();
      const label = document.createElement("span");
      label.className = "recent-title";
      label.textContent = title;
      const date = document.createElement("time");
      date.dateTime = closedAt.toISOString();
      const minutes = Math.floor((Date.now() - closedAt.getTime()) / 60000);
      date.textContent =
        minutes < 1
          ? "только что"
          : minutes < 60
            ? minutes + " мин назад"
            : closedAt.toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "short",
              });
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "restore-button";
      restore.setAttribute("aria-label", "Вернуть вкладку " + title);
      restore.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7a5 5 0 1 1 1.2 4M3 3v4h4"/></svg>';
      restore.addEventListener("click", () => {
        if (item.classList.contains("restoring")) return;
        animatePanelResize();
        item.classList.add("restoring");
        setTimeout(() => {
          const destination = source.querySelector(".tabs-inner");
          destination.querySelector(".empty")?.remove();
          destination.append(row);
          const count = source.querySelector(".count");
          count.textContent = String(Number(count.textContent) + 1);
          const tabs = source.querySelector(".tabs");
          if (!tabs.classList.contains("is-closed"))
            tabs.style.height = destination.scrollHeight + "px";
          recentTabs.splice(recentTabs.indexOf(entry), 1);
          if (
            !recentTabs.length &&
            recentButton.getAttribute("aria-expanded") === "true"
          ) {
            recentButton.setAttribute("aria-expanded", "false");
            recentList.hidden = true;
            document.querySelector(".groups").hidden = false;
            document.querySelector(".bottom-bar").hidden = false;
            document.querySelector(".archive-bar").hidden = true;
          }
          renderRecent();
        }, 200);
      });
      item.append(icon, label, date, restore);
      recentList.append(item);
    });
  }
  recentButton.addEventListener("click", () => {
    animatePanelResize();
    document
      .querySelectorAll('.group-toggle[aria-expanded="true"]')
      .forEach((toggle) => toggle.click());
    const open = recentButton.getAttribute("aria-expanded") === "true";
    recentButton.setAttribute("aria-expanded", String(!open));
    document.querySelector(".bottom-bar").hidden = !open;
    document.querySelector(".archive-bar").hidden = open;
    const groups = document.querySelector(".groups");
    const outgoing = open ? recentList : groups;
    const incoming = open ? groups : recentList;
    outgoing.classList.add("view-leaving");
    setTimeout(() => {
      outgoing.hidden = true;
      outgoing.classList.remove("view-leaving");
      incoming.hidden = false;
      incoming.classList.add("view-entering");
      if (!open) renderRecent();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => incoming.classList.remove("view-entering")),
      );
    }, 120);
  });

  renderRecent();
  const archiveBack = document.querySelector(".archive-back");
  const archiveClear = document.querySelector(".archive-clear");
  archiveBack.addEventListener("click", () => recentButton.click());
  let clearTimer;
  function cancelClear() {
    clearTimeout(clearTimer);
    archiveClear.classList.remove("holding");
  }
  archiveClear.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    archiveClear.setPointerCapture(event.pointerId);
    archiveClear.classList.add("holding");
    clearTimer = setTimeout(() => {
      recentTabs.length = 0;
      recentButton.setAttribute("aria-expanded", "false");
      recentList.hidden = true;
      document.querySelector(".groups").hidden = false;
      document.querySelector(".bottom-bar").hidden = false;
      document.querySelector(".archive-bar").hidden = true;
      cancelClear();
      renderRecent();
    }, 500);
  });
  archiveClear.addEventListener("pointerup", cancelClear);
  archiveClear.addEventListener("pointercancel", cancelClear);
  archiveClear.addEventListener("lostpointercapture", cancelClear);
  return { renderRecent };
}
