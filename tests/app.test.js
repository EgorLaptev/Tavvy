import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { normalizeSettings } from "../src/domain/settings.js";
import { createSettingsRepository } from "../src/platform/settings-repository.js";
import { versionLabel } from "../src/domain/version-names.js";

test("release names remain in English", () => {
  assert.equal(versionLabel("0.2.8"), "0.2.8 · Wandering Otter");
  assert.equal(versionLabel("0.2.7"), "0.2.7 · Dancing Red Panda");
  assert.equal(versionLabel("0.2.0"), "0.2.0 · Tabby Sparrow");
  assert.equal(versionLabel("unknown"), "unknown");
});

test("locale keys use snake_case and all translations preserve placeholders", async () => {
  const flatten = (object, prefix = "") => Object.fromEntries(Object.entries(object).flatMap(([key, value]) => {
    assert.match(key, /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [[path, value]] : Object.entries(flatten(value, path));
  }));
  const en = flatten(JSON.parse(await readFile("src/locales/en.json", "utf8")));
  for (const locale of ["ru", "zh-CN", "es", "fr", "de"]) {
    const translations = flatten(JSON.parse(await readFile(`src/locales/${locale}.json`, "utf8")));
    assert.deepEqual(Object.keys(translations).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      assert.ok(translations[key].trim(), `${locale}: ${key}`);
      const placeholders = (text) => [...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
      assert.deepEqual(placeholders(translations[key]), placeholders(en[key]), `${locale}: ${key}`);
    }
  }
  for (const path of ["index.html", "extension/import.html", "extension/local-file.html"]) {
    const dom = new JSDOM(await readFile(path, "utf8"));
    for (const element of dom.window.document.querySelectorAll("[data-i18n], [data-i18n-aria-label], [data-i18n-placeholder], [data-i18n-title]")) {
      for (const attr of ["data-i18n", "data-i18n-aria-label", "data-i18n-placeholder", "data-i18n-title"]) {
        if (element.hasAttribute(attr)) assert.ok(Object.hasOwn(en, element.getAttribute(attr)), `${path}: ${element.getAttribute(attr)}`);
      }
    }
    dom.window.close();
  }
  for (const language of ["zh-CN", "es", "fr", "de"]) {
    assert.equal(normalizeSettings({ language }).language, language);
  }
  assert.equal(normalizeSettings({ language: "pt-BR" }).language, "en");
});

test("settings validate untrusted imports and clamp sizes", () => {
  assert.equal(normalizeSettings({}).markerStyle, "square");
  assert.equal(normalizeSettings({ markerStyle: "invalid" }).markerStyle, "square");
  assert.equal(normalizeSettings({ markerStyle: "blob" }).markerStyle, "blob");
  assert.deepEqual(
    normalizeSettings({
      theme: "invalid",
      animations: "false",
      width: 900,
      height: NaN,
      position: "invalid",
    }),
    {
      theme: "Чёрная",
      accentColor: "#398dff",
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
      width: 800,
      height: 300,
    },
  );
});
test("repository migrates legacy settings and handles corrupted JSON", () => {
  const values = new Map([
    [
      "tavvy-mock-settings",
      JSON.stringify({ theme: "Тёмная", animations: false }),
    ],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const repository = createSettingsRepository(storage);
  assert.equal(repository.read().theme, "Тёмная");
  repository.write(repository.read());
  values.set("tavvy-mock-settings", "{}");
  assert.equal(repository.read().animations, false);
  values.set("tavvy:settings:v1", "{");
  assert.equal(repository.read().animations, true);
});
test("preview shows mock containers and switches without Firefox APIs", async () => {
  const dom = new JSDOM(await readFile("index.html", "utf8"), {
    url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true,
  });
  try {
    const { window } = dom;
    window.structuredClone = structuredClone;
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    window.eval(await readFile("dist/app.js", "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const doc = window.document;
    assert.equal(doc.querySelector(".spaces-bar").hidden, false);
    const projects = doc.querySelector('[data-group-id="group-projects"]');
    assert.equal(projects.querySelector(":scope > .group-controls .group-toggle").getAttribute("aria-expanded"), "true");
    assert.equal(projects.querySelectorAll(":scope > .subgroups > .group").length, 2);
    projects.querySelector(":scope > .group-controls").dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true }));
    const groupMenu = doc.querySelector(".group-context-menu");
    const submenu = doc.querySelector(".group-context-submenu");
    const move = groupMenu.querySelector(".group-context-move");
    groupMenu.querySelector(".group-context-move-group").click();
    assert.equal(submenu.hidden, false);
    assert.ok(submenu.textContent.includes("Ideas & inspiration"));
    assert.ok([...submenu.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent.includes("Ideas & inspiration")).querySelector(".group-context-marker"));
    assert.ok(!submenu.textContent.includes("Current projects"));
    assert.ok(!submenu.textContent.includes("Project Orbit"));
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.ok(submenu.hidden);
    assert.ok(move.querySelector("svg"));
    move.click();
    assert.equal(submenu.hidden, false);
    assert.ok(submenu.querySelector('[role="menuitem"]'));
    assert.match(submenu.querySelector(".spaces-icon-container").style.maskImage, /data:image/);
    assert.ok(groupMenu.querySelector(".group-context-delete"));
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.ok(submenu.hidden);
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    doc.querySelector('[data-group-id="group-orbit"] > .group-controls').dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true }));
    groupMenu.querySelector(".group-context-move-group").click();
    const rootAction = [...submenu.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === "Top level");
    assert.ok(rootAction.querySelector("svg.group-context-root-icon"));
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    doc.querySelector(".spaces-trigger").click();
    const work = doc.querySelector('[data-space-id="container:firefox-container-1"]');
    assert.equal(work.textContent, "Work");
    assert.match(work.parentElement.querySelector(".spaces-icon").style.maskImage, /data:image/);
    work.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(doc.querySelector(".spaces-current").textContent, "Work");
    doc.querySelector(".spaces-trigger").click();
    doc.querySelector('[data-space-id="default"]').click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(doc.querySelector(".spaces-current").textContent, "Default");
  } finally { dom.window.close(); }
});

test("built app mounts and connects settings, groups and navigation", async () => {
  const dom = new JSDOM(await readFile("index.html", "utf8"), {
    url: "http://localhost",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.structuredClone = structuredClone;
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.eval(await readFile("dist/app.js", "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const document = window.document;
  assert.equal(document.documentElement.lang, "en");
  assert.equal(document.querySelector(".theme-open strong").textContent, "Theme");
  assert.equal(document.querySelectorAll(".group").length, 10);
  const group = document.querySelectorAll(".group")[1];
  group.querySelector(".group-controls").dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, clientX: 20, clientY: 20 }));
  const menu = document.querySelector(".group-context-menu");
  assert.equal(menu.hidden, false);
  assert.equal(menu.querySelectorAll('[role="menuitem"]').length >= 4, true);
  assert.ok(menu.lastElementChild.classList.contains("group-context-delete"));
  assert.equal(group.querySelector(".group-rename"), null);
  menu.querySelector('[role="menuitem"]').click();
  const renameInput = group.querySelector(".group-rename-input");
  renameInput.value = "Projects";
  renameInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(group.querySelector(".group-header strong").textContent, "Projects");
  const color = group.querySelector(".group-color-input");
  color.click();
  document.querySelector('.group-color-swatch[data-color="#00c98a"]').click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(group.querySelector(".marker").style.background, "rgb(0, 201, 138)");
  group.querySelector(".group-toggle").click();
  assert.equal(
    group.querySelector(".group-toggle").getAttribute("aria-expanded"),
    "true",
  );
  group.querySelector(".tab-row").dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  assert.equal(menu.hidden, false);
  assert.ok(menu.querySelector(".tab-context-move"));
  assert.ok(menu.lastElementChild.classList.contains("group-context-delete"));
  menu.querySelector(".tab-context-move").click();
  assert.ok(!document.querySelector(".group-context-submenu").hidden);
  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  group.querySelector(".tab-close").click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(group.querySelector(".count").textContent, "0");
  assert.equal(
    group.querySelector(".group-toggle").getAttribute("aria-expanded"),
    "false",
  );
  group.querySelector(".add-subgroup").click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(group.querySelector(".group-toggle").getAttribute("aria-expanded"), "true");
  assert.equal(group.querySelectorAll(".tab-row").length, 1);
  document.querySelector(".settings-button").click();
  assert.equal(document.querySelector(".language-current").textContent, "English");
  document.querySelector(".language-open").click();
  assert.equal(document.querySelector(".language-view").hidden, false);
  assert.equal(document.querySelector(".settings-view").hidden, true);
  const chooseLanguage = (code) => document.querySelector(`.language-view input[value="${code}"]`).click();
  chooseLanguage("ru");
  assert.equal(document.querySelector(".theme-open strong").textContent, "Тема");
  assert.equal(document.querySelector(".create-group").textContent, "+ Новая группа");
  chooseLanguage("zh-CN");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(document.documentElement.lang, "zh-CN");
  assert.equal(document.querySelector(".theme-open strong").textContent, "主题");
  assert.equal(document.querySelector(".create-group").textContent, "+ 新建分组");
  assert.equal(document.querySelector("#settings-tabs-title").textContent, "标签页和分组");
  assert.equal(document.querySelector('.search input').getAttribute("placeholder"), "搜索");
  assert.equal(document.querySelector('.marker-option input[value="blob"]').getAttribute("aria-label"), "不规则形状");
  assert.equal(JSON.parse(window.localStorage.getItem("tavvy:settings:v1")).language, "zh-CN");
  assert.equal(document.querySelector(".language-current").textContent, "简体中文");
  chooseLanguage("en");
  assert.equal(document.querySelector('.language-view input[value="en"]').checked, true);
  document.querySelector(".settings-back").click();
  assert.equal(document.querySelector(".language-view").hidden, true);
  assert.equal(document.querySelector(".settings-view").hidden, false);
  assert.equal(document.querySelector(".theme-open strong").textContent, "Theme");
  assert.equal(document.querySelector(".create-group").textContent, "+ New group");
  const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
  assert.ok(document.querySelector(".app-version").textContent.startsWith(manifest.version));
  document.querySelector(".theme-open").click();
  const standard = document.querySelector('input[value="Стандартная"]');
  standard.checked = true;
  standard.dispatchEvent(new window.Event("change"));
  assert.ok(document.documentElement.classList.contains("standard-theme"));
  const light = document.querySelector('input[value="Светлая"]');
  light.checked = true;
  light.dispatchEvent(new window.Event("change"));
  assert.ok(document.documentElement.classList.contains("light-theme"));
  document.querySelector(".settings-back").click();
  assert.equal(document.querySelector(".accent-setting"), null);
  assert.ok(document.documentElement.classList.contains("light-theme"));
  const toggle = document.querySelector('input[aria-label="Animations"]');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event("change"));
  assert.ok(document.documentElement.classList.contains("animations-off"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    JSON.parse(window.localStorage.getItem("tavvy:settings:v1")).animations,
    false,
  );
  assert.equal(JSON.parse(window.localStorage.getItem("tavvy:settings:v1")).language, "en");
  dom.window.close();
});
