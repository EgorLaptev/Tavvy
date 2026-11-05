export const ONBOARDING_KEY = "tavvy:tab-manager-notice:v1";

// Read once per background lifetime; no browser operations are enabled until
// acknowledgement has actually been persisted.
export function createOnboardingGate(storage) {
  let enabled = false;
  const ready = storage.get(ONBOARDING_KEY).then((data) => {
    enabled = data[ONBOARDING_KEY] === true;
  });
  return {
    async isEnabled() { await ready; return enabled; },
    async confirm() {
      await ready;
      if (!enabled) {
        await storage.set({ [ONBOARDING_KEY]: true });
        enabled = true;
      }
    },
  };
}
