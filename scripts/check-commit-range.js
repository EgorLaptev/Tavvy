import { execFileSync } from "node:child_process";
import { isConventionalCommit } from "./conventional-commits.js";

// These commits were already published before the convention was adopted.
// Remove the exceptions once release/0.2.11 has reached main.
const legacy = new Set([
  "4cc19e1102a334c41f0142748ef43def26f74db3",
  "eb36589addbd61f7cb13d095c89b9bec121ba11a",
  "31558144c01117af29fa7c6d4cb5468f3dddb107",
]);
const base = process.env.COMMIT_BASE || "origin/main";
const head = process.env.COMMIT_HEAD || "HEAD";
const output = execFileSync("git", ["log", "--format=%H%x00%s", `${base}..${head}`], { encoding: "utf8" }).trim();
let failed = false;
for (const line of output ? output.split("\n") : []) {
  const [hash, subject] = line.split("\0");
  if (!legacy.has(hash) && !isConventionalCommit(subject)) {
    console.error(`Invalid commit subject ${hash.slice(0, 12)}: ${subject}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
