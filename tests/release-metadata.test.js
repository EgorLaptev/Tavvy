import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/release-metadata.js");
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "tavvy-release-"));
  await mkdir(join(dir, "extension"));
  await mkdir(join(dir, "build", "packages"), { recursive: true });
  await writeFile(join(dir, "extension", "manifest.json"), JSON.stringify({ version: "1.2.3" }));
  await writeFile(join(dir, "package.json"), JSON.stringify({ version: "1.2.3" }));
  await writeFile(join(dir, "package-lock.json"), JSON.stringify({ version: "1.2.3", packages: { "": { version: "1.2.3" } } }));
  await writeFile(join(dir, "CHANGELOG.md"), "## Unreleased\n\n## 1.2.3 — Test Name — 2026-11-06\n\n- Release change.\n\n## 1.2.2 — Older — 2026-11-05\n\n- Old change.\n");
  await writeFile(join(dir, "build", "packages", "tavvy-1.2.3.zip"), "test package");
  return dir;
}
function run(dir, tag) { return spawnSync(process.execPath, [script], { cwd: dir, env: { ...process.env, GITHUB_REF_NAME: tag }, encoding: "utf8" }); }
test("release metadata uses the matching changelog section and archive", async () => {
  const dir = await fixture();
  try {
    const result = run(dir, "v1.2.3");
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await readFile(join(dir, "build", "release-title.txt"), "utf8")).trim(), "1.2.3 — Test Name");
    const notes = await readFile(join(dir, "build", "release-notes.md"), "utf8");
    assert.match(notes, /Release change/);
    assert.doesNotMatch(notes, /Old change/);
    assert.match(notes, /unsigned/);
    assert.match(await readFile(join(dir, "build", "SHA256SUMS"), "utf8"), /^[a-f0-9]{64}  tavvy-1\.2\.3\.zip\n$/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("release metadata rejects malformed or mismatched tags and missing notes", async () => {
  const dir = await fixture();
  try {
    assert.notEqual(run(dir, "v1.2.3-rc1").status, 0);
    assert.notEqual(run(dir, "v9.9.9").status, 0);
    await writeFile(join(dir, "CHANGELOG.md"), "## Unreleased\n");
    assert.notEqual(run(dir, "v1.2.3").status, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
