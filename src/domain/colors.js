export const GROUP_COLOR_PRESETS = Object.freeze([
  ["groups.colors.blue", "#398dff"],
  ["groups.colors.sky_blue", "#38bdf8"],
  ["groups.colors.turquoise", "#20c9c3"],
  ["groups.colors.green", "#00c98a"],
  ["groups.colors.lime", "#a3d451"],
  ["groups.colors.yellow", "#f4ca50"],
  ["groups.colors.orange", "#ff7800"],
  ["groups.colors.red", "#f15d63"],
  ["groups.colors.pink", "#ff168a"],
  ["groups.colors.purple", "#a855f7"],
  ["groups.colors.lilac", "#b69aff"],
  ["groups.colors.color_black", "#000000"],
  ["groups.colors.gray", "#a0a7b4"],
  ["groups.colors.white", "#ffffff"],
]);

export const DEFAULT_ACCENT_COLOR = GROUP_COLOR_PRESETS[0][1];

export function normalizeAccentColor(value) {
  const color = typeof value === "string" ? value.toLowerCase() : "";
  return GROUP_COLOR_PRESETS.some(([, preset]) => preset === color) ? color : DEFAULT_ACCENT_COLOR;
}

export function accentTextColor(color) {
  const value = normalizeAccentColor(color);
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] > 0.35 ? "#161616" : "#ffffff";
}
