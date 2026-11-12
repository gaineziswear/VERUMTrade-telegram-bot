import test from "node:test";
import assert from "node:assert/strict";
import { calculateRealizedPnl, normalizeFill } from "../src/trade-journal.js";

test("normalizes user-reported fills with explicit evidence classification", () => {
  const fill = normalizeFill({ userId: "u1", signalId: "s1", asset: "SOL", side: "BUY", quantity: 2, price: 100, feeUsd: 1, executedAt: "2026-11-12T10:00:00Z" });
  assert.equal(fill.evidenceType, "user_reported");
  assert.equal(fill.feeUsd, 1);
});

test("calculates FIFO realized P&L net of entry and exit fees", () => {
  const fills = [
    { side: "BUY", quantity: 2, price: 100, feeUsd: 2, executedAt: "2026-11-12T10:00:00Z" },
    { side: "SELL", quantity: 1, price: 120, feeUsd: 1, executedAt: "2026-11-12T11:00:00Z" }
  ];
  const result = calculateRealizedPnl(fills);
  assert.equal(result.realizedPnlUsd, 18.5);
  assert.equal(result.openQuantity, 1);
  assert.equal(result.unmatchedSellQuantity, 0);
});

test("reports sells without a recorded buy instead of inventing cost basis", () => {
  const result = calculateRealizedPnl([{ side: "SELL", quantity: 1, price: 10, feeUsd: 0, executedAt: "2026-11-12T11:00:00Z" }]);
  assert.equal(result.unmatchedSellQuantity, 1);
  assert.equal(result.realizedPnlUsd, 0);
});
