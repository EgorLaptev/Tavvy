export const VERSION_NAMES = Object.freeze({
  "0.2.0": "Вкладочный воробей",
});

export function versionLabel(version, translate = (text) => text) {
  const name = VERSION_NAMES[version];
  return name ? `${version} · ${translate(name)}` : version;
}
