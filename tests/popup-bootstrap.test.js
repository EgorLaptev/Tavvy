import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

test("popup restores a bounded cached size before loading its stylesheet", async () => {
    const html = await readFile("build/firefox/popup.html", "utf8");

    assert.match(html, /<html lang="ru" class="extension-mode">/);
    assert.ok(
        html.indexOf('src="popup-bootstrap.js"') <
            html.indexOf('href="popup.css"'),
    );

    const dom = new JSDOM(html, {
        url: "https://example.test",
        runScripts: "outside-only",
    });

    dom.window.localStorage.setItem(
        "tavvy:popup-size:v1",
        JSON.stringify({ width: 900, height: 700 }),
    );
    dom.window.eval(await readFile("build/firefox/popup-bootstrap.js", "utf8"));
    assert.equal(
        dom.window.document.documentElement.style.getPropertyValue(
            "--panel-width",
        ),
        "800px",
    );
    assert.equal(
        dom.window.document.documentElement.style.getPropertyValue(
            "--panel-height",
        ),
        "600px",
    );
    dom.window.close();
});
