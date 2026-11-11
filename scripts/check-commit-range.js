import { execFileSync } from "node:child_process";
import { isConventionalCommit } from "./conventional-commits.js";

const base = process.env.COMMIT_BASE || "origin/main";
const head = process.env.COMMIT_HEAD || "HEAD";
const output = execFileSync(
    "git",
    ["log", "--format=%H%x00%s", `${base}..${head}`],
    { encoding: "utf8" },
).trim();
let failed = false;

for (const line of output ? output.split("\n") : []) {
    const [hash, subject] = line.split("\0");

    if (!isConventionalCommit(subject)) {
        console.error(
            `Invalid commit subject ${hash.slice(0, 12)}: ${subject}`,
        );
        failed = true;
    }
}

if (failed) process.exitCode = 1;
