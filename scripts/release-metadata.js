import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";

const tag = process.env.GITHUB_REF_NAME;

if (!/^v\d+\.\d+\.\d+$/.test(tag || ""))
    throw new Error("Expected a version tag like v0.2.11");

const version = tag.slice(1);
const [manifest, pkg, lock, changelog] = await Promise.all([
    readFile("extension/manifest.json", "utf8").then(JSON.parse),
    readFile("package.json", "utf8").then(JSON.parse),
    readFile("package-lock.json", "utf8").then(JSON.parse),
    readFile("CHANGELOG.md", "utf8"),
]);

if (
    [
        manifest.version,
        pkg.version,
        lock.version,
        lock.packages?.[""]?.version,
    ].some((item) => item !== version)
)
    throw new Error("Tag and package versions do not match");

const section = changelog
    .split(/\r?\n(?=## )/)
    .find((part) => part.startsWith(`## ${version} — `));

if (!section) throw new Error("Release section missing from CHANGELOG.md");

const [header, ...body] = section.split(/\r?\n/);
const match = header.match(/^## (\d+\.\d+\.\d+) — (.+) — (\d{4}-\d{2}-\d{2})$/);

if (!match || !body.some((line) => line.startsWith("- ")))
    throw new Error("Invalid release notes");

const artifacts = (await readdir("build/packages")).filter((file) =>
    file.endsWith(`-${version}.zip`),
);

if (artifacts.length !== 1) throw new Error("Expected exactly one release ZIP");

const file = join("build/packages", artifacts[0]);
const data = await readFile(file);
const hash = createHash("sha256").update(data).digest("hex");
const sourceFile = join("build", `tavvy-${version}-amo-source.zip`);
const sourceData = await readFile(sourceFile);
const sourceHash = createHash("sha256").update(sourceData).digest("hex");

await Promise.all([
    writeFile("build/release-title.txt", `${version} — ${match[2]}\n`),
    writeFile("build/release-artifact.txt", `${file}\n`),
    writeFile(
        "build/SHA256SUMS",
        `${hash}  ${basename(file)}\n${sourceHash}  ${basename(sourceFile)}\n`,
    ),
    writeFile(
        "build/release-notes.md",
        `${body.join("\n").trim()}\n\n**Firefox package:** ${data.length.toLocaleString("en-US")} bytes; SHA-256: \`${hash}\`.\n\nThe ZIP is unsigned; Mozilla signing is required for normal installation. The AMO source ZIP contains the source and build instructions for review.\n`,
    ),
]);
