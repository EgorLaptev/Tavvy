import { translateText } from "../locales/index.js";

/**
 * Sends popup commands to the background (`runtime.sendMessage`, or the memory adapter in the
 * preview) and applies the responses strictly in submission order.
 *
 * Every command is sent immediately, so the background queue receives it even if the popup
 * closes. A failed command leaves the last confirmed snapshot in place, shows the error and
 * re-renders from that snapshot. Concurrent `snapshot` requests share one round trip.
 *
 * `ctx.applyResponse(command, snapshot, before)` applies a successful response; `before` is
 * what `ctx.beforeCommand(command)` captured when the command was sent.
 */
export function createCommandClient(ctx) {
    const { api, windowId } = ctx;
    let tail = Promise.resolve();
    let pendingSnapshot;

    /** Raw round trip; the caller handles `{ok, error}`. */
    function send(command) {
        return api.runtime.sendMessage({
            channel: "tavvy-command",
            windowId,
            command,
        });
    }

    /** Resolves to the new snapshot or rejects with a translated error. */
    async function request(command) {
        const result = await send(command);

        if (!result?.ok)
            throw new Error(
                translateText(result?.error || "Фоновый процесс недоступен"),
            );

        return result.snapshot;
    }

    function run(command) {
        if (ctx.disposed) return Promise.resolve();
        if (command.type === "snapshot" && pendingSnapshot)
            return pendingSnapshot;

        const before = ctx.beforeCommand?.(command);
        const pending = request(command).then(
            (value) => ({ value }),
            (error) => ({ error }),
        );
        const result = tail.then(async () => {
            const response = await pending;

            if (ctx.disposed) return;
            ctx.status.textContent = "";
            if (response.error) throw response.error;
            ctx.applyResponse(command, response.value, before);
        });

        tail = result.catch((error) => {
            if (ctx.disposed) return;
            ctx.status.textContent = error.message;
            ctx.render();
        });

        if (command.type === "snapshot") {
            pendingSnapshot = tail.finally(() => {
                pendingSnapshot = null;
            });

            return pendingSnapshot;
        }

        return tail;
    }

    return { send, request, run };
}
