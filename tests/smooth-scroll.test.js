import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";

test("wheel scrolling is smooth on every popup screen and respects disabled animations", async () => {
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
    for (const selector of [
        ".groups",
        ".settings-view",
        ".theme-view",
        ".backup-view",
    ]) {
        const el = window.document.querySelector(selector);
        Object.defineProperty(el, "scrollHeight", {
            configurable: true,
            value: 500,
        });
        Object.defineProperty(el, "clientHeight", {
            configurable: true,
            value: 100,
        });
        const event = new window.WheelEvent("wheel", {
            deltaY: 100,
            bubbles: true,
            cancelable: true,
        });
        el.dispatchEvent(event);
        assert.equal(event.defaultPrevented, true, selector);
        await new Promise((resolve) => setTimeout(resolve, 35));
        assert.ok(el.scrollTop > 0 && el.scrollTop < 100, selector);
    }
    window.document.documentElement.classList.add("animations-off");
    const event = new window.WheelEvent("wheel", {
        deltaY: 100,
        bubbles: true,
        cancelable: true,
    });
    window.document.querySelector(".groups").dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    window.dispatchEvent(new window.PageTransitionEvent("pagehide"));
    window.close();
});
