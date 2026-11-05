import test from "node:test";
import assert from "node:assert/strict";
import { mountTabContextMenu } from "../src/background/tab-context-menu.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
function fixture(isEnabled = async () => true) {
  const handlers = {};
  const items = new Map();
  const calls = [];
  const event = (name) => ({ addListener(listener) { handlers[name] = listener; } });
  const menus = {
    async removeAll() { items.clear(); },
    create(item) { items.set(item.id, item); },
    async remove(id) { items.delete(id); },
    async update(id, values) { Object.assign(items.get(id), values); },
    async refresh() { calls.push("refresh"); },
    onShown: event("shown"), onHidden: event("hidden"), onClicked: event("clicked"),
  };
  const state = { groups: [{ id: "inbox", title: "Основная", color: "#398dff" }, { id: "work", title: "Work & More", color: "#f15d63" }], settings: { language: "ru", groupPinnedTabs: false, markerStyle: "square" } };
  const service = { async dispatch(command, windowId) { calls.push({ command, windowId }); return state; } };
  const canvases = [];
  const createCanvas = () => {
    const drawing = [];
    const context = {
      save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, closePath() {}, stroke() {},
      fill() { drawing.push({ color: this.fillStyle }); },
      measureText() { return { width: 0 }; },
      fillText(text) { drawing.push({ text, color: this.fillStyle }); },
    };
    const canvas = { drawing, getContext: () => context, toDataURL: () => `data:image/png,${canvases.length}` };
    canvases.push(canvas);
    return canvas;
  };
  const menu = mountTabContextMenu({ menus }, service, () => calls.push("notify"), createCanvas, isEnabled);
  return { handlers, items, calls, state, canvases, menu };
}

test("tab context menu follows groups and moves the clicked tab in its window", async () => {
  const { handlers, items, calls, state, canvases } = fixture();
  const tab = { id: 17, windowId: 3, pinned: false };
  handlers.shown({ contexts: ["tab"] }, tab);
  await tick();
  assert.equal(items.get("tavvy-move-tab").title, "Перенести вкладку в группу");
  assert.equal(items.get("tavvy-move-tab-0").title, "Основная");
  assert.equal(items.get("tavvy-move-tab-1").title, "Work && More");
  assert.match(items.get("tavvy-move-tab-1").icons[32], /^data:image\/png,/);
  assert.equal(canvases[1].drawing[0].color, "#f15d63");
  handlers.clicked({ menuItemId: "tavvy-move-tab-1" }, tab);
  await tick();
  assert.deepEqual(calls.find((entry) => entry.command?.type === "moveTab"), { command: { type: "moveTab", tabId: 17, groupId: "work", keepActiveGroup: true }, windowId: 3 });
  assert.ok(calls.includes("notify"));
  state.groups.splice(1, 1);
  handlers.shown({ contexts: ["tab"] }, tab);
  await tick();
  assert.equal(items.has("tavvy-move-tab-1"), false);
  handlers.shown({ contexts: ["tab"] }, { ...tab, pinned: true });
  await tick();
  assert.equal(items.get("tavvy-move-tab").enabled, false);
  state.settings.groupPinnedTabs = true;
  handlers.shown({ contexts: ["tab"] }, { ...tab, pinned: true });
  await tick();
  assert.equal(items.get("tavvy-move-tab").enabled, true);
});

test("a closed menu is not rebuilt after its snapshot arrives", async () => {
  const { handlers, items, calls } = fixture();
  handlers.shown({ contexts: ["tab"] }, { id: 1, windowId: 1 });
  handlers.hidden();
  await tick();
  assert.equal(items.has("tavvy-move-tab-0"), false);
  assert.equal(calls.includes("refresh"), false);
});

test("menu markers follow the chosen style, including letters and no marker", async () => {
  const { handlers, state, canvases } = fixture();
  const show = () => handlers.shown({ contexts: ["tab"] }, { id: 1, windowId: 1 });
  state.settings.markerStyle = "letters2";
  show();
  await tick();
  assert.deepEqual(canvases[1].drawing, [{ text: "WM", color: "#f15d63" }]);
  state.settings.markerStyle = "none";
  show();
  await tick();
  assert.deepEqual(canvases.slice(-2).map((canvas) => canvas.drawing), [[], []]);
});


test("context menu stays inactive before onboarding and becomes available afterward", async () => {
  let enabled = false;
  const { handlers, items, calls, menu } = fixture(async () => enabled);
  await tick();
  assert.equal(items.has("tavvy-move-tab"), false);
  handlers.shown({ contexts: ["tab"] }, { id: 1, windowId: 1 });
  handlers.clicked({ menuItemId: "tavvy-move-tab-0" }, { id: 1, windowId: 1 });
  await tick();
  assert.equal(calls.length, 0);
  assert.equal(items.size, 0);
  enabled = true;
  await menu.enable();
  assert.equal(items.has("tavvy-move-tab"), true);
  handlers.shown({ contexts: ["tab"] }, { id: 1, windowId: 1 });
  await tick();
  assert.ok(calls.some((entry) => entry.command?.type === "snapshot"));
  assert.equal(items.has("tavvy-move-tab-0"), true);
});
