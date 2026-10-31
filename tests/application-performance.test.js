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
