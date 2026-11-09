import { dragInProgress } from "./dom.js";

/**
 * Refreshes the snapshot when the background broadcasts `{channel: "tavvy", type: "changed"}`.
 * Bursts are debounced, and refreshes wait while something is being dragged.
 */
export function createLiveUpdates(ctx) {
  const { api } = ctx;
  let refreshTimer;
  const onMessage = (message) => {
    if (message?.channel !== "tavvy" || message.type !== "changed") return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function refresh() {
      if (dragInProgress()) {
        refreshTimer = setTimeout(refresh, 150);
        return;
      }
      ctx.run({ type: "snapshot" });
    }, 100);
  };
  api.runtime.onMessage.addListener(onMessage);
  return {
    dispose() {
      clearTimeout(refreshTimer);
      api.runtime.onMessage.removeListener?.(onMessage);
    },
  };
}
