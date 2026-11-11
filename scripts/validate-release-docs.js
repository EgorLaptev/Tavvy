import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function validateReleaseDocs(version, changelog, releases) {
    if (!/^\d+\.\d+\.\d+$/.test(version))
        throw new Error("Invalid release version");
    const section = (text) =>
        text
            .split(/\r?\n(?=## )/)
            .find((part) => part.startsWith(`## ${version} — `));
    const notes = section(changelog),
        metadata = section(releases);
    if (!notes)
        throw new Error(
            `CHANGELOG.md is missing the ${version} release section`,
        );
    const match = notes
        .split(/\r?\n/)[0]
        .match(/^## (\d+\.\d+\.\d+) — (.+) — (\d{4}-\d{2}-\d{2})$/);
    if (!match || !notes.split(/\r?\n/).some((line) => line.startsWith("- ")))
        throw new Error(`CHANGELOG.md has invalid notes for ${version}`);
    if (!metadata)
        throw new Error(
            `docs/releases.md is missing the ${version} release section`,
        );
    const lines = metadata.split(/\r?\n/);
    const required = [
        `## ${version} — ${match[2]}`,
        `- Release date: ${match[3]}`,
        `- Release source: \`v${version}\``,
        `- Artifact: \`tavvy_tabs_group-${version}.zip\``,
        `- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v${version}/SHA256SUMS`,
        "- Signature: unsigned",
    ];
    if (
        !required.every((line) => lines.includes(line)) ||
        !lines.some(
            (line) => line.startsWith("- Verification: ") && line.length > 16,
        )
    )
        throw new Error(
            `docs/releases.md has incomplete or mismatched metadata for ${version}`,
        );
    const table = releases
        .split(/\r?\n(?=## )/)
        .find(
            (part) =>
                part.startsWith("## Release packages\n") ||
                part.startsWith("## Release packages\r\n"),
        );
    const row = table
        ?.split(/\r?\n/)
        .find((line) => line.startsWith(`| ${version} | \`v${version}\` |`));
    const cells = row
        ?.split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
    if (
        !cells ||
        cells.length !== 5 ||
        cells[2] !== "GitHub Release" ||
        !(
            (cells[3] === "pending" && cells[4] === "pending") ||
            (/^\d[\d,]*$/.test(cells[3]) && /^`[a-f0-9]{64}`$/.test(cells[4]))
        )
    )
        throw new Error(
            `docs/releases.md is missing a valid ${version} package table row`,
        );
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
    try {
        const version = process.argv[2]?.replace(/^v/, "") || "";
        validateReleaseDocs(
            version,
            await readFile("CHANGELOG.md", "utf8"),
            await readFile("docs/releases.md", "utf8"),
        );
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
