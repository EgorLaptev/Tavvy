import { build } from "esbuild";
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir,
  unlink,
} from "node:fs/promises";
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
await mkdir("build/test", { recursive: true });
// jsdom cannot execute module scripts; keep its equivalent bundle out of the extension.
await build({
  entryPoints: ["src/extension/index.js"],
  bundle: true,
  outfile: "build/test/popup.js",
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
  external: ["resource://*"],
  target: "firefox140",
  minify: true,
  legalComments: "eof",
});
const html = (await readFile("index.html", "utf8"))
  .replace('<html lang="ru">', '<html lang="ru" class="extension-mode">')
  .replace(
    '<link rel="stylesheet"',
    '<script src="popup-bootstrap.js"></script>\n    <link rel="stylesheet"',
  )
  .replace("dist/app.css", "popup.css")
  .replace(
    '<script src="dist/app.js">',
    '<script type="module" src="popup.js">',
  );
await writeFile(`${out}/popup.html`, html);
const settingsHtml = html
  .replace('class="extension-mode"', 'class="extension-mode settings-page"')
  .replace(
    "<title>Tabs Group</title>",
    '<title>Tavvy — Settings</title>\n    <link rel="icon" type="image/svg+xml" href="icon.svg">',
  );
await writeFile(`${out}/settings.html`, settingsHtml);
for (const file of ["settings-preview.html", "settings-preview.js"]) {
  try {
    await unlink(`${out}/${file}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
await copyFile("extension/manifest.json", `${out}/manifest.json`);
await copyFile("extension/icon.svg", `${out}/icon.svg`);
console.log(`Firefox extension: ${out}/manifest.json`);

for (const file of ["local-file.html", "local-file.css"])
  await copyFile(`extension/${file}`, `${out}/${file}`);

// Share localization and other common code between the utility pages.
for (const file of await readdir(out))
  if (/^(?:utility-chunk|page-chunk)-.*\.js$/.test(file))
    await unlink(`${out}/${file}`);
await build({
  entryPoints: {
    popup: "src/extension/index.js",
    "local-file": "src/extension/local-file-page.js",
    import: "src/extension/import-page.js",
  },
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: out,
  chunkNames: "page-chunk-[hash]",
  target: "firefox140",
  minify: true,
  legalComments: "eof",
});
for (const file of ["import.html", "local-file.html"]) {
  const page = await readFile(`extension/${file}`, "utf8");
  await writeFile(
    `${out}/${file}`,
    page.replace('<script src="', '<script type="module" src="'),
  );
}
await copyFile("extension/import.css", `${out}/import.css`);
