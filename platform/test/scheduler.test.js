import test from "node:test";
import assert from "node:assert/strict";
import { enqueueDelivery, executeQuarterHourScan, nextQuarterHour, quarterHourSlot } from "../src/scheduler.js";

test("quarter-hour slots are UTC aligned", () => {
  assert.equal(quarterHourSlot(Date.parse("2026-11-12T10:22:41Z")), "2026-11-12T10:15:00.000Z");
  assert.equal(nextQuarterHour(Date.parse("2026-11-12T10:22:41Z")), "2026-11-12T10:30:00.000Z");
});

test("scan uses a lease and records one idempotent slot", async () => {
  const runs = new Set();
  let released = false;
  const store = {
    acquireLease: async () => true,
    hasRun: async key => runs.has(key),
    recordRun: async key => runs.add(key),
    releaseLease: async () => { released = true; }
  };
  let count = 0;
  const result = await executeQuarterHourScan({ store, owner: "worker-a", now: Date.parse("2026-11-12T10:22:00Z"), scan: async () => ++count });
  assert.equal(result.status, "completed");
  assert.equal(count, 1);
  assert.equal(released, true);
});

test("scan skips when another worker owns the lease", async () => {
  const result = await executeQuarterHourScan({
    store: { acquireLease: async () => false }, owner: "worker-b",
    now: Date.parse("2026-11-12T10:22:00Z"), scan: async () => { throw new Error("must not run"); }
  });
  assert.equal(result.reason, "lease_held");
});

test("delivery outbox key deduplicates the same signal destination and event", async () => {
  let key;
  const result = await enqueueDelivery({ insertIfAbsent: async (k, value) => { key = k; return { inserted: true, ...value }; } },
    { signalId: "s-1", channel: "discord", destinationId: "vip-room" }, { text: "signal" });
  assert.equal(key, "s-1:discord:vip-room:signal");
  assert.equal(result.state, "pending");
});
