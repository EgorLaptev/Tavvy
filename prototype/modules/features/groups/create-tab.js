import { createTabRow } from "./tab-row.js";
export function mountCreateTab({ recentTabs, renderRecent }) {
  document.querySelectorAll(".group").forEach((group) => {
    const controls = group.querySelector(".group-controls");
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-subgroup";
    add.textContent = "+";
    add.setAttribute("aria-label", "Новая вкладка в группе");
    controls.insertBefore(add, controls.querySelector(".group-toggle"));
    add.addEventListener("click", () => {
      document
        .querySelectorAll(".group.active")
        .forEach((item) => item.classList.remove("active"));
      group.classList.add("active");
      const row = createTabRow("Новая вкладка", { recentTabs, renderRecent });
      const list = group.querySelector(".tabs-inner");
      list.querySelector(".empty")?.remove();
      list.append(row);
      group.querySelector(".count").textContent =
        Number(group.querySelector(".count").textContent) + 1;
      const tabs = group.querySelector(".tabs");
      if (!tabs.classList.contains("is-closed"))
        tabs.style.height =
          tabs.querySelector(".tabs-inner").scrollHeight + "px";
    });
  });
}
