import { isConventionalCommit } from "./conventional-commits.js";
import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) throw new Error("Expected a commit message file");
const message = (await readFile(path, "utf8")).split(/\r?\n/, 1)[0].trim();
if (!isConventionalCommit(message)) {
  console.error(
    "Commit message must use Conventional Commits, e.g. feat: add search or fix(settings): save theme.",
  );
  process.exitCode = 1;
}
