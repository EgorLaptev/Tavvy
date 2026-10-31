import { chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const git = (...args) => spawnSync("git", args, { encoding: "utf8" });
const root = git("rev-parse", "--show-toplevel");
if (root.status !== 0 || resolve(root.stdout.trim()) !== resolve(fileURLToPath(new URL("..", import.meta.url)))) {
  console.log("Git repository not found; skipping hook installation.");
} else {
  const current = git("config", "--get", "core.hooksPath");
  const hookPath = current.stdout?.trim();
  if (current.status !== 0 && current.status !== 1) {
    console.error(current.stderr || "Could not read Git hook configuration.");
    process.exitCode = 1;
  } else if (hookPath && hookPath !== ".githooks") {
    console.log(`Existing Git hook path '${hookPath}' was left unchanged.`);
  } else {
    await chmod(new URL("../.githooks/pre-commit", import.meta.url), 0o755);
    const configured = git("config", "--local", "core.hooksPath", ".githooks");
    if (configured.status !== 0) {
      console.error(configured.stderr || "Could not configure Git hooks.");
      process.exitCode = 1;
    } else {
      console.log("Git pre-commit hook installed.");
    }
  }
}
