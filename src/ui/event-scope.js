export function createEventScope() {
  const controller = new AbortController();
  const dispose = () => {
    controller.abort();
    window.removeEventListener("pagehide", dispose);
  };
  window.addEventListener("pagehide", dispose, { once: true });
  return {
    listen(target, type, listener, options = {}) {
      target.addEventListener(type, listener, {
        ...options,
        signal: controller.signal,
      });
    },
    dispose,
  };
}
