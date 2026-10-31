import en from "./en.json";
import ru from "./ru.json";

let language = "en";
const originals = new WeakMap();
export function setLanguage(value) { language = value === "ru" ? "ru" : "en"; document.documentElement.lang = language; }
export function getLanguage() { return language; }
export function t(key) { return (language === "ru" ? ru[key] : en[key]) ?? key; }
export function format(key, values = {}) { return t(key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? "")); }
export function translateStatic(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.currentNode;
  while (node) {
    if (node.nodeType === 3) {
      const original = originals.get(node) ?? node.nodeValue;
      originals.set(node, original);
      const trimmed = original.trim();
      if (Object.hasOwn(en, trimmed)) node.nodeValue = original.replace(trimmed, t(trimmed));
    } else {
      for (const attr of ["aria-label", "placeholder", "title"]) {
        if (!node.hasAttribute?.(attr)) continue;
        let stored = originals.get(node);
        if (!stored) { stored = {}; originals.set(node, stored); }
        const original = stored[attr] ?? node.getAttribute(attr);
        stored[attr] = original;
        if (Object.hasOwn(en, original)) node.setAttribute(attr, t(original));
      }
    }
    node = walker.nextNode();
  }
}
