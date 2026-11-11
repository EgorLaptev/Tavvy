import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("preview and Firefox builds include compiled group and tab styles", async () => {
    for (const path of ["dist/app.css", "build/firefox/popup.css"]) {
        const css = await readFile(path, "utf8");

        assert.match(css, /\.tabs \.empty:hover\s*\{/);
        assert.doesNotMatch(css, /&:hover/);
    }
});
