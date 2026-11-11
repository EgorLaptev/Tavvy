// Utility pages use the same saved theme as the popup and settings page.
export function mountPageTheme(api) {
  const key = "tavvy:workspace:v1";
  const system = matchMedia("(prefers-color-scheme: light)");
  let theme = "Чёрная";
  function apply() {
    const light =
      theme === "Светлая" ||
      (["Как в системе", "Стандартная"].includes(theme) && system.matches);
    document.documentElement.dataset.theme = light
      ? "light"
      : theme === "Тёмная"
        ? "dark"
        : "black";
  }
  function read(data) {
    theme = data?.settings?.theme || "Чёрная";
    apply();
  }
  api.storage.local
    .get(key)
    .then((data) => read(data[key]))
    .catch(() => apply());
  api.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes[key]) read(changes[key].newValue);
  });
  system.addEventListener("change", apply);
  apply();
}
