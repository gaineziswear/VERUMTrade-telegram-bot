import test from "node:test";
import assert from "node:assert/strict";
import {
  createFiatCheckout, createStablecoinInvoice, extendVipEntitlement,
  gradeStablecoinPayment, normalizePlan
} from "../src/billing.js";
import { findAllowedStablecoinRoute, parseStablecoinNetworkAllowlist } from "../src/billing-config.js";

const plan = { id: "vip-monthly", priceUsd: 29.99, durationDays: 30, label: "VIP Monthly" };
const invoice = () => createStablecoinInvoice({
  plan, userId: "user-42", asset: "USDC", network: "ethereum",
  recipient: "0xabc123", tokenContract: "0xtoken123", quoteUsdPerToken: 1, quoteProvider: "test-quote-provider",
  now: Date.parse("2026-11-12T10:00:00Z")
});
const observation = (inv, overrides = {}) => ({
  verified: true, invoiceId: inv.invoiceId, network: inv.network, asset: inv.asset,
  tokenContract: inv.tokenContract, recipient: inv.recipient, txHash: "0xtxhash",
  confirmations: 12, requiredConfirmations: 12, amount: inv.expectedAmount, ...overrides
});

test("normalizes plans to USD and rejects invalid prices", () => {
  assert.equal(normalizePlan(plan).currency, "USD");
  assert.throws(() => normalizePlan({ ...plan, priceUsd: 0 }), /positive USD price/);
});

test("creates provider-neutral idempotent fiat checkout request", () => {
  const request = createFiatCheckout({ plan, userId: "u1", provider: "provider-adapter", idempotencyKey: "checkout-u1-001" });
  assert.equal(request.currency, "USD");
  assert.equal(request.amount, 29.99);
  assert.equal(request.metadata.product, "VERUM_VIP");
});

test("creates a USD-quoted USDC invoice with expiry", () => {
  const inv = invoice();
  assert.equal(inv.quoteCurrency, "USD");
  assert.equal(inv.asset, "USDC");
  assert.equal(inv.expectedAmount, 29.99);
  assert.equal(inv.quoteProvider, "test-quote-provider");
  assert.ok(Date.parse(inv.expiresAt) > Date.parse(inv.createdAt));
});

test("requires a live provider-backed quote instead of assuming a one-dollar peg", () => {
  assert.throws(() => createStablecoinInvoice({ plan, userId: "u1", asset: "USDT", network: "ethereum", recipient: "0xabc", tokenContract: "0xtoken" }), /USD-per-token quote/);
  const inv = createStablecoinInvoice({ plan, userId: "u1", asset: "USDT", network: "ethereum", recipient: "0xabc", tokenContract: "0xtoken", quoteUsdPerToken: 0.999, quoteProvider: "pricing-adapter" });
  assert.ok(inv.expectedAmount > inv.quoteAmount);
});

test("accepts exact verified stablecoin payment", () => {
  const inv = invoice();
  const result = gradeStablecoinPayment(inv, observation(inv), { now: Date.parse("2026-11-12T10:05:00Z") });
  assert.equal(result.state, "paid");
  assert.equal(result.activate, true);
});

test("fails closed when chain verification is incomplete", () => {
  const inv = invoice();
  const result = gradeStablecoinPayment(inv, observation(inv, { verified: false }));
  assert.equal(result.activate, false);
  assert.equal(result.state, "confirming");
});

test("rejects wrong token contract and destination", () => {
  const inv = invoice();
  const result = gradeStablecoinPayment(inv, observation(inv, { tokenContract: "0xnot-token", recipient: "0xwrong" }));
  assert.equal(result.activate, false);
  assert.ok(result.failed.includes("token_contract"));
  assert.ok(result.failed.includes("recipient"));
});

test("underpayment and overpayment never auto-activate VIP", () => {
  const inv = invoice();
  assert.equal(gradeStablecoinPayment(inv, observation(inv, { amount: 20 })).activate, false);
  assert.equal(gradeStablecoinPayment(inv, observation(inv, { amount: 40 })).activate, false);
});

test("expired invoice payment is held for manual review", () => {
  const inv = invoice();
  const result = gradeStablecoinPayment(inv, observation(inv), { now: Date.parse(inv.expiresAt) + 1 });
  assert.equal(result.state, "expired");
  assert.equal(result.activate, false);
});

test("VIP entitlement extends from current expiry and deduplicates payment references", () => {
  const paidAt = "2026-11-12T10:00:00.000Z";
  const first = extendVipEntitlement(null, { userId: "u1", plan, paidAt, paymentReference: "tx-1" });
  const second = extendVipEntitlement(first, { userId: "u1", plan, paidAt, paymentReference: "tx-2" });
  assert.equal(Date.parse(second.expiresAt) - Date.parse(first.expiresAt), 30 * 86_400_000);
  const duplicate = extendVipEntitlement(second, { userId: "u1", plan, paidAt, paymentReference: "tx-2" });
  assert.equal(duplicate.duplicate, true);
});

test("stablecoin route allowlist is explicit and rejects malformed routes", () => {
  const routes = parseStablecoinNetworkAllowlist("USDC:ethereum:0xtoken:0xwallet,USDT:solana:mint:wallet");
  assert.equal(findAllowedStablecoinRoute(routes, { asset: "USDC", network: "ethereum" }).recipient, "0xwallet");
  assert.equal(findAllowedStablecoinRoute(routes, { asset: "USDC", network: "polygon" }), null);
  assert.throws(() => parseStablecoinNetworkAllowlist("USDC:ethereum"), /ASSET:NETWORK/);
});
