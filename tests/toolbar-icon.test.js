import test from "node:test";
import assert from "node:assert/strict";
import { createToolbarIcon } from "../src/background/toolbar-icon.js";
import { groupMarker, markerLetters, drawMarker } from "../src/domain/group-marker.js";
test("group markers are deterministic across popup and toolbar", () => {
  assert.deepEqual(groupMarker("group-id"), groupMarker("group-id"));
  assert.ok(groupMarker("group-id").borderRadius.includes("/"));
});
test("letter markers use word initials or the start of a single word", () => {
  assert.equal(markerLetters("Work Projects", 2), "WP");
  assert.equal(markerLetters("Work.Projects/Firefox", 3), "WPF");
  assert.equal(markerLetters("  Работа | Личные_дела-настройки  ", 3), "РЛД");
  assert.equal(markerLetters("Personal", 2), "PE");
  assert.equal(markerLetters("Personal", 3), "PER");
  assert.equal(markerLetters("Work Projects", 3), "WOP");
  assert.equal(markerLetters("A Projects", 3), "AP");
  assert.equal(markerLetters("Работа / Личное", 3), "РАЛ");
  assert.equal(markerLetters("e\u0301cole", 2), "E\u0301C");
  assert.equal(markerLetters("", 3), "");
});
test("two-letter toolbar marker uses larger text", () => {
  const drawn = [];
  const ctx = { save() {}, restore() {}, measureText() { return { width: 0 }; }, fillText(text, x, y, maxWidth) { drawn.push({ text, font: this.font, x, y, maxWidth }); } };
  drawMarker(ctx, "group", "#fff", 100, "letters", "Work Projects Firefox");
  drawMarker(ctx, "group", "#fff", 100, "letters2", "Work Projects Firefox");
  assert.deepEqual(drawn, [{ text: "WPF", font: "600 42px sans-serif", x: 50, y: 50, maxWidth: undefined }, { text: "WP", font: "600 75px sans-serif", x: 50, y: 50, maxWidth: undefined }]);
  for (const size of [16, 32, 64]) {
    drawMarker(ctx, "group", "#fff", size, "letters2", "Work Projects");
    assert.equal(drawn.at(-1).font, `600 ${size * 0.75}px sans-serif`);
    assert.equal(drawn.at(-1).maxWidth, undefined);
  }
});
test("wide letters are scaled proportionally rather than squeezed", () => {
  const calls = [];
  const ctx = { save() {}, restore() {}, measureText() { return { width: 120 }; }, fillText(...args) { calls.push({ args, font: this.font }); } };
  drawMarker(ctx, "group", "#fff", 100, "letters2", "Wide Word");
  assert.equal(calls[0].font, `600 ${75 * 95 / 120}px sans-serif`);
  assert.deepEqual(calls[0].args, ["WW", 50, 50]);
});
test("no marker uses a transparent toolbar icon and restores the chosen style", async () => {
  const icons = [];
  const api = { action: { setIcon: async (icon) => icons.push(icon), setTitle: async () => {} } };
  let drawings = 0;
  const ctx = {
    save() {}, translate() {}, rotate() {}, beginPath() {}, moveTo() {}, lineTo() {},
    bezierCurveTo() {}, closePath() {}, fill() { drawings++; }, stroke() {}, restore() {},
    getImageData(x, y, width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
  };
  const toolbar = createToolbarIcon(api, () => ({ getContext: () => ctx }));
  const group = { id: "a", color: "#398dff", title: "Work" };
  await toolbar.update(1, group);
  assert.equal(drawings, 3);
  await toolbar.setStyle("none");
  assert.deepEqual(Object.keys(icons.at(-1).imageData), ["16", "32", "64"]);
  for (const image of Object.values(icons.at(-1).imageData)) assert.ok(image.data.every((channel) => channel === 0));
  drawMarker(ctx, "a", "#398dff", 16, "none");
  assert.equal(drawings, 3);
  await toolbar.update(1, { ...group, id: "b" });
  assert.ok(icons.at(-1).imageData);
  assert.equal(drawings, 3);
  await toolbar.setStyle("square");
  assert.ok(icons.at(-1).imageData);
  assert.equal(drawings, 6);
});
test("toolbar updates are cached per window and titles follow group selection", async () => {
  const calls = [];
  const api = {
    action: {
      setIcon: async (value) => calls.push(["icon", value]),
      setTitle: async (value) => calls.push(["title", value]),
    },
  };
  const ctx = {
    save() {},
    translate() {},
    rotate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    restore() {},
    getImageData(x, y, w, h) {
      return { width: w, height: h };
    },
  };
  const toolbar = createToolbarIcon(api, () => ({ getContext: () => ctx }));
  const group = { id: "a", color: "#398dff", title: "Работа" };
  await toolbar.update(1, group);
  await toolbar.update(1, group);
  assert.equal(calls.length, 2);
  assert.deepEqual(Object.keys(calls[0][1].imageData), ["16", "32", "64"]);
  await toolbar.update(2, group);
  assert.equal(calls.length, 4);
  assert.equal(calls[2][1].windowId, 2);
  await toolbar.setStyle("circle");
  assert.equal(calls.length, 8);
  await toolbar.setStyle("circle");
  assert.equal(calls.length, 8);
  await toolbar.update(1, { ...group, id: "b", title: "Личное" });
  assert.equal(calls.at(-1)[1].title, "Tavvy — Личное");
  await toolbar.setDynamic(false);
  assert.deepEqual(calls.filter(([kind, value]) => kind === "icon" && value.path === "icon.svg").map(([, value]) => value.windowId).sort(), [1, 2]);
  await toolbar.update(1, { ...group, id: "c", title: "Another group" });
  assert.equal(calls.at(-2)[1].path, "icon.svg");
  const beforeReenable = calls.length;
  await toolbar.setDynamic(true);
  assert.equal(calls.slice(beforeReenable).filter(([kind, value]) => kind === "icon" && value.imageData).length, 2);
});
