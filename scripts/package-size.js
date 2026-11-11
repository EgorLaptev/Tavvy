import { readdir, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const archives = (await readdir("build/packages")).filter((name) =>
  name.endsWith(".zip"),
);
if (archives.length !== 1)
  throw new Error("Expected exactly one package in build/packages");
const size = (await stat(join("build/packages", archives[0]))).size;
let comparison = "Previous release package unavailable.";
try {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
    throw new Error("Invalid repository");
  const release = JSON.parse(
    execFileSync("gh", ["api", `repos/${repo}/releases/latest`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  const asset = release.assets?.find((item) => item.name.endsWith(".zip"));
  if (Number.isFinite(asset?.size) && asset.size > 0) {
    const delta = size - asset.size;
    comparison = `Previous release ${release.tag_name}: ${(asset.size / 1024).toFixed(1)} KiB; change: ${delta >= 0 ? "+" : ""}${(delta / 1024).toFixed(1)} KiB (${delta >= 0 ? "+" : ""}${((delta / asset.size) * 100).toFixed(1)}%).`;
  }
} catch {
  /* A first release or unavailable API does not block CI. */
}
await writeFile(
  "build/package-size.md",
  `## Package size\n\nUnsigned ZIP: **${(size / 1024).toFixed(1)} KiB** (${size} bytes). ${comparison}\n`,
);
