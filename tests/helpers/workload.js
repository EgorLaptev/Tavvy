import { createMemoryBrowser } from "../../src/mocks/memory-browser.js";
import { createWorkspaceService } from "../../src/background/workspace-service.js";

export function workload(count, windowCount = 1, groupCount = 2) {
    const groups = Array.from({ length: groupCount }, (_, i) => ({
        id: i ? "g" + i : "inbox",
        title: "Group " + i,
        color: "#398dff",
        parentId: null,
    }));
    const tabs = Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        windowId: (i % windowCount) + 1,
        groupId: groups[Math.floor(i / windowCount) % groupCount].id,
        index: Math.floor(i / windowCount),
        title: "Tab " + i,
        url: "https://example.test/" + i,
        active: i < windowCount,
        pinned: false,
        hidden: Math.floor(i / windowCount) % groupCount !== 0,
        audible: false,
        discarded: false,
    }));
    const counts = {};
    const api = createMemoryBrowser({ groups, tabs });

    for (const namespace of ["tabs", "sessions", "storage"]) {
        const object =
            namespace === "storage" ? api.storage.local : api[namespace];

        for (const key of Object.keys(object)) {
            if (typeof object[key] !== "function") continue;

            const original = object[key];

            object[key] = async (...args) => {
                const name = namespace + "." + key;

                counts[name] = (counts[name] || 0) + 1;
                if (name === "storage.set")
                    counts.serializedBytes =
                        (counts.serializedBytes || 0) +
                        Buffer.byteLength(JSON.stringify(args[0]));

                return original(...args);
            };
        }
    }

    const service = createWorkspaceService(api);

    api.bind(service);

    return {
        api,
        service,
        counts,
        reset() {
            for (const key of Object.keys(counts)) delete counts[key];
        },
    };
}
