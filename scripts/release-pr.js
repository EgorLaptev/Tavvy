import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const branch = process.env.RELEASE_BRANCH || "";
const match = branch.match(/^release\/(\d+\.\d+\.\d+)(?:-[a-z0-9-]+)?$/);
if (!match) throw new Error("Expected a branch like release/0.2.11 or release/0.2.11-clean");
const start = "<!-- tavvy-release-start -->", end = "<!-- tavvy-release-end -->";
const changelog = await readFile("CHANGELOG.md", "utf8");
const version = match[1];
const parts = changelog.split(/\r?\n(?=## )/);
const released = parts.find((part) => part.startsWith(`## ${version} — `));
const section = released || parts.find((part) => part.startsWith("## Unreleased"));
const notes = (section?.split(/\r?\n/).slice(1).join("\n").trim() || "No user-visible changes recorded yet.");
const commits = execFileSync("git", ["log", "--format=- %s (%h)", "origin/main..HEAD"], { encoding: "utf8" }).trim();
if (!commits) throw new Error("Release branch has no commits ahead of main");
const sizeReport = await readFile("build/ci-package/package-size.md", "utf8").catch(() => "");
const generated = `${start}\n## Changes\n\n${notes}\n\n## Commits\n\n${commits}\n\n${sizeReport.trim()}\n\n## Validation\n\n- CI runs tests, Firefox extension validation and the isolated Firefox smoke test for the branch.\n${end}`;
let body = generated;
if (process.argv[2] === "--merge-existing") {
  const existing = await readFile(process.argv[3], "utf8");
  const a = existing.indexOf(start), b = existing.indexOf(end);
  body = a >= 0 && b >= a ? existing.slice(0, a) + generated + existing.slice(b + end.length) : `${existing.trim()}\n\n${generated}`;
}
await mkdir("build", { recursive: true });
await writeFile("build/pr-title.txt", `Release ${version}\n`);
await writeFile("build/pr-body.md", `${body.trim()}\n`);
