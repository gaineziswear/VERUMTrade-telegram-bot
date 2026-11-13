import test from "node:test";
import assert from "node:assert/strict";
import { canReceiveSignal, evaluateCandidate, selectFreeDailySignals } from "../src/publishing-policy.js";

const now = Date.parse("2026-11-12T12:00:00.000Z");
const candidate = (overrides = {}) => ({
  signal_id: "verum-test-signal-0001",
  direction: "LONG",
  entry: { min: 99, max: 101, reference: 100 },
  stop_loss: { price: 95 },
  take_profits: [{ price: 110, allocation_pct: 50 }, { price: 115, allocation_pct: 50 }],
  risk: { score: 20, round_trip_cost_pct: 2, security_checks_passed: 5, security_checks_total: 5 },
  market_snapshot: {
    price: 100,
    liquidity_usd: 250000,
    observed_at: new Date(now - 30_000).toISOString(),
    provider: "fixture"
  },
  expires_at: new Date(now + 60 * 60_000).toISOString(),
  ...overrides
});

test("approves a fresh, liquid candidate with complete checks and valid levels", () => {
  assert.equal(evaluateCandidate(candidate(), {}, now).approved, true);
});

test("rejects stale market data", () => {
  const signal = candidate({ market_snapshot: { ...candidate().market_snapshot, observed_at: new Date(now - 600_000).toISOString() } });
  assert.ok(evaluateCandidate(signal, {}, now).reasons.includes("stale_or_invalid_market_data"));
});

test("missing security checks fail closed", () => {
  const signal = candidate({ risk: { ...candidate().risk, security_checks_total: 0, security_checks_passed: 0 } });
  assert.ok(evaluateCandidate(signal, {}, now).reasons.includes("security_coverage_incomplete"));
});

test("rejects a stop loss on the wrong side of a long entry", () => {
  const signal = candidate({ stop_loss: { price: 101 } });
  assert.ok(evaluateCandidate(signal, {}, now).reasons.includes("stop_on_wrong_side"));
});

test("free tier is capped at three curated signals while VIP receives qualified signals", () => {
  assert.equal(canReceiveSignal({ tier: "free", signalClass: "curated", freeSignalsSentToday: 2 }), true);
  assert.equal(canReceiveSignal({ tier: "free", signalClass: "curated", freeSignalsSentToday: 3 }), false);
  assert.equal(canReceiveSignal({ tier: "free", signalClass: "standard", freeSignalsSentToday: 0 }), false);
  assert.equal(canReceiveSignal({ tier: "vip" }), true);
});

test("free daily selector never returns more than three and ranks lower risk first", () => {
  const signals = [candidate({ signal_id: "a", risk: { ...candidate().risk, score: 35 } }),
    candidate({ signal_id: "b", risk: { ...candidate().risk, score: 10 } }),
    candidate({ signal_id: "c", risk: { ...candidate().risk, score: 20 } }),
    candidate({ signal_id: "d", risk: { ...candidate().risk, score: 5 } })];
  const selected = selectFreeDailySignals(signals, 99);
  assert.equal(selected.length, 3);
  assert.equal(selected[0].signal_id, "d");
});
