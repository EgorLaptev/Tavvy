import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAsync } from "sass";

export const scssPlugin = {
    name: "scss",
    setup(build) {
        build.onResolve({ filter: /\.scss$/ }, (args) => ({
            path: resolve(args.resolveDir, args.path),
            namespace: "scss",
        }));
        build.onLoad({ filter: /.*/, namespace: "scss" }, async (args) => {
            const result = await compileAsync(args.path, { sourceMap: true });

            return {
                contents: result.css,
                loader: "css",
                resolveDir: dirname(args.path),
                watchFiles: result.loadedUrls
                    .filter((url) => url.protocol === "file:")
                    .map(fileURLToPath),
            };
        });
    },
};
