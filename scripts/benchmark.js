import { workload } from "../tests/helpers/workload.js";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
for (const n of [100, 500, 1000])
    for (const windows of [1, 5]) {
        const f = workload(n, windows);
        await f.service.dispatch({ type: "snapshot" }, 1);
        console.log(
            JSON.stringify({
                tabs: n,
                windows,
                action: "cold snapshot",
                ...f.counts,
            }),
        );
        for (const action of ["snapshot", "refresh", "activateGroup"]) {
            f.reset();
            if (action === "refresh") await f.service.refresh();
            else await f.service.dispatch({ type: action, groupId: "g1" }, 1);
            console.log(
                JSON.stringify({ tabs: n, windows, action, ...f.counts }),
            );
        }
    }
for (const name of ["background.js", "popup.js", "import.js", "popup.css"]) {
    const data = await readFile("build/firefox/" + name);
    console.log(
        JSON.stringify({
            bundle: name,
            bytes: data.length,
            gzip: gzipSync(data).length,
        }),
    );
}
