import "./helpers/isolate-git.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const script = resolve("scripts/release-pr.js");
const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
function run(dir, ...args) { return spawnSync(process.execPath, [script, ...args], { cwd: dir, env: { ...process.env, RELEASE_BRANCH: "release/1.2.3-clean" }, encoding: "utf8" }); }
test("release PR description includes changes and preserves manual text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tavvy-pr-"));
  try {
    git(dir, "init", "-q");
    git(dir, "config", "user.name", "Test"); git(dir, "config", "user.email", "test@example.invalid");
    await writeFile(join(dir, "CHANGELOG.md"), "## Unreleased\n\n- First change.\n");
    git(dir, "add", "."); git(dir, "commit", "-qm", "Base");
    git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    await writeFile(join(dir, "file.txt"), "work"); git(dir, "add", "."); git(dir, "commit", "-qm", "Add feature");
    const initial = run(dir); assert.equal(initial.status, 0, initial.stderr);
    const body = await readFile(join(dir, "build", "pr-body.md"), "utf8");
    assert.match(body, /First change/); assert.match(body, /Add feature/);
    await writeFile(join(dir, "build", "existing.md"), `Reviewer note\n\n${body}\nExtra note\n`);
    await writeFile(join(dir, "CHANGELOG.md"), "## Unreleased\n\n- Updated change.\n");
    const update = run(dir, "--merge-existing", join(dir, "build", "existing.md")); assert.equal(update.status, 0, update.stderr);
    const updated = await readFile(join(dir, "build", "pr-body.md"), "utf8");
    assert.match(updated, /Reviewer note/); assert.match(updated, /Extra note/); assert.match(updated, /Updated change/); assert.doesNotMatch(updated, /First change/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
