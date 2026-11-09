import { MAX_POPUP_HEIGHT, THEMES } from "../../domain/settings.js";

/** Root classes for a theme. "Standard" and "System" follow the system light/dark preference. */
export function themeClasses(theme, systemLight) {
  return {
    light: theme === "Светлая" || (["Как в системе", "Стандартная"].includes(theme) && systemLight),
    dark: theme === "Тёмная",
    standard: theme === "Стандартная",
  };
}

/** Popup size from settings, clamped to the slider ranges (width 320–800, height 200–800). */
export function panelSize(settings) {
  return {
    width: Math.max(320, Math.min(800, Number(settings.width) || 440)),
    height: Math.max(200, Math.min(MAX_POPUP_HEIGHT, Number(settings.height) || 300)),
  };
}

/** Fill percentage of a range input. */
export function sliderProgress(value, min, max) {
  return `${((value - min) / (max - min)) * 100}%`;
}

/** A legacy settings-only export (version 1) accepted by the hidden import input. */
export function isSettingsExport(data) {
  return (
    data.version === 1 &&
    !!data.settings &&
    THEMES.includes(data.settings.theme) &&
    typeof data.settings.animations === "boolean"
  );
}
