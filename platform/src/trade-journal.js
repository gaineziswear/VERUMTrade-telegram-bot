/**
 * User-owned trade journal domain. These are user-reported fills unless a separate
 * chain/exchange adapter has independently verified the execution.
 */
const SIDES = new Set(["BUY", "SELL"]);

export function normalizeFill(fill) {
  if (!fill?.userId || !fill?.signalId || !fill?.asset || !SIDES.has(fill.side)) throw new TypeError("Fill requires userId, signalId, asset and BUY/SELL side");
  for (const key of ["quantity", "price"]) if (!Number.isFinite(fill[key]) || fill[key] <= 0) throw new TypeError(`${key} must be positive`);
  const fee = fill.feeUsd ?? 0;
  if (!Number.isFinite(fee) || fee < 0) throw new TypeError("feeUsd must be non-negative");
  return Object.freeze({
    fillId: String(fill.fillId ?? globalThis.crypto.randomUUID()),
    userId: String(fill.userId),
    signalId: String(fill.signalId),
    asset: String(fill.asset),
    side: fill.side,
    quantity: fill.quantity,
    price: fill.price,
    feeUsd: fee,
    executedAt: new Date(fill.executedAt ?? Date.now()).toISOString(),
    venue: fill.venue ? String(fill.venue) : null,
    txHash: fill.txHash ? String(fill.txHash) : null,
    evidenceType: fill.evidenceType === "chain_verified" ? "chain_verified" : "user_reported",
    notes: fill.notes ? String(fill.notes) : "",
  });
}

/** FIFO realized P&L from fills, net of recorded fees. Caller must scope fills to one user and asset. */
export function calculateRealizedPnl(fills) {
  const ordered = [...fills].sort((a, b) => Date.parse(a.executedAt) - Date.parse(b.executedAt));
  const lots = [];
  let realizedPnlUsd = 0;
  let unmatchedSellQuantity = 0;
  for (const fill of ordered) {
    if (!SIDES.has(fill.side) || !(fill.quantity > 0) || !(fill.price > 0)) throw new TypeError("Invalid normalized fill");
    if (fill.side === "BUY") {
      lots.push({ quantity: fill.quantity, unitCost: fill.price + (fill.feeUsd ?? 0) / fill.quantity });
      continue;
    }
    let remaining = fill.quantity;
    const sellFeePerUnit = (fill.feeUsd ?? 0) / fill.quantity;
    while (remaining > 1e-12 && lots.length) {
      const lot = lots[0];
      const matched = Math.min(remaining, lot.quantity);
      realizedPnlUsd += matched * (fill.price - sellFeePerUnit - lot.unitCost);
      remaining -= matched;
      lot.quantity -= matched;
      if (lot.quantity <= 1e-12) lots.shift();
    }
    unmatchedSellQuantity += remaining;
  }
  return {
    realizedPnlUsd: Number(realizedPnlUsd.toFixed(8)),
    openQuantity: Number(lots.reduce((sum, lot) => sum + lot.quantity, 0).toFixed(12)),
    unmatchedSellQuantity: Number(unmatchedSellQuantity.toFixed(12)),
    accountingMethod: "FIFO",
  };
}
