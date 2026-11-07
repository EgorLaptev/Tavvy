// STG backup is untrusted input. Preserve empty groups and duplicate URLs in a group.
export function parseStgBackup(input) {
  if (
    !input ||
    typeof input.version !== "string" ||
    !Array.isArray(input.groups) ||
    !input.groups.length
  )
    throw new Error("Не найден бэкап Simple Tab Groups");
  if (input.groups.length > 1000) throw new Error("Слишком много групп");
  let total = 0;
  const seen = new Set();
  function tab(value) {
    if (
      !value ||
      typeof value.url !== "string" ||
      !/^(https?:\/\/|file:\/\/|moz-extension:\/\/[0-9a-f-]{36}\/(?:[^\s]*)$|about:blank$|about:newtab$|about:[a-z0-9-]+(?:[?#][^\s]*)?$)/i.test(value.url)
    )
      throw new Error("В бэкапе есть неподдерживаемая ссылка");
    if (++total > 10000) throw new Error("Слишком много вкладок");
    return {
      url: value.url,
      title:
        typeof value.title === "string"
          ? value.title.slice(0, 1000)
          : value.url,
      faviconUrl:
        typeof value.favIconUrl === "string" && value.favIconUrl.length < 100000
          ? value.favIconUrl
          : "",
    };
  }
  const groups = input.groups.map((value, index) => {
    if (
      !value ||
      !Array.isArray(value.tabs) ||
      typeof value.title !== "string" ||
      !value.title.trim()
    )
      throw new Error("Повреждены данные группы");
    const sourceId = String(value.id ?? index);
    if (
      sourceId.length > 100 ||
      ["__proto__", "constructor", "prototype"].includes(sourceId)
    )
      throw new Error("Недопустимый ID группы");
    if (seen.has(sourceId)) throw new Error("Повторяющийся ID группы");
    seen.add(sourceId);
    const color =
      typeof value.iconColor === "string" &&
      /^(#[\da-f]{3,8}|hsla?\([\d.,%\s]+\)|rgba?\([\d.,%\s]+\))$/i.test(
        value.iconColor,
      )
        ? value.iconColor
        : "#398dff";
    return {
      sourceId,
      title: value.title.trim().slice(0, 120),
      color,
      tabs: value.tabs.map(tab),
    };
  });
  if (input.pinnedTabs && !Array.isArray(input.pinnedTabs))
    throw new Error("Повреждён список закреплённых вкладок");
  const pinnedTabs = (input.pinnedTabs || []).map(tab);
  return {
    groups,
    pinnedTabs,
    tabCount: total,
    browserPages: [...groups.flatMap((g) => g.tabs), ...pinnedTabs].filter((t) => /^(?:about:(?!blank$|newtab$)|moz-extension:\/\/)/i.test(t.url)).length,
    localFiles: groups
      .flatMap((g) => g.tabs)
      .filter((t) => t.url.startsWith("file:")).length,
  };
}
export async function stgFingerprint(plan) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      groups: plan.groups.map((g) => [
        g.sourceId,
        g.title,
        g.tabs.map((t) => t.url),
      ]),
      pinned: plan.pinnedTabs.map((t) => t.url),
    }),
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
