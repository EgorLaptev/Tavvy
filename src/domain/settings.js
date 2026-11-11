import { LANGUAGES } from "./languages.js";
import { DEFAULT_ACCENT_COLOR, normalizeAccentColor } from "./colors.js";

export const DEFAULT_SETTINGS = Object.freeze({
  theme: "Чёрная",
  accentColor: DEFAULT_ACCENT_COLOR,
  language: "en",
  markerStyle: "square",
  dynamicIcon: true,
  experimentalSpaces: false,
  archiveEnabled: true,
  animations: true,
  discardInactiveTabs: false,
  groupPinnedTabs: false,
  closeTabsOnGroupDelete: true,
  nestedGroups: true,
  nestedTabsVisibility: "parents",
  backupEnabled: true,
  backupFrequency: "fourHours",
  backupFolder: "Tavvy",
  width: 440,
  height: 300,
});
export const THEMES = Object.freeze([
  "Чёрная",
  "Тёмная",
  "Светлая",
  "Как в системе",
  "Стандартная",
]);
function clamp(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}
export function validBackupFolder(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 180 ||
    value.includes("\\")
  )
    return false;
  return value
    .split("/")
    .every(
      (part) =>
        part.length > 0 &&
        part.length <= 80 &&
        !/^[. ]|[. ]$/.test(part) &&
        !/[<>:"|?*\x00-\x1f]/.test(part) &&
        !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    );
}
/** Firefox never shows an extension popup taller than 600 px. */
export const MAX_POPUP_HEIGHT = 600;

export function normalizeSettings(input) {
  const value = input && typeof input === "object" ? input : {};
  return {
    theme: THEMES.includes(value.theme) ? value.theme : DEFAULT_SETTINGS.theme,
    // Preserve the retired setting in existing data and backups.
    accentColor: normalizeAccentColor(value.accentColor),
    language: LANGUAGES.some(([code]) => code === value.language)
      ? value.language
      : "en",
    dynamicIcon:
      typeof value.dynamicIcon === "boolean" ? value.dynamicIcon : true,
    experimentalSpaces: value.experimentalSpaces === true,
    archiveEnabled:
      typeof value.archiveEnabled === "boolean" ? value.archiveEnabled : true,
    markerStyle: [
      "blob",
      "circle",
      "square",
      "diamond",
      "none",
      "letters",
      "letters2",
    ].includes(value.markerStyle)
      ? value.markerStyle
      : DEFAULT_SETTINGS.markerStyle,
    animations: typeof value.animations === "boolean" ? value.animations : true,
    groupPinnedTabs: value.groupPinnedTabs === true,
    closeTabsOnGroupDelete: value.closeTabsOnGroupDelete !== false,
    nestedGroups:
      typeof value.nestedGroups === "boolean" ? value.nestedGroups : true,
    nestedTabsVisibility:
      value.nestedTabsVisibility === "children" ? "children" : "parents",
    backupEnabled:
      typeof value.backupEnabled === "boolean" ? value.backupEnabled : true,
    backupFrequency: [
      "hourly",
      "fourHours",
      "daily",
      "weekly",
      "monthly",
    ].includes(value.backupFrequency)
      ? value.backupFrequency
      : DEFAULT_SETTINGS.backupFrequency,
    backupFolder: validBackupFolder(value.backupFolder)
      ? value.backupFolder
      : "Tavvy",
    discardInactiveTabs:
      typeof value.discardInactiveTabs === "boolean"
        ? value.discardInactiveTabs
        : false,
    width: clamp(value.width, 440, 320, 800),
    height: clamp(value.height, 300, 200, MAX_POPUP_HEIGHT),
  };
}
