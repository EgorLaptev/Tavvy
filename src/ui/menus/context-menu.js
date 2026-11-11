import { spaceIcon } from "../../domain/spaces.js";
import { groupMarker, markerLetters } from "../../domain/group-marker.js";
import { element, icon, button, clampToViewport } from "../dom.js";

/** Horizontal position of a submenu: right of its menu when it fits, otherwise left of it. */
export function submenuLeft(menuBounds, submenuWidth, viewportWidth) {
  const left =
    menuBounds.right + submenuWidth <= viewportWidth
      ? menuBounds.right
      : menuBounds.left - submenuWidth;
  return Math.max(0, left);
}

/**
 * The shared context menu (`.group-context-menu`) and its single submenu. Group, tab and
 * container menus fill it with items; this module owns opening, positioning and dismissal.
 */
export function createContextMenu(ctx) {
  const popup = document.querySelector(".popup");
  const menu = element("div", "group-context-menu");
  const submenu = element("div", "group-context-menu group-context-submenu");
  menu.hidden = true;
  submenu.hidden = true;
  menu.setAttribute("role", "menu");
  submenu.setAttribute("role", "menu");
  popup.append(menu, submenu);
  let submenuTrigger = null;

  function reset() {
    submenuTrigger?.setAttribute("aria-expanded", "false");
    submenuTrigger = null;
    menu.hidden = true;
    menu.replaceChildren();
    submenu.hidden = true;
    submenu.replaceChildren();
  }
  const close = reset;
  function closeSubmenu() {
    submenu.hidden = true;
    submenuTrigger?.setAttribute("aria-expanded", "false");
    submenuTrigger = null;
  }
  function onPointerDown(event) {
    if (
      !menu.contains(event.target) &&
      !submenu.contains(event.target) &&
      !submenuTrigger?.contains(event.target)
    )
      close();
  }
  function onKeyDown(event) {
    if (event.key !== "Escape" || (menu.hidden && submenu.hidden)) return;
    event.preventDefault();
    if (!submenu.hidden) {
      const trigger = submenuTrigger;
      closeSubmenu();
      trigger?.focus();
    } else close();
  }
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeyDown);

  function addAction(
    label,
    action,
    disabled = false,
    className = "",
    keepOpen = false,
    parent = menu,
  ) {
    const item = button(
      label,
      "group-context-item",
      element("span", "group-context-label", label),
      () => {
        if (!keepOpen) close();
        action();
      },
    );
    if (className) item.classList.add(className);
    item.setAttribute("role", "menuitem");
    item.disabled = disabled;
    parent.append(item);
    return item;
  }

  function groupBadge(group) {
    const marker = element("span", "marker group-context-marker");
    const shape = groupMarker(group.id);
    marker.style.borderRadius = shape.borderRadius;
    marker.style.rotate = `${shape.rotation}deg`;
    marker.style.background = group.color;
    marker.style.setProperty("--marker-color", group.color);
    marker.dataset.label = markerLetters(group.title);
    marker.dataset.label2 = markerLetters(group.title, 2);
    marker.setAttribute("aria-hidden", "true");
    return marker;
  }

  function spaceBadge(space) {
    const marker = element("span", "spaces-icon spaces-icon-container");
    marker.style.maskImage = `url("${ctx.spaceIconUrl(spaceIcon(space.icon))}")`;
    marker.setAttribute("aria-hidden", "true");
    return marker;
  }

  /**
   * Shows `entries` ({label, action, disabled, current, keepOpen, root, group, space}) in the
   * submenu next to `trigger`; clicking an open trigger again closes it.
   */
  function showSubmenu(trigger, entries) {
    const wasOpen = submenuTrigger === trigger && !submenu.hidden;
    submenuTrigger?.setAttribute("aria-expanded", "false");
    menu
      .querySelectorAll('[aria-expanded="true"]')
      .forEach((item) => item.setAttribute("aria-expanded", "false"));
    if (wasOpen) {
      submenu.hidden = true;
      submenuTrigger = null;
      return;
    }
    submenu.replaceChildren();
    for (const entry of entries) {
      const item = addAction(
        entry.label,
        entry.action,
        !!entry.disabled,
        entry.current ? "is-current" : "",
        !!entry.keepOpen,
        submenu,
      );
      if (entry.root)
        item.prepend(icon("m10 3-5 5 5 5", "group-context-root-icon"));
      if (entry.group) item.prepend(groupBadge(entry.group));
      if (entry.space && entry.space.id !== "default")
        item.prepend(spaceBadge(entry.space));
    }
    submenu.hidden = false;
    submenuTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    positionSubmenu(trigger);
  }

  function positionSubmenu(trigger) {
    const menuBounds = (
        menu.contains(trigger) ? menu : trigger
      ).getBoundingClientRect(),
      triggerBounds = trigger.getBoundingClientRect(),
      submenuBounds = submenu.getBoundingClientRect();
    submenu.style.left = `${submenuLeft(menuBounds, submenuBounds.width, window.innerWidth)}px`;
    submenu.style.top = `${clampToViewport(triggerBounds.top, submenuBounds.height, window.innerHeight)}px`;
  }

  /** A menu item that opens a submenu; `open(trigger)` fills it. */
  function addSubmenuTrigger(label, open, disabled, className) {
    let trigger;
    trigger = addAction(label, () => open(trigger), disabled, className, true);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.append(icon("m6 3 5 5-5 5", "group-context-arrow"));
    return trigger;
  }

  function addSubmenu(label, entries, className) {
    return addSubmenuTrigger(
      label,
      (trigger) => showSubmenu(trigger, entries),
      !entries.length,
      className,
    );
  }

  /** Shows the filled menu at the pointer position and focuses its first item. */
  function openAt(event) {
    menu.hidden = false;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${clampToViewport(event.clientX, bounds.width, window.innerWidth)}px`;
    menu.style.top = `${clampToViewport(event.clientY, bounds.height, window.innerHeight)}px`;
    menu.querySelector("button")?.focus();
  }

  return {
    menu,
    submenu,
    isOpen: () => !menu.hidden,
    reset,
    close,
    closeSubmenu,
    addAction,
    addSubmenu,
    addSubmenuTrigger,
    showSubmenu,
    positionSubmenu,
    openAt,
    dispose() {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    },
  };
}
