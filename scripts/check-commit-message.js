import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) throw new Error("Expected a commit message file");
const message = (await readFile(path, "utf8")).split(/\r?\n/, 1)[0].trim();
const conventional = /^(?:(?:fixup|squash|amend)! )?(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-zA-Z0-9._/-]+\))?!?:\s+\S.*$/;
if (!conventional.test(message)) {
  console.error("Commit message must use Conventional Commits, e.g. feat: add search or fix(settings): save theme.");
  process.exitCode = 1;
}
