import { SPACE_ICONS, spaceIcon } from "../domain/spaces.js";
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
import { showCompatibilityNotice } from "./compatibility-notice.js";
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
const tabStatusIcons = [
  ["pinned", "M6 2h4l-.5 3L12 8v1H9v4l-1 1-1-1V9H4V8l2.5-3L6 2Z"],
  ["audible", "M2 6h3l4-3v10l-4-3H2V6Zm9-1c1.7 1.5 1.7 4.5 0 6m1.5-8c2.5 2.5 2.5 7.5 0 10"],
  ["muted", "M2 6h3l4-3v10l-4-3H2V6Zm9 1 3 3m0-3-3 3"],
  ["screen", "M2 3h12v8H2V3Zm4 10h4m-2-2v2"],
  ["microphone", "M6 3a2 2 0 0 1 4 0v4a2 2 0 0 1-4 0V3ZM4 7a4 4 0 0 0 8 0m-4 4v3m-2 0h4"],
  ["camera", "M2 4h8v8H2V4Zm8 2 4-2v8l-4-2V6Z"],
];
function renderTabStatus(container, tab, run) {
  const active = { pinned: tab.pinned || tab.managedPinned, audible: tab.audible && !tab.muted, muted: tab.muted, ...tab.sharingState };
  const states = tabStatusIcons.filter(([name]) => active[name]);
  const signature = states.map(([name]) => name).join(",") + ":" + getLanguage();
  if (container.dataset.status === signature) return;
  container.dataset.status = signature;
  container.replaceChildren(...states.map(([name, path]) => {
    const interactive = name === "pinned" || name === "audible" || name === "muted";
    const indicator = element(interactive ? "button" : "span", "tab-status-icon");
    indicator.dataset.status = name;
    if (interactive) {
      indicator.type = "button";
      indicator.title = t(name === "pinned" ? "tabs.actions.unpin" : (name === "muted" ? "tabs.actions.unmute" : "tabs.actions.mute"));
      indicator.addEventListener("click", (event) => {
        event.stopPropagation();
        run({ type: name === "pinned" ? "unpinTab" : "toggleTabMute", tabId: tab.id });
      });
    } else {
      indicator.title = t(`tabs.status.${name}`);
      indicator.setAttribute("role", "img");
    }
    indicator.setAttribute("aria-label", indicator.title);
    indicator.append(icon(path));
    return indicator;
  }));
}
export async function mountApplication(api) {
  if (api.isDemo) document.documentElement.classList.add("preview-mode");
  document.documentElement.classList.add("extension-mode");
  const windowInfo = await api.windows.getCurrent();
  const windowId = windowInfo.id;
  if (windowInfo.incognito)
    throw new Error("Приватные окна пока не поддерживаются");
  await showCompatibilityNotice(api, document.querySelector(".popup"), windowId);
  let viewIndex,
    filterResult,
    scrollFrame,
    disposed = false;
  const groupViews = new Map(),
    tabViews = new Map();
  let snapshot,
    opened = new Set(api.isDemo ? api.previewExpandedGroupIds || [] : []),
    searchTimer,
    refreshTimer,
    commandTail = Promise.resolve();
  const container = document.querySelector(".groups");
  const groupMenu = element("div", "group-context-menu");
  const groupSubmenu = element("div", "group-context-menu group-context-submenu");
  groupMenu.hidden = true;
  groupSubmenu.hidden = true;
  groupMenu.setAttribute("role", "menu");
  groupSubmenu.setAttribute("role", "menu");
  document.querySelector(".popup").append(groupMenu, groupSubmenu);
  function resetGroupMenu() {
    groupMenu.hidden = true;
    groupMenu.replaceChildren();
    groupSubmenu.hidden = true;
    groupSubmenu.replaceChildren();
  }
  function closeGroupMenu() { resetGroupMenu(); }
  function outsideGroupMenu(event) { if (!groupMenu.contains(event.target) && !groupSubmenu.contains(event.target)) closeGroupMenu(); }
  function groupMenuKey(event) {
    if (event.key !== "Escape" || groupMenu.hidden) return;
    event.preventDefault();
    if (!groupSubmenu.hidden) { groupSubmenu.hidden = true; const trigger = groupMenu.querySelector('[aria-expanded="true"]'); trigger?.setAttribute("aria-expanded", "false"); trigger?.focus(); }
    else closeGroupMenu();
  }
  document.addEventListener("pointerdown", outsideGroupMenu);
  document.addEventListener("keydown", groupMenuKey);
  const addAction = (label, action, disabled = false, className = "", keepOpen = false, parent = groupMenu) => {
    const item = button(label, "group-context-item", element("span", "group-context-label", label), () => { if (!keepOpen) closeGroupMenu(); action(); });
    if (className) item.classList.add(className);
    item.setAttribute("role", "menuitem");
    item.disabled = disabled;
    parent.append(item);
    return item;
  };
  function showSubmenu(trigger, entries) {
    const wasOpen = trigger.getAttribute("aria-expanded") === "true";
    groupMenu.querySelectorAll('[aria-expanded="true"]').forEach((item) => item.setAttribute("aria-expanded", "false"));
    if (wasOpen) { groupSubmenu.hidden = true; return; }
    groupSubmenu.replaceChildren();
    for (const entry of entries) {
      const item = addAction(entry.label, entry.action, false, "", false, groupSubmenu);
      if (entry.group) {
        const marker = element("span", "marker group-context-marker");
        const shape = groupMarker(entry.group.id);
        marker.style.borderRadius = shape.borderRadius;
        marker.style.rotate = `${shape.rotation}deg`;
        marker.style.background = entry.group.color;
        marker.style.setProperty("--marker-color", entry.group.color);
        marker.dataset.label = markerLetters(entry.group.title);
        marker.dataset.label2 = markerLetters(entry.group.title, 2);
        marker.setAttribute("aria-hidden", "true");
        item.prepend(marker);
      }
      if (entry.space && entry.space.id !== "default") {
        const marker = element("span", "spaces-icon spaces-icon-container");
        marker.style.maskImage = `url("${spaceIconUrl(spaceIcon(entry.space.icon))}")`;
        marker.setAttribute("aria-hidden", "true");
        item.prepend(marker);
      }
    }
    groupSubmenu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const menuBounds = groupMenu.getBoundingClientRect(), triggerBounds = trigger.getBoundingClientRect(), submenuBounds = groupSubmenu.getBoundingClientRect();
    const left = menuBounds.right + submenuBounds.width <= window.innerWidth ? menuBounds.right : menuBounds.left - submenuBounds.width;
    groupSubmenu.style.left = `${Math.max(0, left)}px`;
    groupSubmenu.style.top = `${Math.max(0, Math.min(triggerBounds.top, window.innerHeight - submenuBounds.height))}px`;
  }
  function addSubmenu(label, entries, className) {
    let trigger;
    trigger = addAction(label, () => showSubmenu(trigger, entries), !entries.length, className, true);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.append(icon("m6 3 5 5-5 5", "group-context-arrow"));
  }

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
      event.stopImmediatePropagation();
      closePalette(true);
    }
  }
  function showPalette(anchor, label, iconMode = false) {
    paletteAnchor = anchor;
    anchor.setAttribute("aria-expanded", "true");
    palette.setAttribute("aria-label", label);
    palette.classList.toggle("space-icon-palette", iconMode);
    palette.hidden = false;
    const anchorRect = anchor.getBoundingClientRect();
    const paletteRect = palette.getBoundingClientRect();
    palette.style.left = `${Math.max(4, Math.min(anchorRect.left, window.innerWidth - paletteRect.width - 4))}px`;
    palette.style.top = `${Math.max(4, Math.min(anchorRect.bottom + 4, window.innerHeight - paletteRect.height - 4))}px`;
    palette.querySelector('[aria-pressed="true"]')?.focus();
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
    // Send while the popup is alive; the background serializes commands. UI
    // responses are still applied in order even if the popup closes meanwhile.
    const closedGroup = command.type === "closeTab"
      ? viewIndex.tabs.get(command.tabId)?.groupId
      : null;
    const pending = request(command).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    const result = commandTail.then(async () => {
      const response = await pending;
      if (disposed) return;
      status.textContent = "";
      if (response.error) throw response.error;
      const next = response.value;
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
  const settingsPage = document.documentElement.classList.contains("settings-page");
  const navigation = mountNavigation({
    settingsPage,
    onOpenSettings: !api.isDemo && !settingsPage && api.runtime.openOptionsPage
      ? () => api.runtime.openOptionsPage().then(() => window.close()).catch((error) => { status.textContent = error.message; })
      : undefined,
  });
  const disposeScrollbar = mountCompactScrollbar(document.querySelector(".popup"));
  mountSettings({
    ...navigation,
    appVersion: api.runtime.getManifest?.().version ?? api.appVersion,
    requestSpacesPermission: () => api.permissions?.request({ permissions: ["cookies"] }),
    onLanguageChange: () => {
      create.textContent = t("groups.new_group_action");
      create.setAttribute("aria-label", t("groups.create_group"));
      input.placeholder = t("groups.group_name");
      input.setAttribute("aria-label", t("groups.group_name"));
      palette.setAttribute("aria-label", t("groups.choose_group_color"));
      for (const view of groupViews.values()) view.node.remove();
      groupViews.clear();
      tabViews.clear();
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
    onRestoreBackup: api.isDemo ? null : async (backup, closeExistingTabs) => {
      const type = backup?.format === "tavvy-backup" ? "importBackup" : "importStg";
      const result = await api.runtime.sendMessage({ channel: "tavvy-command", windowId, command: { type, backup, closeExistingTabs } });
      if (!result?.ok) throw new Error(translateText(result?.error || "Фоновый процесс недоступен"));
      await run({ type: "snapshot" });
      return result.snapshot;
    },
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
  const spaceIconUrl = (name) => api.spaceIconUrl?.(name) || `resource://usercontext-content/${name}.svg`;
  const spacesBar = document.querySelector(".spaces-bar");
  const spacesTrigger = spacesBar.querySelector(".spaces-trigger");
  const spacesCurrent = spacesBar.querySelector(".spaces-current");
  const spacesIcon = spacesTrigger.querySelector(".spaces-icon");
  const spacesMenu = spacesBar.querySelector(".spaces-menu");
  const spacesOptions = spacesMenu.querySelector(".spaces-options");
  let spacesCloseTimer, spacesOpenFrame, spacesSignature, rebindSpaceId = null;
  function setSpacesMenu(open, restoreFocus = false) {
    clearTimeout(spacesCloseTimer);
    cancelAnimationFrame(spacesOpenFrame);
    spacesTrigger.setAttribute("aria-expanded", String(open));
    spacesMenu.setAttribute("aria-hidden", String(!open));
    spacesMenu.inert = !open;
    if (open) {
      spacesMenu.hidden = false;
      renderSpaces();
      run({ type: "snapshot" });
      spacesOpenFrame = requestAnimationFrame(() => spacesMenu.classList.add("is-open"));
    } else {
      rebindSpaceId = null;
      spacesSignature = undefined;
      if (paletteAnchor && spacesBar.contains(paletteAnchor)) closePalette();
      spacesMenu.classList.remove("is-open");
      if (document.documentElement.classList.contains("animations-off") || matchMedia("(prefers-reduced-motion: reduce)").matches)
        spacesMenu.hidden = true;
      else spacesCloseTimer = setTimeout(() => { spacesMenu.hidden = true; }, 140);
      if (restoreFocus) spacesTrigger.focus();
    }
  }
  spacesTrigger.addEventListener("click", () => setSpacesMenu(spacesTrigger.getAttribute("aria-expanded") !== "true"));
  function outsideSpaces(event) {
    if (spacesTrigger.getAttribute("aria-expanded") === "true" && !spacesBar.contains(event.target) && !palette.contains(event.target)) setSpacesMenu(false);
  }
  function spacesKey(event) {
    if (spacesTrigger.getAttribute("aria-expanded") !== "true") return;
    if (event.key === "Escape") { event.preventDefault(); setSpacesMenu(false, true); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...spacesMenu.querySelectorAll('button:not([hidden])')].filter((item) => !item.closest("[hidden]"));
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
      event.key === "ArrowDown" ? (current + 1) % items.length : (current <= 0 ? items.length - 1 : current - 1);
    event.preventDefault();
    items[next].focus();
  }
  document.addEventListener("pointerdown", outsideSpaces);
  document.addEventListener("focusin", outsideSpaces);
  document.addEventListener("keydown", spacesKey);
  function renderSpaces() {
    const spaces = snapshot.spaces || [{ id: "default", name: "" }];
    const selectedId = snapshot.activeSpaceId || "default";
    const selected = spaces.find((item) => item.id === selectedId) || spaces[0];
    spacesBar.hidden = !snapshot.settings.experimentalSpaces;
    if (spacesBar.hidden && spacesTrigger.getAttribute("aria-expanded") === "true") setSpacesMenu(false);
    spacesCurrent.textContent = selected.id === "default" ? t("spaces.default") : selected.name;
    spacesTrigger.setAttribute("aria-label", `${t("spaces.title")}: ${spacesCurrent.textContent}`);
    spacesIcon.hidden = selected.id === "default";
    spacesIcon.classList.toggle("spaces-icon-default", selected.id === "default");
    spacesIcon.classList.toggle("spaces-icon-container", selected.id !== "default");
    spacesIcon.style.maskImage = selected.id === "default" ? "" : `url("${spaceIconUrl(spaceIcon(selected.icon))}")`;
    const signature = JSON.stringify([spaces, selectedId, getLanguage(), rebindSpaceId]);
    if (spacesSignature === signature) return;
    spacesSignature = signature;
    if (rebindSpaceId) {
      const heading = element("div", "spaces-rebind-title", t("spaces.choose_existing_container"));
      const choices = spaces.filter((item) => item.firefoxContainer);
      const nodes = choices.map((item) => {
        const choice = button(item.name, "spaces-option spaces-rebind-option", document.createTextNode(item.name), () => {
          const missingId = rebindSpaceId;
          rebindSpaceId = null;
          setSpacesMenu(false, true);
          run({ type: "rebindSpace", spaceId: missingId, cookieStoreId: item.id.slice("container:".length) });
        });
        choice.setAttribute("role", "menuitem");
        return choice;
      });
      if (!choices.length) nodes.push(element("div", "spaces-rebind-empty", t("spaces.no_available_containers")));
      const back = button(t("spaces.cancel"), "spaces-option spaces-rebind-back", document.createTextNode(t("spaces.cancel")), () => {
        rebindSpaceId = null;
        renderSpaces();
      });
      back.setAttribute("role", "menuitem");
      spacesOptions.replaceChildren(heading, ...nodes, back);
      return;
    }
    spacesOptions.replaceChildren(...spaces.map((space) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "spaces-option";
      option.dataset.spaceId = space.id;
      option.setAttribute("role", "menuitemradio");
      option.setAttribute("aria-checked", String(space.id === selectedId));
      const marker = document.createElement("span");
      marker.className = `spaces-icon ${space.id === "default" ? "spaces-icon-default" : "spaces-icon-container"}`;
      marker.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "spaces-option-label";
      label.textContent = space.id === "default" ? t("spaces.default") : space.name;
      option.append(label);
      if (space.unavailable) {
        option.title = t("spaces.container_unavailable");
        option.setAttribute("aria-label", `${space.name}: ${t("spaces.container_unavailable")}`);
        const missing = element("span", "spaces-unavailable", "!");
        missing.setAttribute("aria-hidden", "true");
        option.append(missing);
      }
      option.addEventListener("click", () => {
        if (space.unavailable) {
          rebindSpaceId = space.id;
          renderSpaces();
          return;
        }
        setSpacesMenu(false, true);
        if (space.id === selectedId) return;
        opened.clear();
        run({ type: "activateSpace", spaceId: space.id });
      });
      const row = document.createElement("div");
      row.className = "spaces-option-row";
      if (space.id !== "default") {
        marker.style.maskImage = `url("${spaceIconUrl(spaceIcon(space.icon))}")`;
        const iconButton = document.createElement("button");
        iconButton.type = "button";
        iconButton.className = "spaces-icon-button";
        iconButton.setAttribute("aria-label", `${t("spaces.choose_icon")}: ${space.name}`);
        iconButton.setAttribute("aria-expanded", "false");
        iconButton.setAttribute("aria-haspopup", "true");
        iconButton.append(marker);
        iconButton.addEventListener("click", () => {
          if (paletteAnchor === iconButton) { closePalette(); return; }
          closePalette();
          palette.replaceChildren();
          for (const name of SPACE_ICONS) {
            const glyph = element("span", "spaces-icon spaces-icon-container");
            glyph.style.maskImage = `url("${spaceIconUrl(name)}")`;
            glyph.setAttribute("aria-hidden", "true");
            const choice = button(`${t("spaces.choose_icon")}: ${name}`, "group-color-swatch spaces-icon-choice", glyph, () => {
              closePalette(true);
              run({ type: "setSpaceIcon", spaceId: space.id, icon: name });
            });
            choice.setAttribute("aria-pressed", String(name === spaceIcon(space.icon)));
            palette.append(choice);
          }
          showPalette(iconButton, t("spaces.choose_icon"), true);
        });
        row.append(iconButton);
      }
      row.append(option);
      if (space.unavailable) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "tab-close spaces-delete";
        remove.setAttribute("aria-label", `${t("spaces.delete")}: ${space.name}`);
        remove.title = t("spaces.delete");
        remove.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4 4 12" /></svg>';
        remove.addEventListener("click", () => {
          if (!window.confirm(t("spaces.delete_confirm").replace("{name}", space.name))) return;
          opened.clear();
          run({ type: "deleteSpace", spaceId: space.id }).then(() => setSpacesMenu(false, true));
        });
        row.append(remove);
      }
      return row;
    }));
  }
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
      showPalette(colorInput, t("groups.choose_group_color"));
    });
    colorInput.setAttribute("aria-expanded", "false");
    colorInput.setAttribute("aria-haspopup", "true");
    const count = element("span", "count");
    const toggle = button(t("groups.show_tabs"), "group-toggle", count, () =>
      animatePanelChange(() => {
        const closing = opened.has(group.id);
        for (const id of [...opened]) {
          const other = groupViews.get(id)?.node;
          if (closing) {
            if (id === group.id || (other && node.contains(other))) opened.delete(id);
          } else if (!other?.contains(node)) opened.delete(id);
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
    function renameGroup() {
      if (controls.querySelector(".group-rename-input")) return;
      const field = element("input", "group-rename-input");
      const current = viewIndex.groups.get(group.id);
      const original = current.id === "inbox" && current.title === "Основная" ? t("groups.main") : current.title;
      field.value = original;
      field.maxLength = 100;
      field.setAttribute("aria-label", t("groups.rename_group"));
      const bounds = controls.getBoundingClientRect();
      const labelBounds = title.getBoundingClientRect();
      field.style.left = `${labelBounds.left - bounds.left}px`;
      field.style.width = `${labelBounds.width}px`;
      title.style.visibility = "hidden";
      controls.append(field);
      let finished = false;
      function finish(save) {
        if (finished) return;
        finished = true;
        const next = field.value.trim();
        field.remove();
        title.style.visibility = "";
        if (save && next && next !== original) run({ type: "renameGroup", groupId: group.id, title: next });
      }
      field.addEventListener("click", (e) => e.stopPropagation());
      field.addEventListener("pointerdown", (e) => e.stopPropagation());
      field.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
      });
      field.addEventListener("blur", () => finish(true));
      field.focus();
      field.select();
    }
    controls.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetGroupMenu();
      const destinations = snapshot.spaces.filter((space) => space.id !== snapshot.activeSpaceId && !space.unavailable);
      function showActions() {
        groupMenu.replaceChildren();
        addAction(t("groups.rename_group"), renameGroup);
        addAction(t("groups.clear_group"), () => { if (window.confirm(t("groups.clear_confirm"))) run({ type: "clearGroup", groupId: group.id }); });
        addAction(t("groups.reload_group"), () => run({ type: "reloadGroup", groupId: group.id }));
        if (snapshot.settings.nestedGroups !== false && group.id !== "inbox") {
          const current = viewIndex.groups.get(group.id);
          const validParent = (candidate) => {
            let item = candidate;
            while (item) { if (item.id === group.id) return false; item = item.parentId ? viewIndex.groups.get(item.parentId) : null; }
            return candidate.id !== current.parentId;
          };
          const entries = snapshot.groups.filter(validParent).map((item) => ({
            label: item.id === "inbox" && item.title === "Основная" ? t("groups.main") : item.title,
            group: item,
            action: () => run({ type: "moveGroup", groupId: group.id, parentId: item.id }),
          }));
          if (current.parentId) entries.unshift({ label: t("groups.move_to_root"), action: () => run({ type: "moveGroup", groupId: group.id, parentId: null }) });
          addSubmenu(t("groups.move_to_group"), entries, "group-context-move-group");
        }
        if (snapshot.settings.experimentalSpaces && group.id !== "inbox")
          addSubmenu(t("groups.move_to_container"), destinations.map((destination) => ({ label: destination.id === "default" ? t("spaces.default") : destination.name, space: destination, action: () => { if (window.confirm(t("groups.move_container_confirm"))) run({ type: "moveGroupToSpace", groupId: group.id, spaceId: destination.id }); } })), "group-context-move");
        addAction(t("groups.delete_group"), () => run({ type: "deleteGroup", groupId: group.id }), group.id === "inbox", "group-context-delete");
      }
      showActions();
      groupMenu.hidden = false;
      const bounds = groupMenu.getBoundingClientRect();
      groupMenu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - bounds.width))}px`;
      groupMenu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - bounds.height))}px`;
      groupMenu.querySelector("button")?.focus();
    });
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
    const statuses = element("span", "tab-statuses");
    row.append(favicon(tab), label, statuses, close);
    row.addEventListener("click", () =>
      run({ type: "activateTab", tabId: tabId }),
    );
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetGroupMenu();
      const current = snapshot.tabs.find((item) => item.id === tabId);
      if (!current) return;
      addAction(t("tabs.actions.open"), () => run({ type: "activateTab", tabId }));
      addAction(t("tabs.actions.reload"), () => run({ type: "reloadTab", tabId }));
      addAction(t(current.muted ? "tabs.actions.unmute" : "tabs.actions.mute"), () => run({ type: "toggleTabMute", tabId }), !current.audible && !current.muted);
      if (current.pinned || current.managedPinned) addAction(t("tabs.actions.unpin"), () => run({ type: "unpinTab", tabId }));
      const destinations = snapshot.groups.filter((item) => item.id !== current.groupId).map((item) => ({
        label: item.id === "inbox" && item.title === "Основная" ? t("groups.main") : item.title,
        group: item,
        action: () => run({ type: "moveTab", tabId, groupId: item.id, keepActiveGroup: true }),
      }));
      addSubmenu(t("groups.move_tab_to_group"), current.pinned && !snapshot.settings.groupPinnedTabs ? [] : destinations, "tab-context-move");
      addAction(t("tabs.close_tab"), () => run({ type: "closeTab", tabId }), false, "group-context-delete");
      groupMenu.hidden = false;
      const bounds = groupMenu.getBoundingClientRect();
      groupMenu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - bounds.width))}px`;
      groupMenu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - bounds.height))}px`;
      groupMenu.querySelector("button")?.focus();
    });
    return { row, label, close, statuses, title: null, icon: tab.faviconUrl };
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
          filterResult.visible.has(group.id);
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
        renderTabStatus(item.statuses, tab, run);
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
  function render() {
    if (disposed) return;
    renderSpaces();
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
      clearTimeout(spacesCloseTimer);
        cancelAnimationFrame(spacesOpenFrame);
      document.removeEventListener("pointerdown", outsideSpaces);
      document.removeEventListener("focusin", outsideSpaces);
      document.removeEventListener("keydown", spacesKey);
      document.removeEventListener("pointerdown", outsidePalette);
      document.removeEventListener("keydown", paletteKey);
      document.removeEventListener("pointerdown", outsideGroupMenu);
      document.removeEventListener("keydown", groupMenuKey);
      disposeDragState();
      snapshot = null;
      viewIndex = null;
      filterResult = null;
      clearTimeout(searchTimer);
      clearTimeout(refreshTimer);
      cancelAnimationFrame(scrollFrame);
      api.runtime.onMessage.removeListener?.(onMessage);
      groupViews.clear();
      tabViews.clear();
    },
    { once: true },
  );
  translateStatic(document.querySelector(".popup"));
  render();
}
