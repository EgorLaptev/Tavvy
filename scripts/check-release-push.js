import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { validateReleaseDocs } from "./validate-release-docs.js";

const updates = readFileSync(0, "utf8").trim().split(/\r?\n/).filter(Boolean);
function readAt(commit, path) {
  const result = spawnSync("git", ["show", `${commit}:${path}`], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Cannot read ${path} from the tagged commit`);
  return result.stdout;
}
try {
  for (const update of updates) {
    const [localRef, localOid, remoteRef] = update.split(/\s+/);
    if (!remoteRef?.startsWith("refs/tags/v") || /^0+$/.test(localOid)) continue;
    const version = remoteRef.slice("refs/tags/v".length);
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release tag ${remoteRef}`);
    const commit = spawnSync("git", ["rev-parse", "--verify", `${localRef}^{commit}`], { encoding: "utf8" });
    if (commit.status !== 0) throw new Error(`Cannot resolve ${localRef} to a commit`);
    const ref = commit.stdout.trim();
    const manifest = JSON.parse(readAt(ref, "extension/manifest.json"));
    const pkg = JSON.parse(readAt(ref, "package.json"));
    const lock = JSON.parse(readAt(ref, "package-lock.json"));
    if ([manifest.version, pkg.version, lock.version, lock.packages?.[""]?.version].some((value) => value !== version))
      throw new Error(`Versions do not match release tag v${version}`);
    validateReleaseDocs(version, readAt(ref, "CHANGELOG.md"), readAt(ref, "docs/releases.md"));
  }
} catch (error) { console.error(`Release push blocked: ${error.message}`); process.exitCode = 1; }
