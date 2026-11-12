/**
 * Provider-neutral subscription billing domain.
 * Does not verify chain transactions itself. Production adapters must verify chain,
 * canonical token contract, recipient, amount, finality and replay protection.
 */
const SUPPORTED_ASSETS = new Set(["USD", "USDT", "USDC"]);
const INVOICE_STATES = new Set(["pending", "confirming", "paid", "expired", "underpaid", "overpaid", "cancelled"]);

export function normalizePlan(input) {
  if (!input?.id || !Number.isFinite(input.priceUsd) || input.priceUsd <= 0) throw new TypeError("Plan requires id and positive USD price");
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1) throw new TypeError("durationDays must be a positive integer");
  return Object.freeze({ id: String(input.id), currency: "USD", priceUsd: Number(input.priceUsd.toFixed(2)), durationDays: input.durationDays, label: String(input.label ?? input.id) });
}

export function createFiatCheckout({ plan, userId, provider, idempotencyKey }) {
  const p = normalizePlan(plan);
  if (!userId || !provider || !idempotencyKey) throw new TypeError("userId, provider and idempotencyKey are required");
  return { userId: String(userId), planId: p.id, amount: p.priceUsd, currency: "USD", provider: String(provider), idempotencyKey: String(idempotencyKey), metadata: { product: "VERUM_VIP", plan_id: p.id, user_id: String(userId) } };
}

export function createStablecoinInvoice({ plan, userId, asset, network, recipient, tokenContract, quoteUsdPerToken, quoteProvider, now = Date.now(), ttlMs = 20 * 60_000 }) {
  const p = normalizePlan(plan);
  const currency = String(asset ?? "").toUpperCase();
  if (!["USDT", "USDC"].includes(currency)) throw new TypeError("Stablecoin asset must be USDT or USDC");
  if (!userId || !network || !recipient || !tokenContract) throw new TypeError("User, network, recipient and canonical token contract are required");
  if (!Number.isFinite(quoteUsdPerToken) || quoteUsdPerToken <= 0 || !quoteProvider) throw new TypeError("A positive provider-backed USD-per-token quote is required");
  if (!Number.isInteger(ttlMs) || ttlMs < 60_000) throw new RangeError("Invoice TTL must be at least one minute");
  return { invoiceId: globalThis.crypto.randomUUID(), userId: String(userId), planId: p.id, quoteCurrency: "USD", quoteAmount: p.priceUsd, asset: currency, network: String(network), recipient: String(recipient), tokenContract: String(tokenContract), quoteUsdPerToken, quoteProvider: String(quoteProvider), expectedAmount: Number((p.priceUsd / quoteUsdPerToken).toFixed(6)), state: "pending", createdAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString() };
}

/** observation.verified is trusted only when the adapter independently checked token, chain, destination, amount, finality and transaction status. */
export function gradeStablecoinPayment(invoice, observation, { now = Date.now(), tolerance = 0.000001 } = {}) {
  if (!invoice || !observation) throw new TypeError("Invoice and observation are required");
  if (!INVOICE_STATES.has(invoice.state)) throw new TypeError("Unknown invoice state");
  if (invoice.state === "paid") return { state: "paid", activate: false, reason: "already_paid" };
  if (["cancelled", "expired"].includes(invoice.state)) return { state: invoice.state, activate: false, reason: "invoice_closed" };
  if (observation.verified !== true) return { state: "confirming", activate: false, reason: "chain_verification_incomplete" };
  const checks = [
    ["invoice_id", observation.invoiceId === invoice.invoiceId],
    ["network", observation.network === invoice.network],
    ["asset", observation.asset === invoice.asset],
    ["token_contract", String(observation.tokenContract).toLowerCase() === invoice.tokenContract.toLowerCase()],
    ["recipient", String(observation.recipient).toLowerCase() === invoice.recipient.toLowerCase()],
    ["transaction", Boolean(observation.txHash)],
    ["confirmations", Number.isInteger(observation.confirmations) && observation.confirmations >= (observation.requiredConfirmations ?? 1)],
    ["amount", Number.isFinite(observation.amount) && observation.amount > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) return { state: "confirming", activate: false, reason: "verification_failed", failed };
  if (observation.amount + tolerance < invoice.expectedAmount) return { state: "underpaid", activate: false, reason: "amount_below_invoice", receivedAmount: observation.amount };
  if (observation.amount - tolerance > invoice.expectedAmount) return { state: "overpaid", activate: false, reason: "manual_reconciliation_required", receivedAmount: observation.amount };
  if (now > Date.parse(invoice.expiresAt)) return { state: "expired", activate: false, reason: "payment_after_expiry_requires_review", receivedAmount: observation.amount };
  return { state: "paid", activate: true, reason: "verified_exact_payment", txHash: observation.txHash, receivedAmount: observation.amount, paidAt: new Date(now).toISOString() };
}

/** Idempotent entitlement projection; persist transactionally in production. */
export function extendVipEntitlement(current, { userId, plan, paidAt, paymentReference }) {
  const p = normalizePlan(plan);
  if (!userId || !paymentReference || !Number.isFinite(Date.parse(paidAt))) throw new TypeError("Valid userId, paymentReference and paidAt are required");
  if (current?.appliedPaymentReferences?.includes(paymentReference)) return { ...current, duplicate: true };
  const paidTime = Date.parse(paidAt);
  const oldEnd = current?.userId === userId && current.status === "active" ? Date.parse(current.expiresAt) : NaN;
  const start = Math.max(paidTime, Number.isFinite(oldEnd) ? oldEnd : paidTime);
  return { userId: String(userId), planId: p.id, status: "active", startsAt: new Date(start).toISOString(), expiresAt: new Date(start + p.durationDays * 86_400_000).toISOString(), appliedPaymentReferences: [...(current?.appliedPaymentReferences ?? []), paymentReference], duplicate: false };
}