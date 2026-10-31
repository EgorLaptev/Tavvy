import { demoGroups } from "./demo-data.js";
export function mountDemoData() {
  const container = document.querySelector(".groups");
  for (const data of demoGroups) {
    const group = document.createElement("section");
    group.className = "group" + (data.active ? " active" : "");
    group.dataset.groupId = data.id;
    const header = document.createElement("div");
    header.className = "group-header";
    const marker = document.createElement("span");
    marker.className = "marker";
    marker.style.background = data.color;
    const name = document.createElement("strong");
    name.textContent = data.name;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = data.count;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "arrow");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", "m6 4 4 4-4 4");
    svg.append(path);
    header.append(marker, name, count, svg);
    group.append(header);
    container.append(group);
  }
}
