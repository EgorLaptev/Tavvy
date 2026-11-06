import test from "node:test";
import assert from "node:assert/strict";
import { workload } from "./helpers/workload.js";
import { buildViewIndex, windowRange } from "../src/ui/view-index.js";
for (const n of [100, 500, 1000])
  test(`warm reads and group switch avoid full browser scans: ${n} tabs`, async () => {
    const f = workload(n, 5);
    await f.service.dispatch({ type: "snapshot" }, 1);
    f.reset();
    await f.service.dispatch({ type: "snapshot" }, 1);
    assert.equal(f.counts["tabs.query"] || 0, 0);
    assert.equal(f.counts["sessions.getTabValue"] || 0, 0);
    assert.equal(f.counts["storage.set"] || 0, 0);
    await f.service.dispatch({ type: "activateGroup", groupId: "g1" }, 1);
    assert.equal(f.counts["tabs.query"] || 0, 0);
    assert.equal(f.counts["sessions.getTabValue"] || 0, 0);
    assert.ok((f.counts["tabs.show"] || 0) <= 1);
  });
test("event bursts coalesce and title events require no tab/session reads", async () => {
  const f = workload(1000);
  await f.service.dispatch({ type: "snapshot" }, 1);
  f.reset();
  f.service.invalidate({
    type: "updated",
    tabId: 2,
    changes: { title: "Changed" },
  });
  await Promise.all(Array.from({ length: 100 }, () => f.service.refresh()));
  assert.equal(f.counts["tabs.query"] || 0, 0);
  assert.equal(f.counts["tabs.get"] || 0, 0);
  assert.equal(f.counts["sessions.getTabValue"] || 0, 0);
  const snapshot = await f.service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snapshot.tabs.find((tab) => tab.id === 2).title, "Changed");
});
test("search indexes group tabs once and preserves no-match fallback", async () => {
  const f = workload(1000);
  const snapshot = await f.service.dispatch({ type: "snapshot" }, 1);
  const index = buildViewIndex(snapshot);
  assert.equal(index.byGroup.get("inbox").length, 500);
  assert.equal(index.search("tab 999").rows("g1").length, 1);
  assert.equal(index.search("not found").visible.size, 2);
  assert.ok(
    windowRange(1000, 3000, 300).end - windowRange(1000, 3000, 300).start <= 26,
  );
});
test("closing a 1000-tab window batches persistence", async () => {
  const f = workload(1000);
  await f.service.dispatch({ type: "snapshot" }, 1);
  f.reset();
  await Promise.all(
    Array.from({ length: 1000 }, (_, i) => f.service.removed(i + 1, true)),
  );
  assert.ok((f.counts["storage.set"] || 0) <= 1);
  const snapshot = await f.service.dispatch({ type: "snapshot" }, 1);
  assert.equal(snapshot.tabs.length, 0);
});
