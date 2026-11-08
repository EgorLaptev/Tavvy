import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { validateReleaseDocs } from "../scripts/validate-release-docs.js";

const notes = "## Unreleased\n\n## 1.2.3 — Test Name — 2026-11-08\n\n- Something changed.\n";
const metadata = "## 1.2.3 — Test Name\n\n- Release date: 2026-11-08\n- Release source: `v1.2.3`\n- Artifact: `tavvy_tabs_group-1.2.3.zip`\n- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v1.2.3/SHA256SUMS\n- Verification: Tests and Firefox validation passed.\n- Signature: unsigned\n";
const script = resolve("scripts/check-release-push.js");
function git(dir, ...args) {
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function check(dir, input) { return spawnSync(process.execPath, [script], { cwd: dir, input, encoding: "utf8" }); }

test("release documentation must match the version, name, date and required metadata", () => {
  assert.doesNotThrow(() => validateReleaseDocs("1.2.3", notes, metadata));
  for (const bad of ["", metadata.replace("2026-11-08", "2026-11-07"), metadata.replace("Test Name", "Other"), metadata.replace("- Signature: unsigned", ""), metadata.replace("/v1.2.3/SHA256SUMS", "/v1.2.2/SHA256SUMS")])
    assert.throws(() => validateReleaseDocs("1.2.3", notes, bad));
  assert.throws(() => validateReleaseDocs("1.2.3", "## Unreleased\n", metadata));
});

test("pre-push checks the tagged commit and skips branch pushes and tag deletion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tavvy-push-"));
  try {
    git(dir, "init");
    git(dir, "config", "user.email", "test@example.test");
    git(dir, "config", "user.name", "Test");
    await mkdir(join(dir, "extension"));
    await mkdir(join(dir, "docs"));
    await writeFile(join(dir, "extension", "manifest.json"), JSON.stringify({ version: "1.2.3" }));
    await writeFile(join(dir, "package.json"), JSON.stringify({ version: "1.2.3" }));
    await writeFile(join(dir, "package-lock.json"), JSON.stringify({ version: "1.2.3", packages: { "": { version: "1.2.3" } } }));
    await writeFile(join(dir, "CHANGELOG.md"), notes);
    await writeFile(join(dir, "docs", "releases.md"), metadata);
    git(dir, "add", ".");
    git(dir, "commit", "-m", "release");
    git(dir, "tag", "-a", "v1.2.3", "-m", "release");
    const sha = git(dir, "rev-parse", "HEAD");
    const update = `refs/tags/v1.2.3 ${sha} refs/tags/v1.2.3 ${"0".repeat(40)}\n`;
    assert.equal(check(dir, update).status, 0);
    assert.equal(check(dir, `refs/heads/main ${sha} refs/heads/main ${"0".repeat(40)}\n`).status, 0);
    assert.equal(check(dir, `(delete) ${"0".repeat(40)} refs/tags/v1.2.3 ${sha}\n`).status, 0);
    await writeFile(join(dir, "docs", "releases.md"), "## Unreleased\n");
    git(dir, "add", ".");
    git(dir, "commit", "-m", "missing docs");
    git(dir, "tag", "-f", "v1.2.3");
    assert.notEqual(check(dir, update).status, 0);
    await writeFile(join(dir, "docs", "releases.md"), metadata);
    assert.notEqual(check(dir, update).status, 0, "uncommitted docs must not satisfy the tag check");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
