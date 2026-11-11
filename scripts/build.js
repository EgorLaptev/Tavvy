import { build } from "esbuild";
await build({
    entryPoints: ["src/app.js"],
    bundle: true,
    outfile: "dist/app.js",
    format: "iife",
    sourcemap: true,
    minify: true,
    legalComments: "eof",
});
await build({
    entryPoints: ["styles/preview.css"],
    loader: { ".png": "file" },
    external: ["resource://*"],
    bundle: true,
    outfile: "dist/app.css",
    sourcemap: true,
    minify: true,
    legalComments: "eof",
});
