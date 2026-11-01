import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { workload } from "./helpers/workload.js";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function page(n) {
  const f = workload(n),
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
