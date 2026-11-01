import { buildViewIndex, windowRange } from "../ui/view-index.js";
import { animatePanelChange } from "../ui/panel-layout.js";
import { mountSettings } from "../features/settings/settings.js";
import { mountNavigation } from "../ui/navigation.js";
import {
  mountDragDrop,
  disposeDragState,
} from "../features/drag-drop/drag-drop.js";
import { mountMarkers } from "../ui/markers.js";
import { mountCompactScrollbar } from "../ui/compact-scrollbar.js";
import { groupMarker, markerLetters } from "../domain/group-marker.js";
import { GROUP_COLOR_PRESETS } from "../domain/colors.js";
import { t, format, getLanguage, translateStatic, translateText } from "../locales/index.js";
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function icon(path, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(svg.namespaceURI, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}
function button(label, className, child, action) {
  const node = element("button", className);
  node.type = "button";
  node.setAttribute("aria-label", label);
  node.append(child);
  node.addEventListener("click", action);
  return node;
}
function favicon(tab) {
  const fallback = element("span", "tab-favicon", tab.title?.charAt(0) || "•");
  if (/^(https?:|data:image\/|moz-extension:)/i.test(tab.faviconUrl || "")) {
    const img = element("img", "tab-favicon");
    img.src = tab.faviconUrl;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.replaceWith(fallback), {
      once: true,
    });
    return img;
  }
  return fallback;
}
export async function mountApplication(api) {
  if (api.isDemo) document.documentElement.classList.add("preview-mode");
  document.documentElement.classList.add("extension-mode");
  const windowInfo = await api.windows.getCurrent();
  const windowId = windowInfo.id;
  if (windowInfo.incognito)
    throw new Error("Приватные окна пока не поддерживаются");
  let viewIndex,
    filterResult,
    scrollFrame,
    disposed = false;
  const groupViews = new Map(),
    tabViews = new Map(),
    archiveViews = new Map();
  let snapshot,
    opened = new Set(),
    archiveOpen = false,
    searchTimer,
    refreshTimer,
    commandTail = Promise.resolve();
  const container = document.querySelector(".groups");
  const recentList = document.querySelector(".recent-list");
  const recentButton = document.querySelector(".recent-button");
  const search = document.querySelector(".search input");
  const palette = element("div", "group-color-palette");
  palette.hidden = true;
  palette.setAttribute("role", "group");
  palette.setAttribute("aria-label", "Выбрать цвет группы");
  document.querySelector(".popup").append(palette);
  let paletteAnchor = null;
  function closePalette(restoreFocus = false) {
    palette.hidden = true;
    paletteAnchor?.setAttribute("aria-expanded", "false");
    if (restoreFocus) paletteAnchor?.focus();
    paletteAnchor = null;
  }
  function outsidePalette(event) {
    if (!palette.hidden && !palette.contains(event.target) && event.target !== paletteAnchor)
      closePalette();
  }
  function paletteKey(event) {
    if (event.key === "Escape" && !palette.hidden) {
      event.preventDefault();
      closePalette(true);
    }
  }
  document.addEventListener("pointerdown", outsidePalette);
  document.addEventListener("keydown", paletteKey);
  container.addEventListener("scroll", () => closePalette(), { passive: true });
  const status = element("div", "extension-status");
  status.setAttribute("role", "status");
  document.querySelector(".popup").prepend(status);
  async function request(command) {
    const result = await api.runtime.sendMessage({
      channel: "tavvy-command",
      windowId,
      command,
    });
    if (!result?.ok)
      throw new Error(translateText(result?.error || "Фоновый процесс недоступен"));
    return result.snapshot;
  }
  let pendingSnapshot;
  function run(command) {
    if (disposed) return Promise.resolve();
    if (command.type === "snapshot" && pendingSnapshot) return pendingSnapshot;
    const result = commandTail.then(async () => {
      status.textContent = "";
      const closedGroup =
        command.type === "closeTab"
          ? viewIndex.tabs.get(command.tabId)?.groupId
          : null;
      const next = await request(command);
      if (disposed) return;
      const changed =
        next.viewVersion !== undefined
          ? next.viewVersion !== snapshot.viewVersion
          : true;
      snapshot = next;
      if (changed) viewIndex = buildViewIndex(snapshot);
      if (command.type === "createTab") {
        const path = new Set();
        let current = command.groupId;
        while (current && !path.has(current)) {
          path.add(current);
          current = snapshot.settings.nestedGroups === false ? null : viewIndex.groups.get(current)?.parentId;
        }
        opened = path;
      }
      if (closedGroup && !viewIndex.byGroup.get(closedGroup)?.length) {
        for (const id of [...opened]) {
          let current = id;
          while (current) {
            if (current === closedGroup) {
              opened.delete(id);
              break;
            }
            current = viewIndex.groups.get(current)?.parentId;
          }
        }
      }
      if (command.type === "activateGroup" && !api.isDemo) {
        window.close();
        return;
      }
      if (changed || command.type === "createTab") animatePanelChange(render);
      if (command.type === "importStg" && snapshot.importReport) {
        const report = snapshot.importReport;
        status.textContent = report.alreadyImported
          ? t("import_page.this_backup_has_already_been_imported")
          : format("import_page.import_summary", { groups: report.groups, tabs: report.tabs, pinned: report.pinnedTabs });
      }
    });
    commandTail = result.catch((error) => {
      if (disposed) return;
      status.textContent = error.message;
      render();
    });
    if (command.type === "snapshot") {
      pendingSnapshot = commandTail.finally(() => {
        pendingSnapshot = null;
      });
      return pendingSnapshot;
    }
    return commandTail;
  }
  snapshot = await request({ type: "snapshot" });
  viewIndex = buildViewIndex(snapshot);
  document.querySelector("#panel-height").max = "600";
  const navigation = mountNavigation();
  const disposeScrollbar = mountCompactScrollbar(document.querySelector(".popup"));
  mountSettings({
    ...navigation,
    appVersion: api.runtime.getManifest?.().version ?? api.appVersion,
    onLanguageChange: () => {
      create.textContent = t("groups.new_group_action");
      create.setAttribute("aria-label", t("groups.create_group"));
      input.placeholder = t("groups.group_name");
      input.setAttribute("aria-label", t("groups.group_name"));
      palette.setAttribute("aria-label", t("groups.choose_group_color"));
      for (const view of groupViews.values()) view.node.remove();
      groupViews.clear();
      tabViews.clear();
      archiveViews.clear();
      render();
    },
    cachePopupSize: !api.isDemo,
    onBackup: api.isDemo ? null : async () => {
      const result = await api.runtime.sendMessage({ channel: "tavvy-command", windowId, command: { type: "backupNow" } });
      if (!result?.ok) throw new Error(result?.error || "Ошибка резервного копирования");
    },
    onBackupStatus: api.isDemo ? null : async () => {
      const result = await api.runtime.sendMessage({ channel: "tavvy-command", windowId, command: { type: "backupStatus" } });
      if (!result?.ok) throw new Error(result?.error || "Ошибка состояния");
      return result.status;
    },
    onImportGroups: (backup) => run({ type: "importStg", backup }),
    onOpenImport: api.isDemo
      ? undefined
      : () =>
          api.tabs
            .create({
              windowId,
              url: api.runtime.getURL("import.html") + "?windowId=" + windowId,
            })
            .catch((error) => {
              status.textContent = error.message;
            }),
    repository: {
      read: () => snapshot.settings,
      write: (settings) => {
        return run({ type: "saveSettings", settings });
      },
    },
  });
  function showArchive(show) {
    animatePanelChange(() => {
      archiveOpen = show;
      opened.clear();
      document
        .querySelectorAll(".group-toggle[aria-expanded=true]")
        .forEach((toggle) => {
          if (toggle.getAttribute("aria-expanded") === "true") toggle.click();
        });
      container.hidden = show;
      recentList.hidden = !show;
      document.querySelector(".bottom-bar").hidden = show;
      document.querySelector(".archive-bar").hidden = !show;
      recentButton.setAttribute("aria-expanded", String(show));
      render();
    });
  }

  recentButton.addEventListener("click", () => showArchive(true));
  document
    .querySelector(".archive-back")
    .addEventListener("click", () => showArchive(false));
  const clear = document.querySelector(".archive-clear");
  let hold;
  clear.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    clear.setPointerCapture(event.pointerId);
    clear.classList.add("holding");
    hold = setTimeout(() => {
      run({ type: "clearArchive" });
      clear.classList.remove("holding");
    }, 500);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    clear.addEventListener(name, () => {
      clearTimeout(hold);
      clear.classList.remove("holding");
    });
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => animatePanelChange(render), 180);
  });
  const create = button(
    t("groups.create_group"),
    "create create-group",
    document.createTextNode(t("groups.new_group_action")),
    () => {
      create.hidden = true;
      form.hidden = false;
      const shape = groupMarker("new-group");
      draftMarker.style.borderRadius = shape.borderRadius;
      draftMarker.style.rotate = `${shape.rotation}deg`;
      draftMarker.style.background = ["#398dff", "#a855f7", "#00c98a", "#ff7800", "#ff168a"][snapshot.groups.length % 5];
      input.focus();
      form.scrollIntoView?.({ block: "nearest" });
    },
  );
  const form = element("form", "new-group-form");
  form.hidden = true;
  const draftControls = element("div", "group-controls");
  const draftHeader = element("div", "group-header");
  const draftMarker = element("span", "marker");
  const input = element("input");
  input.placeholder = t("groups.group_name");
  input.maxLength = 100;
  input.setAttribute("aria-label", t("groups.group_name"));
  draftHeader.append(draftMarker, input);
  const draftToggle = element("div", "group-toggle");
  draftToggle.setAttribute("aria-hidden", "true");
  draftToggle.append(element("span", "count", "0"), icon("m6 4 4 4-4 4", "arrow"));
  draftControls.append(draftHeader, draftToggle);
  form.append(draftControls);
  function cancelDraft() {
    input.value = "";
    form.hidden = true;
    create.hidden = false;
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (input.value.trim())
      run({ type: "createGroup", title: input.value }).then(() => {
        cancelDraft();
      });
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelDraft();
      create.focus();
    }
  });
  function order(parent, children) {
    for (let i = 0; i < children.length; i++)
      if (parent.childNodes[i] !== children[i])
        parent.insertBefore(children[i], parent.childNodes[i] || null);
    const keep = new Set(children);
    for (const node of [...parent.childNodes])
      if (!keep.has(node)) node.remove();
  }
  function expandedPath(group) {
    if (snapshot.settings.nestedGroups === false) return true;
    let parent = group.parentId;
    const visited = new Set();
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      if (!opened.has(parent)) return false;
      parent = viewIndex.groups.get(parent)?.parentId;
    }
    return true;
  }
  function makeGroup(group) {
    const node = element("section", "group");
    node.dataset.groupId = group.id;
    const controls = element("div", "group-controls"),
      marker = element("span", "marker"),
      title = element("strong");
    const header = button(group.id === "inbox" && group.title === "Основная" ? t("groups.main") : group.title, "group-header", marker, () =>
      run({ type: "activateGroup", groupId: group.id }),
    );
    header.append(title);
    const colorInput = button(`${t("groups.group_color")}: ${group.title}`, "group-color-input", document.createTextNode(""), () => {
      if (paletteAnchor === colorInput) { closePalette(); return; }
      closePalette();
      paletteAnchor = colorInput;
      colorInput.setAttribute("aria-expanded", "true");
      palette.replaceChildren();
      const markerShape = groupMarker(group.id);
      palette.style.setProperty("--swatch-radius", markerShape.borderRadius);
      palette.style.setProperty("--swatch-rotation", `${markerShape.rotation}deg`);
      palette.style.setProperty("--swatch-label", JSON.stringify(markerLetters(viewIndex.groups.get(group.id)?.title)));
      palette.style.setProperty("--swatch-label2", JSON.stringify(markerLetters(viewIndex.groups.get(group.id)?.title, 2)));
      const selected = viewIndex.groups.get(group.id)?.color?.toLowerCase();
      for (const [name, color] of GROUP_COLOR_PRESETS) {
        const swatch = button(t(name), "group-color-swatch", document.createTextNode(""), () => {
          closePalette(true);
          run({ type: "setGroupColor", groupId: group.id, color });
        });
        swatch.style.setProperty("--swatch-color", color);
        swatch.setAttribute("aria-label", t(name));
        swatch.dataset.color = color;
        swatch.setAttribute("aria-pressed", String(selected === color));
        palette.append(swatch);
      }
      palette.hidden = false;
      const anchorRect = colorInput.getBoundingClientRect();
      const paletteRect = palette.getBoundingClientRect();
      palette.style.left = `${Math.max(4, Math.min(anchorRect.left, window.innerWidth - paletteRect.width - 4))}px`;
      palette.style.top = `${Math.max(4, Math.min(anchorRect.bottom + 4, window.innerHeight - paletteRect.height - 4))}px`;
      palette.querySelector('[aria-pressed="true"]')?.focus();
    });
    colorInput.setAttribute("aria-expanded", "false");
    colorInput.setAttribute("aria-haspopup", "true");
    const count = element("span", "count");
    const toggle = button(t("groups.show_tabs"), "group-toggle", count, () =>
      animatePanelChange(() => {
        const closing = opened.has(group.id);
        for (const id of [...opened]) {
          const other = groupViews.get(id)?.node;
          if (!closing && other?.contains(node)) continue;
          opened.delete(id);
        }
        if (!closing) opened.add(group.id);
        render();
      }),
    );
    toggle.setAttribute("aria-expanded", "false");
    toggle.append(icon("m6 4 4 4-4 4", "arrow"));
    const add = button(
      t("groups.new_tab_in_group"),
      "add-subgroup",
      document.createTextNode("+"),
      () => run({ type: "createTab", groupId: group.id }),
    );
    controls.append(header, colorInput, add, toggle);
    const tabs = element("div", "tabs is-closed"),
      inner = element("div", "tabs-inner"),
      children = element("div", "subgroups");
    tabs.append(inner);
    node.append(controls, tabs, children);
    return {
      node,
      title,
      header,
      count,
      marker,
      colorInput,
      toggle,
      tabs,
      inner,
      children,
    };
  }
  function makeTab(tab) {
    const tabId = tab.id;
    const row = element("div", "tab-row");
    row.dataset.tabId = tab.id;
    const label = element("span", "tab-title"),
      close = button(
        t("tabs.close_tab"),
        "tab-close",
        icon("M4 4l8 8M12 4l-8 8"),
        (event) => {
          event.stopPropagation();
          run({ type: "closeTab", tabId: tabId });
        },
      );
    row.append(favicon(tab), label, close);
    row.addEventListener("click", () =>
      run({ type: "activateTab", tabId: tabId }),
    );
    return { row, label, close, title: null, icon: tab.faviconUrl };
  }
  function renderLists() {
    if (disposed || !filterResult) return;
    const used = new Set(),
      bounds = container.getBoundingClientRect();
    for (const [id, view] of groupViews)
      view.toggle.setAttribute("aria-expanded", String(opened.has(id)));
    for (const group of snapshot.groups) {
      const view = groupViews.get(group.id),
        isOpen = opened.has(group.id),
        reachable =
          expandedPath(group) &&
          filterResult.visible.has(group.id) &&
          !archiveOpen;
      view.toggle.setAttribute("aria-expanded", String(isOpen));
      view.tabs.classList.toggle("is-closed", !isOpen);
      if (!isOpen || !reachable) {
        view.inner.replaceChildren();
        view.tabs.style.height = "0px";
        continue;
      }
      const rows = filterResult.rows(group.id),
        offset = bounds.top - view.inner.getBoundingClientRect().top;
      const { start, end } = windowRange(
        rows.length,
        offset,
        container.clientHeight,
      );
      const desired = [];
      if (start) {
        const spacer = element("div", "tab-spacer");
        spacer.style.height = start * 30 + "px";
        spacer.setAttribute("aria-hidden", "true");
        desired.push(spacer);
      }
      for (const tab of rows.slice(start, end)) {
        let item = tabViews.get(tab.id);
        if (!item) {
          item = makeTab(tab);
          tabViews.set(tab.id, item);
        }
        if (item.title !== tab.title) {
          item.label.textContent = tab.url === "about:newtab" && tab.title === "Новая вкладка" ? t("tabs.new_tab") : tab.title;
          item.close.setAttribute("aria-label", t("tabs.close_tab") + " " + tab.title);
          item.title = tab.title;
        }
        if (item.icon !== tab.faviconUrl) {
          item.row.firstChild.replaceWith(favicon(tab));
          item.icon = tab.faviconUrl;
        }
        used.add(tab.id);
        desired.push(item.row);
      }
      if (end < rows.length) {
        const spacer = element("div", "tab-spacer");
        spacer.style.height = (rows.length - end) * 30 + "px";
        spacer.setAttribute("aria-hidden", "true");
        desired.push(spacer);
      }
      if (!rows.length) desired.push(element("div", "empty", t("tabs.no_tabs")));
      order(view.inner, desired);
      view.tabs.style.height = view.inner.scrollHeight + "px";
    }
    for (const [id, item] of tabViews)
      if (!used.has(id)) {
        item.row.remove();
        tabViews.delete(id);
      }
    mountDragDrop(dragActions);
  }
  const dragActions = {
    canNestGroup: () => snapshot.settings.nestedGroups !== false,
    onStartGroupDrag: (node) => {
      const groupId = node.dataset.groupId;
      if (!opened.has(groupId)) return;
      for (const id of [...opened]) {
        let current = id;
        const visited = new Set();
        while (current && !visited.has(current)) {
          if (current === groupId) {
            opened.delete(id);
            break;
          }
          visited.add(current);
          current = snapshot.settings.nestedGroups === false ? null : viewIndex.groups.get(current)?.parentId;
        }
      }
      renderLists();
    },
    onMoveGroup: (node) =>
      run({
        type: "moveGroup",
        groupId: node.dataset.groupId,
        parentId: node.parentElement.closest(".group")?.dataset.groupId || null,
        beforeId: node.nextElementSibling?.dataset.groupId || null,
      }),
    onDeleteGroup: (node) =>
      run({ type: "deleteGroup", groupId: node.dataset.groupId }),
    onMoveTab: (row, group) =>
      run({
        type: "moveTab",
        tabId: Number(row.dataset.tabId),
        groupId: group.dataset.groupId,
        index:
          viewIndex.tabs.get(Number(row.nextElementSibling?.dataset.tabId))
            ?.index ?? -1,
      }),
  };
  container.addEventListener(
    "scroll",
    () => {
      if (
        scrollFrame ||
        document.body.classList.contains("group-dragging") ||
        document.querySelector(".tab-row.dragging")
      )
        return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        if (
          document.body.classList.contains("group-dragging") ||
          document.querySelector(".tab-row.dragging")
        )
          return;
        renderLists();
      });
    },
    { passive: true },
  );
  function renderArchive() {
    if (!archiveOpen) {
      recentList.replaceChildren();
      archiveViews.clear();
      return;
    }
    const rows = [],
      live = new Set();
    for (const entry of snapshot.archive) {
      let item = archiveViews.get(entry.id);
      if (!item) {
        const row = element("div", "recent-row"),
          time = element("time");
        row.dataset.archiveId = entry.id;
        row.append(
          favicon(entry),
          element("span", "recent-title", entry.title),
          time,
          button(
            t("archive.restore_tab"),
            "restore-button",
            icon("M3 7a5 5 0 1 1 1.2 4M3 3v4h4"),
            () => run({ type: "restoreTab", entryId: entry.id }),
          ),
          button(
            t("archive.delete_recently_closed_tab"),
            "restore-button archive-delete-button",
            icon("M4 4l8 8M12 4l-8 8"),
            () => run({ type: "deleteArchivedTab", entryId: entry.id }),
          ),
        );
        item = { row, time };
        archiveViews.set(entry.id, item);
      }
      const minutes = Math.floor((Date.now() - entry.closedAt) / 60000);
      item.time.textContent =
        minutes < 1
          ? t("archive.just_now")
          : minutes < 60
            ? format("archive.minutes_ago", { count: minutes })
            : new Date(entry.closedAt).toLocaleDateString(getLanguage());
      rows.push(item.row);
      live.add(entry.id);
    }
    order(recentList, rows);
    for (const id of archiveViews.keys())
      if (!live.has(id)) archiveViews.delete(id);
  }
  function render() {
    if (disposed) return;
    const archiveAvailable = snapshot.settings.archiveEnabled !== false && snapshot.archive.length > 0;
    recentButton.classList.toggle("is-visible", archiveAvailable);
    recentButton.setAttribute("aria-hidden", String(!archiveAvailable));
    recentButton.tabIndex = archiveAvailable ? 0 : -1;
    if (archiveOpen && !archiveAvailable) {
      archiveOpen = false;
      opened.clear();
      container.hidden = false;
      recentList.hidden = true;
      document.querySelector(".bottom-bar").hidden = false;
      document.querySelector(".archive-bar").hidden = true;
      recentButton.setAttribute("aria-expanded", "false");
    }
    renderArchive();
    const query = search.value.trim().toLocaleLowerCase();
    filterResult = viewIndex.search(query);
    for (const [id, view] of groupViews)
      if (!viewIndex.groups.has(id)) {
        view.node.remove();
        groupViews.delete(id);
        opened.delete(id);
      }
    for (const group of snapshot.groups) {
      let view = groupViews.get(group.id);
      if (!view) {
        view = makeGroup(group);
        groupViews.set(group.id, view);
      }
      if (view.title.textContent !== group.title) {
        view.title.textContent = group.id === "inbox" && group.title === "Основная" ? t("groups.main") : group.title;
        view.marker.dataset.label = markerLetters(group.title);
        view.marker.dataset.label2 = markerLetters(group.title, 2);
        view.header.setAttribute("aria-label", group.id === "inbox" && group.title === "Основная" ? t("groups.main") : group.title);
        view.colorInput.setAttribute("aria-label", `${t("groups.group_color")}: ${group.title}`);
      }
      if (view.color !== group.color) {
        view.marker.style.background = group.color;
        view.marker.style.setProperty("--marker-color", group.color);
        view.color = group.color;
      }
      const count = String(viewIndex.byGroup.get(group.id)?.length || 0);
      if (view.count.textContent !== count) view.count.textContent = count;
      view.node.classList.toggle("active", group.id === snapshot.activeGroupId);
      view.node.hidden = !filterResult.visible.has(group.id);
    }
    const children = new Map();
    for (const group of snapshot.groups) {
      const parent = snapshot.settings.nestedGroups !== false && viewIndex.groups.has(group.parentId)
        ? group.parentId
        : null;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(groupViews.get(group.id).node);
    }
    // Reparent before removing obsolete child positions.
    for (const [parent, rows] of children)
      if (parent)
        for (const node of rows) {
          const target = groupViews.get(parent).children;
          if (node.parentElement !== target) target.append(node);
        }
    for (const [id, view] of groupViews)
      order(view.children, children.get(id) || []);
    order(container, [...(children.get(null) || []), form, create]);
    renderLists();
    mountMarkers();
  }
  const onMessage = (message) => {
    if (message?.channel !== "tavvy" || message.type !== "changed") return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function refresh() {
      if (
        document.body.classList.contains("group-dragging") ||
        document.querySelector(".tab-row.dragging")
      ) {
        refreshTimer = setTimeout(refresh, 150);
        return;
      }
      run({ type: "snapshot" });
    }, 100);
  };
  api.runtime.onMessage.addListener(onMessage);
  window.addEventListener(
    "pagehide",
    () => {
      disposed = true;
      disposeScrollbar();
      document.removeEventListener("pointerdown", outsidePalette);
      document.removeEventListener("keydown", paletteKey);
      disposeDragState();
      snapshot = null;
      viewIndex = null;
      filterResult = null;
      clearTimeout(searchTimer);
      clearTimeout(refreshTimer);
      clearTimeout(hold);
      cancelAnimationFrame(scrollFrame);
      api.runtime.onMessage.removeListener?.(onMessage);
      groupViews.clear();
      tabViews.clear();
      archiveViews.clear();
    },
    { once: true },
  );
  translateStatic(document.querySelector(".popup"));
  render();
}
