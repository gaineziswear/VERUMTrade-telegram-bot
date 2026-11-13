/**
 * Deterministic publication policy shared by every channel adapter.
 * It is intentionally independent of LLM output and external SDKs.
 */

const finitePositive = (value) => Number.isFinite(value) && value > 0;

export function evaluateCandidate(signal, policy = {}, nowMs = Date.now()) {
  const limits = {
    maxDataAgeMs: policy.maxDataAgeMs ?? 120_000,
    maxRiskScore: policy.maxRiskScore ?? 40,
    maxRoundTripCostPct: policy.maxRoundTripCostPct ?? 5,
    minLiquidityUsd: policy.minLiquidityUsd ?? 20_000,
    minRewardRisk: policy.minRewardRisk ?? 1.5,
    minSecurityChecks: policy.minSecurityChecks ?? 1,
  };
  const reasons = [];
  const observedAt = Date.parse(signal?.market_snapshot?.observed_at ?? "");
  const ageMs = nowMs - observedAt;

  if (!signal?.signal_id) reasons.push("missing_signal_id");
  if (!["LONG", "SHORT"].includes(signal?.direction)) reasons.push("not_a_trade_direction");
  if (!Number.isFinite(observedAt) || ageMs < -30_000 || ageMs > limits.maxDataAgeMs) {
    reasons.push("stale_or_invalid_market_data");
  }

  const market = signal?.market_snapshot ?? {};
  if (!finitePositive(market.price)) reasons.push("invalid_market_price");
  if (!finitePositive(market.liquidity_usd) || market.liquidity_usd < limits.minLiquidityUsd) {
    reasons.push("liquidity_below_floor");
  }

  const risk = signal?.risk ?? {};
  if (!Number.isFinite(risk.score) || risk.score > limits.maxRiskScore) reasons.push("risk_score_above_limit");
  if (!Number.isFinite(risk.round_trip_cost_pct) || risk.round_trip_cost_pct > limits.maxRoundTripCostPct) {
    reasons.push("round_trip_cost_above_limit");
  }
  if (!Number.isInteger(risk.security_checks_total) || risk.security_checks_total < limits.minSecurityChecks ||
      !Number.isInteger(risk.security_checks_passed) || risk.security_checks_passed !== risk.security_checks_total) {
    reasons.push("security_coverage_incomplete");
  }

  const entry = signal?.entry ?? {};
  const stop = signal?.stop_loss?.price;
  const targets = signal?.take_profits ?? [];
  const reference = entry.reference;
  if (!finitePositive(reference) || !finitePositive(stop) || !Array.isArray(targets) || targets.length === 0) {
    reasons.push("invalid_trade_levels");
  } else {
    const isLong = signal.direction === "LONG";
    if ((isLong && stop >= reference) || (!isLong && stop <= reference)) reasons.push("stop_on_wrong_side");
    const validTargets = targets.filter((tp) => finitePositive(tp.price) &&
      (isLong ? tp.price > reference : tp.price < reference));
    if (validTargets.length !== targets.length) reasons.push("target_on_wrong_side");
    const firstTarget = validTargets[0]?.price;
    const riskDistance = Math.abs(reference - stop);
    const rewardDistance = firstTarget === undefined ? 0 : Math.abs(firstTarget - reference);
    const rewardRisk = riskDistance > 0 ? rewardDistance / riskDistance : 0;
    if (rewardRisk < limits.minRewardRisk) reasons.push("reward_risk_below_floor");
    const allocations = targets.reduce((sum, tp) => sum + (Number(tp.allocation_pct) || 0), 0);
    if (allocations > 100.0001 || targets.some((tp) => !Number.isFinite(tp.allocation_pct) || tp.allocation_pct < 0)) {
      reasons.push("invalid_take_profit_allocations");
    }
  }

  const expiresAt = Date.parse(signal?.expires_at ?? "");
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) reasons.push("expired_or_missing_expiry");

  return {
    approved: reasons.length === 0,
    reasons,
    dataAgeMs: Number.isFinite(ageMs) ? ageMs : null,
    policy: limits,
  };
}

/**
 * Free distribution is a capped editorial selection, not a weaker safety policy.
 * Call only with candidates that passed evaluateCandidate().
 */
export function selectFreeDailySignals(approvedSignals, limit = 3) {
  const cap = Math.max(0, Math.min(3, Math.trunc(limit)));
  return [...approvedSignals]
    .sort((a, b) =>
      (a.risk.score - b.risk.score) ||
      ((b.strategy?.net_reward_risk ?? 0) - (a.strategy?.net_reward_risk ?? 0)) ||
      ((b.market_snapshot?.liquidity_usd ?? 0) - (a.market_snapshot?.liquidity_usd ?? 0)))
    .slice(0, cap);
}

export function canReceiveSignal({ tier, signalClass = "standard", freeSignalsSentToday = 0 }) {
  if (tier === "vip") return true;
  if (tier !== "free") return false;
  return signalClass === "curated" && freeSignalsSentToday < 3;
}
