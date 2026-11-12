/**
 * Quarter-hour UTC scheduling primitives.
 * A production scheduler calls these with a PostgreSQL/Redis-backed lease store.
 * A distributed lease and unique run key prevent duplicate scans across replicas.
 */
export function quarterHourSlot(now = Date.now()) {
  const d = new Date(now);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 15) * 15, 0, 0);
  return d.toISOString();
}

export function nextQuarterHour(now = Date.now()) {
  const d = new Date(now);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 15) * 15 + 15, 0, 0);
  return d.toISOString();
}

/**
 * store contract:
 * - acquireLease(key, owner, ttlMs): atomic SET-if-absent / DB lease; returns boolean
 * - hasRun(runKey): true when slot already completed
 * - recordRun(runKey, result): unique runKey insert; must be idempotent
 * - releaseLease(key, owner): release only if owner still owns lease
 */
export async function executeQuarterHourScan({ store, scan, now = Date.now(), owner, leaseMs = 12 * 60_000 }) {
  if (!store || typeof scan !== "function" || !owner) throw new TypeError("store, scan and owner are required");
  const slot = quarterHourSlot(now);
  const runKey = `verum-scan:${slot}`;
  const leaseKey = `lease:${runKey}`;
  const acquired = await store.acquireLease(leaseKey, owner, leaseMs);
  if (!acquired) return { status: "skipped", reason: "lease_held", slot, runKey };
  try {
    if (await store.hasRun(runKey)) return { status: "skipped", reason: "already_completed", slot, runKey };
    const result = await scan({ slot, runKey });
    await store.recordRun(runKey, { slot, completedAt: new Date().toISOString(), result });
    return { status: "completed", slot, runKey, result };
  } finally {
    await store.releaseLease(leaseKey, owner);
  }
}

/** A channel delivery is uniquely identified by signal + destination + message purpose. */
export function deliveryIdempotencyKey({ signalId, channel, destinationId, eventType = "signal" }) {
  if (!signalId || !channel || !destinationId || !eventType) throw new TypeError("All delivery identity fields are required");
  return [signalId, channel, destinationId, eventType].map(v => encodeURIComponent(String(v))).join(":");
}

/**
 * Transactional outbox contract: insertIfAbsent(key, payload) must enforce a unique key.
 * Delivery workers claim pending rows, send, then persist receipt; retry only transient errors.
 */
export async function enqueueDelivery(outbox, identity, payload) {
  if (!outbox || typeof outbox.insertIfAbsent !== "function") throw new TypeError("An idempotent outbox store is required");
  const key = deliveryIdempotencyKey(identity);
  return outbox.insertIfAbsent(key, { key, identity, payload, state: "pending", attempts: 0 });
}
