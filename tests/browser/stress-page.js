import { mountApplication } from "../../src/ui/application.js";
import { createMemoryBrowser } from "../../src/mocks/memory-browser.js";
import { createWorkspaceService } from "../../src/background/workspace-service.js";

(async () => {
    try {
        const count = 1000;
        const api = createMemoryBrowser({
            groups: [
                {
                    id: "inbox",
                    title: "1000 tabs",
                    color: "#398dff",
                    parentId: null,
                },
            ],
            tabs: Array.from({ length: count }, (_, i) => ({
                id: i + 1,
                windowId: 1,
                groupId: "inbox",
                index: i,
                title: "Tab " + i,
                url: "https://example.test/" + i,
            })),
            settings: { animations: false, height: 300 },
        });

        api.bind(createWorkspaceService(api));

        let listeners = 0;
        const add = api.runtime.onMessage.addListener,
            remove = api.runtime.onMessage.removeListener;

        api.runtime.onMessage.addListener = (fn) => {
            listeners++;
            add(fn);
        };

        api.runtime.onMessage.removeListener = (fn) => {
            listeners--;
            remove(fn);
        };

        const start = performance.now();

        await mountApplication(api);
        if (document.querySelectorAll(".tab-row").length)
            throw new Error("Collapsed rows were eagerly mounted");

        const toggle = document.querySelector(".group-toggle");

        toggle.click();

        const openRows = document.querySelectorAll(".tab-row").length;

        if (openRows > 40) throw new Error("Too many DOM rows: " + openRows);

        const scroller = document.querySelector(".groups");

        scroller.scrollTop = scroller.scrollHeight;
        scroller.dispatchEvent(new Event("scroll"));
        parent.postMessage({ channel: "tavvy-stress-waiting" }, "*");
        await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        if (!document.querySelector('[data-tab-id="1000"]'))
            throw new Error("Cannot scroll to the last virtualized tab");
        toggle.click();

        for (let i = 0; i < 100; i++) {
            toggle.click();
            toggle.click();
        }

        if (document.querySelectorAll(".tab-row").length)
            throw new Error("Closed groups retain DOM rows");
        window.dispatchEvent(new PageTransitionEvent("pagehide"));
        if (listeners)
            throw new Error("Runtime listeners retained after dispose");
        parent.postMessage(
            {
                channel: "tavvy-stress",
                ok: true,
                openRows,
                closedRows: 0,
                listenersAfterDispose: listeners,
                elapsedMs: Math.round(performance.now() - start),
            },
            "*",
        );
    } catch (error) {
        parent.postMessage(
            { channel: "tavvy-stress", ok: false, error: error.message },
            "*",
        );
    }
})();
