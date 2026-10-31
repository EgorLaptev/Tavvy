import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
const out = "build/firefox";
await mkdir(out, { recursive: true });
await build({
  entryPoints: ["src/background/index.js"],
  bundle: true,
  outfile: `${out}/background.js`,
  format: "iife",
  target: "firefox140",
  minify: true,
  legalComments: "eof",
});
await build({
  entryPoints: ["src/extension/index.js"],
  bundle: true,
  outfile: `${out}/popup.js`,
  format: "iife",
  target: "firefox140",
  minify: true,
  legalComments: "eof",
});
await build({
  entryPoints: ["src/extension/popup-bootstrap.js"],
  bundle: true,
  outfile: `${out}/popup-bootstrap.js`,
  format: "iife",
  target: "firefox140",
  minify: true,
});
await build({
  entryPoints: ["styles/index.css"],
  bundle: true,
  outfile: `${out}/popup.css`,
  loader: { ".png": "file" },
  target: "firefox140",
  minify: true,
  legalComments: "eof",
});
const html = (await readFile("index.html", "utf8"))
  .replace('<html lang="ru">', '<html lang="ru" class="extension-mode">')
  .replace('<link rel="stylesheet"', '<script src="popup-bootstrap.js"></script>\n    <link rel="stylesheet"')
  .replace("dist/app.css", "popup.css")
  .replace("dist/app.js", "popup.js");
await writeFile(`${out}/popup.html`, html);
await copyFile("extension/manifest.json", `${out}/manifest.json`);
await copyFile("extension/icon.svg", `${out}/icon.svg`);
console.log(`Firefox extension: ${out}/manifest.json`);

for (const file of ["local-file.html", "local-file.css"])
  await copyFile(`extension/${file}`, `${out}/${file}`);

await build({
  entryPoints: ["src/extension/local-file-page.js"],
  bundle: true,
  outfile: `${out}/local-file.js`,
  format: "iife",
  target: "firefox140",
  minify: true,
});

await build({
  entryPoints: ["src/extension/import-page.js"],
  bundle: true,
  outfile: `${out}/import.js`,
  format: "iife",
  target: "firefox140",
  minify: true,
  legalComments: "eof",
});
for (const file of ["import.html", "import.css"])
  await copyFile(`extension/${file}`, `${out}/${file}`);
