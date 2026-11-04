import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { workload } from "./helpers/workload.js";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function page(n, groupCount = 2) {
  const f = workload(n, 1, groupCount),
    dom = new JSDOM(await readFile("build/firefox/popup.html", "utf8"), {
      url: "http://localhost",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
  dom.window.browser = f.api;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  dom.window.eval(await readFile("build/firefox/popup.js", "utf8"));
  for (
    let i = 0;
    i < 100 && !dom.window.document.querySelector(".group-header");
    i++
  )
    await pause(10);
  return {
    ...f,
    dom,
    document: dom.window.document,
    close() {
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent("pagehide"));
      dom.window.close();
    },
  };
}
for (const n of [100, 500, 1000])
  test(`shared UI bounds DOM and preserves focus for ${n} tabs`, async () => {
    const f = await page(n),
      doc = f.document;
    try {
      assert.equal(
        doc.querySelectorAll(".tab-row").length,
        0,
        "collapsed groups have no tab rows",
      );
      doc.querySelector(".group-toggle").click();
      assert.ok(doc.querySelectorAll(".tab-row").length <= Math.max(n / 2, 26));
      if (n >= 500)
        assert.ok(
          doc.querySelectorAll(".tab-row").length <= 26,
          "large groups use a virtual window",
        );
      const header = doc.querySelector(".group-header"),
        marker = header.querySelector(".marker");
      doc.querySelector(".create-group").click();
      const input = doc.querySelector(".new-group-form input");
      input.value = "Draft";
      input.focus();
      f.service.invalidate({
        type: "updated",
        tabId: 1,
        changes: { title: "Updated title" },
      });
      await f.api.runtime.sendMessage({
        channel: "tavvy-command",
        windowId: 1,
        command: { type: "saveSettings", settings: { animations: true } },
      });
      await pause(160);
      assert.equal(doc.querySelector(".group-header"), header);
      assert.equal(header.querySelector(".marker"), marker);
      assert.equal(doc.activeElement, input);
      assert.equal(input.value, "Draft");
      const search = doc.querySelector(".search input");
      search.value = "Tab " + (n - 1);
      search.dispatchEvent(new f.dom.window.Event("input"));
      await pause(220);
      const visible = [...doc.querySelectorAll(".group")].filter(
        (group) => !group.hidden,
      );
      assert.equal(visible.length, 1);
      visible[0].querySelector(".group-toggle").click();
      assert.equal(doc.querySelectorAll(".tab-row").length, 1);
    } finally {
      f.close();
    }
  });

test("starting a group drag collapses the group, but a click does not", async () => {
  const f = await page(100);
  try {
    const group = f.document.querySelector(".group");
    const toggle = group.querySelector(".group-toggle");
    const header = group.querySelector(".group-header");
    header.setPointerCapture = () => {};
    f.document.elementFromPoint = () => null;
    f.dom.window.Element.prototype.animate = () => ({ finished: Promise.resolve() });
    toggle.click();
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    header.dispatchEvent(new f.dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    header.dispatchEvent(new f.dom.window.MouseEvent("pointermove", { bubbles: true, clientX: 12, clientY: 12 }));
    await pause(30);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    header.dispatchEvent(new f.dom.window.MouseEvent("pointermove", { bubbles: true, clientX: 30, clientY: 30 }));
    await pause(30);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(group.querySelector(".tabs").classList.contains("is-closed"), true);
    header.dispatchEvent(new f.dom.window.MouseEvent("pointercancel", { bubbles: true }));
  } finally {
    f.close();
  }
});

test("a quick drag reorders above or below a group", async () => {
  const f = await page(10, 3);
  const { document: doc, dom } = f;
  try {
    dom.window.Element.prototype.animate = () => ({ finished: Promise.resolve() });
    const send = (command) => f.api.runtime.sendMessage({ channel: "tavvy-command", windowId: 1, command });
    async function drag(sourceId, targetId, x, y) {
      const source = doc.querySelector(`[data-group-id="${sourceId}"]`);
      const target = doc.querySelector(`[data-group-id="${targetId}"]`);
      const header = source.querySelector(":scope > .group-controls > .group-header");
      const targetControls = target.querySelector(":scope > .group-controls");
      const rect = { left: 0, right: 200, top: 100, bottom: 140, width: 200, height: 40 };
      target.getBoundingClientRect = () => rect;
      targetControls.getBoundingClientRect = () => rect;
      header.setPointerCapture = () => {};
      doc.elementFromPoint = () => targetControls;
      header.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 50, clientY: 20 }));
      header.dispatchEvent(new dom.window.MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
      header.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true, clientX: x, clientY: y }));
      await pause(100);
      return (await send({ type: "snapshot" })).snapshot;
    }
    let snapshot = await drag("g2", "g1", 80, 102);
    assert.deepEqual(snapshot.groups.map((group) => group.id), ["inbox", "g2", "g1"]);
    assert.equal(snapshot.groups.find((group) => group.id === "g2").parentId, null);
    snapshot = await drag("g1", "inbox", 80, 138);
    assert.deepEqual(snapshot.groups.map((group) => group.id), ["inbox", "g1", "g2"]);
  } finally { f.close(); }
});

for (const x of [20, 100, 180]) test(`holding over the header at x=${x} nests into a collapsed group`, async () => {
  const f = await page(10, 3);
  const { document: doc, dom } = f;
  try {
    dom.window.Element.prototype.animate = () => ({ finished: Promise.resolve() });
    const source = doc.querySelector('[data-group-id="g2"]');
    const target = doc.querySelector('[data-group-id="g1"]');
    const header = source.querySelector(":scope > .group-controls > .group-header");
    const controls = target.querySelector(":scope > .group-controls");
    const rect = { left: 0, right: 200, top: 100, bottom: 140, width: 200, height: 40 };
    target.getBoundingClientRect = controls.getBoundingClientRect = () => rect;
    header.setPointerCapture = () => {};
    // The target would move away from the pointer if the placeholder were
    // inserted beside it before the nesting delay expires.
    doc.elementFromPoint = () => doc.querySelector(".group-placeholder")?.nextElementSibling === target ? null : controls;
    assert.equal(target.querySelector(":scope > .group-controls .group-toggle").getAttribute("aria-expanded"), "false");
    const pointer = (type) => header.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 120 }));
    header.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: 180 }));
    pointer("pointermove");
    await pause(300);
    assert.ok(target.classList.contains("group-nest-target"));
    pointer("pointerup");
    await pause(100);
    const { snapshot } = await f.api.runtime.sendMessage({ channel: "tavvy-command", windowId: 1, command: { type: "snapshot" } });
    assert.equal(snapshot.groups.find((group) => group.id === "g2").parentId, "g1");
    assert.equal(target.querySelector(":scope > .group-controls .group-toggle").getAttribute("aria-expanded"), "false");
  } finally { f.close(); }
});

test("dragging a nested group straight upward nests it without horizontal movement", async () => {
  const f = await page(10, 3);
  const { document: doc, dom } = f;
  try {
    const send = (command) => f.api.runtime.sendMessage({ channel: "tavvy-command", windowId: 1, command });
    await send({ type: "moveGroup", groupId: "g2", parentId: "g1" });
    await pause(180);
    const parent = doc.querySelector('[data-group-id="g1"]');
    parent.querySelector(":scope > .group-controls .group-toggle").click();
    const source = doc.querySelector('[data-group-id="g2"]');
    const target = doc.querySelector('[data-group-id="inbox"]');
    const header = source.querySelector(":scope > .group-controls > .group-header");
    const controls = target.querySelector(":scope > .group-controls");
    const rect = { left: 0, right: 200, top: 100, bottom: 140, width: 200, height: 40 };
    target.getBoundingClientRect = controls.getBoundingClientRect = () => rect;
    header.setPointerCapture = () => {};
    dom.window.Element.prototype.animate = () => ({ finished: Promise.resolve() });
    doc.elementFromPoint = () => controls;
    const pointer = (type, y) => header.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX: 20, clientY: y }));
    pointer("pointerdown", 180);
    pointer("pointermove", 120);
    await pause(300);
    assert.ok(target.classList.contains("group-nest-target"));
    pointer("pointerup", 120);
    await pause(100);
    const { snapshot } = await send({ type: "snapshot" });
    assert.equal(snapshot.groups.find((group) => group.id === "g2").parentId, "inbox");
  } finally { f.close(); }
});

test("drag placement stays stable at the upper edge of a neighboring group", async () => {
  const f = await page(10, 3);
  const { document: doc, dom } = f;
  try {
    dom.window.Element.prototype.animate = () => ({ finished: Promise.resolve() });
    const source = doc.querySelector('[data-group-id="g2"]');
    const target = doc.querySelector('[data-group-id="g1"]');
    const header = source.querySelector(":scope > .group-controls > .group-header");
    const controls = target.querySelector(":scope > .group-controls");
    const rect = { left: 0, right: 200, top: 100, bottom: 140, width: 200, height: 40 };
    target.getBoundingClientRect = controls.getBoundingClientRect = () => rect;
    header.setPointerCapture = () => {};
    doc.elementFromPoint = () => controls;
    const pointer = (type, y) => header.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX: 40, clientY: y }));
    pointer("pointerdown", 20);
    pointer("pointermove", 102);
    await pause(30);
    const placeholder = doc.querySelector(".group-placeholder");
    assert.equal(placeholder.nextElementSibling, target);
    pointer("pointermove", 104);
    await pause(30);
    assert.equal(placeholder.nextElementSibling, target, "small motion at the edge must not reverse the placement");
    pointer("pointermove", 138);
    await pause(30);
    assert.equal(target.nextElementSibling, placeholder, "moving past the threshold changes the placement");
    pointer("pointercancel", 138);
  } finally { f.close(); }
});

test("nested groups reorder within their list without treating the placeholder as their parent", async () => {
  const f = await page(10, 3);
  const { document: doc, dom } = f;
  try {
    const send = (command) => f.api.runtime.sendMessage({ channel: "tavvy-command", windowId: 1, command });
    await send({ type: "moveGroup", groupId: "g1", parentId: "inbox" });
    await send({ type: "moveGroup", groupId: "g2", parentId: "inbox" });
    await pause(180);
    const parent = doc.querySelector('[data-group-id="inbox"]');
    parent.querySelector(":scope > .group-controls .group-toggle").click();
    const source = doc.querySelector('[data-group-id="g2"]');
    const target = doc.querySelector('[data-group-id="g1"]');
    const header = source.querySelector(":scope > .group-controls > .group-header");
    const controls = target.querySelector(":scope > .group-controls");
    const rect = { left: 0, right: 200, top: 100, bottom: 140, width: 200, height: 40 };
    target.getBoundingClientRect = controls.getBoundingClientRect = () => rect;
    header.setPointerCapture = () => {};
    dom.window.Element.prototype.animate = () => ({ finished: Promise.resolve() });
    let hit = controls;
    doc.elementFromPoint = () => hit;
    const pointer = (type, x, y) => header.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
    pointer("pointerdown", 80, 20);
    pointer("pointermove", 40, 102);
    await pause(30);
    const placeholder = doc.querySelector(".group-placeholder");
    assert.equal(placeholder.parentElement, target.parentElement);
    assert.equal(placeholder.nextElementSibling, target);
    hit = placeholder;
    pointer("pointermove", 100, 120);
    await pause(300);
    assert.equal(parent.classList.contains("group-nest-target"), false);
    pointer("pointerup", 100, 120);
    await pause(100);
    const { snapshot } = await send({ type: "snapshot" });
    assert.equal(snapshot.groups.find((group) => group.id === "g2").parentId, "inbox");
    assert.ok(snapshot.groups.findIndex((group) => group.id === "g2") < snapshot.groups.findIndex((group) => group.id === "g1"));
  } finally { f.close(); }
});

test("dragging a tab animates affected rows and keeps the chosen order", async () => {
  const f = await page(10);
  const { document: doc, dom } = f;
  try {
    doc.querySelector('[data-group-id="inbox"] .group-toggle').click();
    const rows = [...doc.querySelectorAll('[data-group-id="inbox"] .tab-row')];
    assert.ok(rows.length >= 3);
    const animations = [];
    for (const row of rows) {
      row.getBoundingClientRect = () => ({ top: [...row.parentElement.children].indexOf(row) * 30 });
      Object.defineProperty(row, "offsetHeight", { value: 30 });
      row.animate = (frames, options) => { animations.push({ row, frames, options }); return { finished: Promise.resolve() }; };
    }
    const start = new dom.window.Event("dragstart", { bubbles: true });
    Object.defineProperty(start, "dataTransfer", { value: { setData() {}, effectAllowed: "" } });
    rows[0].dispatchEvent(start);
    rows[2].dispatchEvent(new dom.window.MouseEvent("dragover", { bubbles: true, cancelable: true, clientY: 89 }));
    assert.deepEqual([...rows[0].parentElement.querySelectorAll(":scope > .tab-row")].slice(0, 3), [rows[1], rows[2], rows[0]]);
    assert.deepEqual(animations.map(({ row }) => row), [rows[1], rows[2]]);
    assert.ok(animations.every(({ options }) => options.id === "tab-drag-shift"));
    rows[0].dispatchEvent(new dom.window.Event("dragend", { bubbles: true }));
  } finally { f.close(); }
});

test("nested dragging animates external groups without doubling descendant movement", async () => {
  const f = await page(10, 5);
  const { document: doc, dom } = f;
  try {
    const send = (command) => f.api.runtime.sendMessage({ channel: "tavvy-command", windowId: 1, command });
    await send({ type: "moveGroup", groupId: "g1", parentId: "inbox" });
    await send({ type: "moveGroup", groupId: "g4", parentId: "g3" });
    await pause(180);
    doc.querySelector('[data-group-id="inbox"] > .group-controls .group-toggle').click();
    doc.querySelector('[data-group-id="g3"] > .group-controls .group-toggle').click();
    const source = doc.querySelector('[data-group-id="g2"]');
    const target = doc.querySelector('[data-group-id="g1"]');
    const outer = doc.querySelector('[data-group-id="g3"]');
    const descendant = doc.querySelector('[data-group-id="g4"]');
    const controls = target.querySelector(":scope > .group-controls");
    const sourceHeader = source.querySelector(":scope > .group-controls > .group-header");
    const rect = (top) => ({ left: 0, right: 200, top, bottom: top + 40, width: 200, height: 40 });
    const placeholderMoved = () => doc.querySelector(".group-placeholder")?.parentElement === target.parentElement;
    for (const group of doc.querySelectorAll(".groups .group")) group.getBoundingClientRect = () => rect(0);
    target.getBoundingClientRect = controls.getBoundingClientRect = () => rect(100);
    outer.getBoundingClientRect = () => rect(placeholderMoved() ? 260 : 220);
    descendant.getBoundingClientRect = () => rect(placeholderMoved() ? 300 : 260);
    const animated = [];
    dom.window.Element.prototype.animate = function (frames, options) {
      if (options?.id === "group-drag-shift") animated.push({ node: this, frames });
      return { finished: Promise.resolve() };
    };
    sourceHeader.setPointerCapture = () => {};
    doc.elementFromPoint = () => controls;
    sourceHeader.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 80, clientY: 20 }));
    sourceHeader.dispatchEvent(new dom.window.MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 102 }));
    await pause(30);
    assert.equal(animated.find((entry) => entry.node === outer)?.frames[0].transform, "translateY(-40px)");
    assert.equal(animated.some((entry) => entry.node === descendant), false);
    sourceHeader.dispatchEvent(new dom.window.MouseEvent("pointercancel", { bubbles: true }));
  } finally { f.close(); }
});

test("dropping into a collapsed group animates toward its visible header", async () => {
  const f = await page(10, 3);
  const { document: doc, dom } = f;
  try {
    const source = doc.querySelector('[data-group-id="g2"]');
    const target = doc.querySelector('[data-group-id="g1"]');
    const header = source.querySelector(":scope > .group-controls > .group-header");
    const targetControls = target.querySelector(":scope > .group-controls");
    const rect = { left: 30, right: 230, top: 100, bottom: 140, width: 200, height: 40 };
    target.getBoundingClientRect = targetControls.getBoundingClientRect = () => rect;
    source.querySelector(":scope > .group-controls").getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
    header.setPointerCapture = () => {};
    doc.elementFromPoint = () => targetControls;
    const ghosts = [];
    dom.window.Element.prototype.animate = function (frames) {
      if (this.classList.contains("group-drag-ghost")) ghosts.push(frames);
      return { finished: Promise.resolve() };
    };
    const pointer = (type, x, y) => header.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
    pointer("pointerdown", 80, 20);
    pointer("pointermove", 190, 120);
    await pause(300);
    pointer("pointerup", 190, 120);
    assert.equal(ghosts[0][1].transform, "translate3d(30px, 100px, 0) rotate(0deg)");
    await pause(30);
  } finally { f.close(); }
});

test("tab status indicators update when Firefox reports changed states", async () => {
  const f = await page(10);
  try {
    const send = (command) => f.api.runtime.sendMessage({ channel: "tavvy-command", windowId: 1, command });
    let { snapshot } = await send({ type: "snapshot" });
    await send({ type: "saveSettings", settings: { ...snapshot.settings, groupPinnedTabs: true } });
    f.service.invalidate({ type: "updated", tabId: 1, changes: { pinned: true, audible: true, mutedInfo: { muted: false }, sharingState: { screen: "Screen", microphone: true, camera: true } } });
    await send({ type: "renameGroup", groupId: "inbox", title: "Group 0" });
    await pause(180);
    f.document.querySelector('[data-group-id="inbox"] .group-toggle').click();
    const row = f.document.querySelector('[data-tab-id="1"]');
    assert.deepEqual([...row.querySelectorAll(".tab-status-icon")].map((el) => el.dataset.status), ["pinned", "audible", "screen", "microphone", "camera"]);
    f.service.invalidate({ type: "updated", tabId: 1, changes: { pinned: false, audible: false, mutedInfo: { muted: true }, sharingState: { microphone: false, camera: false } } });
    await send({ type: "renameGroup", groupId: "inbox", title: "Group 0" });
    await pause(180);
    assert.deepEqual([...row.querySelectorAll(".tab-status-icon")].map((el) => el.dataset.status), ["muted"]);
    f.service.invalidate({ type: "updated", tabId: 1, changes: { mutedInfo: { muted: false }, audible: false } });
    await send({ type: "renameGroup", groupId: "inbox", title: "Group 0" });
    await pause(180);
    assert.equal(row.querySelectorAll(".tab-status-icon").length, 0);
  } finally { f.close(); }
});

test("closing a nested group keeps its ancestors open and closes descendants", async () => {
  const f = await page(10);
  try {
    const send = (command) => f.api.runtime.sendMessage({ channel: "tavvy-command", windowId: 1, command });
    await send({ type: "moveGroup", groupId: "g1", parentId: "inbox" });
    let { snapshot } = await send({ type: "createGroup", title: "Nested", parentId: "g1" });
    const childId = snapshot.groups.find((group) => group.title === "Nested").id;
    await pause(180);
    const toggle = (id) => f.document.querySelector(`[data-group-id="${id}"] > .group-controls .group-toggle`);
    toggle("inbox").click();
    toggle("g1").click();
    toggle(childId).click();
    assert.equal(toggle("inbox").getAttribute("aria-expanded"), "true");
    toggle("g1").click();
    assert.equal(toggle("inbox").getAttribute("aria-expanded"), "true");
    assert.equal(toggle("g1").getAttribute("aria-expanded"), "false");
    assert.equal(toggle(childId).getAttribute("aria-expanded"), "false");
    toggle("g1").click();
    assert.equal(toggle(childId).getAttribute("aria-expanded"), "false");
  } finally { f.close(); }
});

test("nested group settings flatten and restore the existing hierarchy", async () => {
  const f = await page(100);
  try {
    await f.api.runtime.sendMessage({ channel: "tavvy-command", windowId: 1, command: { type: "moveGroup", groupId: "g1", parentId: "inbox" } });
    await pause(180);
    assert.ok(f.document.querySelector('[data-group-id="inbox"] > .subgroups > [data-group-id="g1"]'));
    f.document.querySelector(".settings-button").click();
    const nested = f.document.querySelector('input[aria-label="Nested groups"]');
    const mode = f.document.querySelector('select[aria-label="Show tabs from"]');
    assert.equal(nested.checked, true);
    assert.equal(mode.value, "parents");
    mode.value = "children";
    mode.dispatchEvent(new f.dom.window.Event("change", { bubbles: true }));
    await pause(120);
    nested.checked = false;
    nested.dispatchEvent(new f.dom.window.Event("change", { bubbles: true }));
    await pause(120);
    assert.equal(f.document.querySelector(".nested-visibility-setting").hidden, true);
    assert.ok(f.document.querySelector('.groups > [data-group-id="g1"]'));
    nested.checked = true;
    nested.dispatchEvent(new f.dom.window.Event("change", { bubbles: true }));
    await pause(120);
    assert.equal(mode.value, "children");
    assert.ok(f.document.querySelector('[data-group-id="inbox"] > .subgroups > [data-group-id="g1"]'));
  } finally {
    f.close();
  }
});
