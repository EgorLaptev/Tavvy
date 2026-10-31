import { createTabRow } from "./tab-row.js";
import { examples } from "./demo-data.js";
export function mountGroups({ recentTabs, renderRecent }) {
  document.querySelectorAll(".group").forEach((group) => {
    const header = group.querySelector(".group-header");
    const name = header.querySelector("strong").textContent;
    const button = document.createElement("button");
    button.className = header.className;
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = header.innerHTML;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "group-toggle";
    toggle.setAttribute("aria-label", "Показать вкладки группы " + name);
    toggle.setAttribute("aria-expanded", "false");
    toggle.append(
      button.querySelector(".count"),
      button.querySelector(".arrow"),
    );
    const wrapper = document.createElement("div");
    wrapper.className = "group-controls";
    wrapper.append(button, toggle);
    header.replaceWith(wrapper);
    const tabs = document.createElement("div");
    tabs.className = "tabs";
    tabs.classList.add("is-closed");
    const entries = examples[name] || [];
    if (entries.length)
      entries.forEach((title) =>
        tabs.append(createTabRow(title, { recentTabs, renderRecent })),
      );
    else {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Нет вкладок";
      tabs.append(empty);
    }
    const inner = document.createElement("div");
    inner.className = "tabs-inner";
    inner.append(...tabs.childNodes);
    tabs.append(inner);
    group.append(tabs);
    button.removeAttribute("aria-expanded");
    button.addEventListener("click", () => {
      document
        .querySelectorAll(".group.active")
        .forEach((item) => item.classList.remove("active"));
      group.classList.add("active");
    });
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      if (open) {
        tabs.style.height = tabs.scrollHeight + "px";
        requestAnimationFrame(() => {
          tabs.style.height = "0px";
          tabs.classList.add("is-closed");
        });
      } else {
        document
          .querySelectorAll('.group-toggle[aria-expanded="true"]')
          .forEach((other) => {
            if (other !== toggle) other.click();
          });
        tabs.classList.remove("is-closed");
        tabs.style.height = tabs.scrollHeight + "px";
      }
    });
  });
}
