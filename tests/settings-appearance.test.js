import test from "node:test";
import assert from "node:assert/strict";
import { themeClasses, panelSize, sliderProgress, isSettingsExport } from "../src/features/settings/appearance.js";

test("standard and system themes follow the system preference", () => {
  assert.deepEqual(themeClasses("Светлая", false), { light: true, dark: false, standard: false });
  assert.deepEqual(themeClasses("Тёмная", true), { light: false, dark: true, standard: false });
  assert.deepEqual(themeClasses("Стандартная", true), { light: true, dark: false, standard: true });
  assert.deepEqual(themeClasses("Стандартная", false), { light: false, dark: false, standard: true });
  assert.deepEqual(themeClasses("Как в системе", true), { light: true, dark: false, standard: false });
  assert.deepEqual(themeClasses("Чёрная", true), { light: false, dark: false, standard: false });
});

test("popup size is clamped to the slider ranges with defaults", () => {
  assert.deepEqual(panelSize({}), { width: 440, height: 300 });
  assert.deepEqual(panelSize({ width: 100, height: 5000 }), { width: 320, height: 600 });
  assert.deepEqual(panelSize({ width: "600", height: "abc" }), { width: 600, height: 300 });
});

test("slider fill is the relative position of the value", () => {
  assert.equal(sliderProgress("320", "320", "800"), "0%");
  assert.equal(sliderProgress("560", "320", "800"), "50%");
  assert.equal(sliderProgress(800, 320, 800), "100%");
});

test("only version 1 settings exports are accepted", () => {
  assert.equal(isSettingsExport({ version: 1, settings: { theme: "Чёрная", animations: true } }), true);
  assert.equal(isSettingsExport({ version: 2, settings: { theme: "Чёрная", animations: true } }), false);
  assert.equal(isSettingsExport({ version: 1, settings: { theme: "Neon", animations: true } }), false);
  assert.equal(isSettingsExport({ version: 1, settings: { theme: "Чёрная", animations: "yes" } }), false);
  assert.equal(isSettingsExport({ version: 1 }), false);
});
