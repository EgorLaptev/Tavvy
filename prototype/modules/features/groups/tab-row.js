export function refreshGroup(group) {
  const list = group.querySelector(":scope > .tabs .tabs-inner");
  const count = list.querySelectorAll(":scope > .tab-row").length;
  group.querySelector(":scope > .group-controls .count").textContent = count;
  const toggle = group.querySelector(":scope > .group-controls .group-toggle");
  const tabs = group.querySelector(":scope > .tabs");
  if (!count && toggle.getAttribute("aria-expanded") === "true") toggle.click();
  else if (!tabs.classList.contains("is-closed"))
    tabs.style.height = list.scrollHeight + "px";
}
export function createTabRow(title, { recentTabs, renderRecent }) {
  const row = document.createElement("div");
  row.className = "tab-row";
  const icon = document.createElement("span");
  icon.className = "tab-favicon";
  icon.textContent = title.charAt(0).toUpperCase();
  const label = document.createElement("span");
  label.textContent = title;
  const close = document.createElement("button");
  close.className = "tab-close";
  close.type = "button";
  close.setAttribute("aria-label", "Закрыть вкладку " + title);
  close.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  close.addEventListener("click", () => {
    const source = row.closest(".group");
    recentTabs.unshift({ title, closedAt: new Date(), row, source });
    row.remove();
    refreshGroup(source);
    renderRecent();
  });
  row.append(icon, label, close);
  return row;
}
