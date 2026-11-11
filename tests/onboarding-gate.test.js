import test from "node:test";
import assert from "node:assert/strict";
import {
  createOnboardingGate,
  ONBOARDING_KEY,
} from "../src/background/onboarding-gate.js";

test("onboarding gate enables only after acknowledgement is saved", async () => {
  let finishSave;
  const saved = new Promise((resolve) => {
    finishSave = resolve;
  });
  const writes = [];
  const gate = createOnboardingGate({
    get: async () => ({}),
    async set(value) {
      writes.push(value);
      await saved;
    },
  });
  assert.equal(await gate.isEnabled(), false);
  const confirmation = gate.confirm();
  await Promise.resolve();
  assert.equal(await gate.isEnabled(), false);
  finishSave();
  await confirmation;
  assert.equal(await gate.isEnabled(), true);
  await gate.confirm();
  assert.deepEqual(writes, [{ [ONBOARDING_KEY]: true }]);
});

test("previously acknowledged users stay enabled without writing their data", async () => {
  let writes = 0;
  const gate = createOnboardingGate({
    get: async () => ({ [ONBOARDING_KEY]: true }),
    set: async () => {
      writes++;
    },
  });
  assert.equal(await gate.isEnabled(), true);
  await gate.confirm();
  assert.equal(writes, 0);
});

test("a failed acknowledgement keeps onboarding disabled", async () => {
  const gate = createOnboardingGate({
    get: async () => ({}),
    set: async () => {
      throw new Error("storage unavailable");
    },
  });
  await assert.rejects(gate.confirm(), /storage unavailable/);
  assert.equal(await gate.isEnabled(), false);
});
