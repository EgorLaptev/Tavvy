import en from "./en.json";
import ru from "./ru.json";
import zhCN from "./zh-CN.json";
import es from "./es.json";
import fr from "./fr.json";
import de from "./de.json";
import { LANGUAGES } from "../domain/languages.js";

const locales = { en, ru, "zh-CN": zhCN, es, fr, de };

let language = "en";
// Persisted domain values and background errors still use Russian source text.
function* entries(object, prefix = "") {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") yield [path, value];
    else yield* entries(value, path);
  }
}
const sourceKeys = new Map([...entries(ru)].map(([key, text]) => [text, key]));
function lookup(locale, path) {
  let value = locale;
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part))
      return undefined;
    value = value[part];
  }
  return typeof value === "string" ? value : undefined;
}
export function setLanguage(value) {
  language = LANGUAGES.some(([code]) => code === value) ? value : "en";
  document.documentElement.lang = language;
}
export function getLanguage() {
  return language;
}
export function t(key) {
  return lookup(locales[language], key) ?? lookup(en, key) ?? key;
}
export function translateText(text) {
  return t(sourceKeys.get(text) ?? text);
}
export function format(key, values = {}) {
  return t(key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}
export function translateStatic(root) {
  const selector =
    "[data-i18n], [data-i18n-aria-label], [data-i18n-placeholder], [data-i18n-title]";
  const elements = [
    ...(root.matches?.(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];
  for (const element of elements) {
    if (element.dataset.i18n) {
      const text = [...element.childNodes].find(
        (node) => node.nodeType === 3 && node.nodeValue.trim(),
      );
      if (text)
        text.nodeValue = text.nodeValue.replace(
          text.nodeValue.trim(),
          t(element.dataset.i18n),
        );
    }
    for (const attr of ["aria-label", "placeholder", "title"]) {
      const key = element.getAttribute(`data-i18n-${attr}`);
      if (key) element.setAttribute(attr, t(key));
    }
  }
}
