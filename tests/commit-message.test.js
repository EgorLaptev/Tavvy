import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/check-commit-message.js");
test("commit message hook accepts conventional subjects and rejects invalid ones", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tavvy-commit-"));
  try {
    const path = join(dir, "message");
    for (const [subject, valid] of [["feat: add search", true], ["fix(settings): save theme", true], ["chore!: change defaults", true], ["fixup! feat: add search", true], ["Update settings", false], ["feat:", false], ["unknown: add feature", false]]) {
      await writeFile(path, subject + "\n\nBody\n");
      const result = spawnSync(process.execPath, [script, path], { encoding: "utf8" });
      assert.equal(result.status === 0, valid, subject);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
