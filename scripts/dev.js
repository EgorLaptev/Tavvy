import { context } from "esbuild";
const js = await context({
  entryPoints: ["src/app.js"],
  bundle: true,
  outfile: "dist/app.js",
  format: "iife",
  sourcemap: true,
});
const css = await context({
  entryPoints: ["styles/preview.css"],
  loader: { ".png": "file" },
  bundle: true,
  outfile: "dist/app.css",
  sourcemap: true,
});
await Promise.all([js.watch(), css.watch()]);
const server = await js.serve({ servedir: ".", port: 5173, host: "127.0.0.1" });
console.log(`Tavvy: http://${server.host}:${server.port}`);
