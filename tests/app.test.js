import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { normalizeSettings } from "../src/domain/settings.js";
import { createSettingsRepository } from "../src/platform/settings-repository.js";
import { versionLabel } from "../src/domain/version-names.js";

test("settings validate untrusted imports and clamp sizes", () => {
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
      language: "en",
      markerStyle: "blob",
      dynamicIcon: true,
      animations: true,
      discardInactiveTabs: false,
      groupPinnedTabs: false,
      backupEnabled: true,
      backupFrequency: "daily",
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
test("built app mounts and connects settings, groups, archive and navigation", async () => {
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
  assert.equal(document.querySelectorAll(".group").length, 12);
  const group = document.querySelectorAll(".group")[1];
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
  document.querySelector(".recent-button").click();
  assert.equal(document.querySelectorAll(".recent-row").length, 1);
  document.querySelector(".archive-back").click();
  document.querySelector(".settings-button").click();
  const language = document.querySelector(".language-setting select");
  language.value = "ru";
  language.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(document.querySelector(".theme-open strong").textContent, "Тема");
  assert.equal(document.querySelector(".create-group").textContent, "+ Новая группа");
  language.value = "en";
  language.dispatchEvent(new window.Event("change", { bubbles: true }));
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
