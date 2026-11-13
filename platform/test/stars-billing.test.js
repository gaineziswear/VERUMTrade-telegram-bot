import test from "node:test";
import assert from "node:assert/strict";
import {
  createStarsInvoice,
  validateStarsPreCheckout,
  verifyStarsSuccessfulPayment,
  TELEGRAM_STARS_SUBSCRIPTION_PERIOD_SECONDS,
} from "../src/stars-billing.js";

const plan = { id: "vip_monthly", label: "VERUM VIP", priceStars: 500, durationDays: 30 };

test("creates a 30-day Telegram Stars invoice with XTR and an opaque payload", () => {
  const invoice = createStarsInvoice({ plan, telegramUserId: 12345, invoiceId: "inv_test_000001" });
  assert.equal(invoice.currency, "XTR");
  assert.equal(invoice.amountStars, 500);
  assert.equal(invoice.telegram.currency, "XTR");
  assert.equal(invoice.telegram.prices[0].amount, 500);
  assert.equal(invoice.telegram.subscription_period, 2592000);
  assert.equal(invoice.payload, "verum:stars:v1:inv_test_000001");
  assert.equal(TELEGRAM_STARS_SUBSCRIPTION_PERIOD_SECONDS, 2592000);
});

test("rejects unsupported subscription duration and invalid Stars amounts", () => {
  assert.throws(() => createStarsInvoice({ plan: { ...plan, durationDays: 31 }, telegramUserId: 1 }), /30-day/);
  assert.throws(() => createStarsInvoice({ plan: { ...plan, priceStars: 4 }, telegramUserId: 1 }), /5 to 10000/);
  assert.throws(() => createStarsInvoice({ plan: { ...plan, priceStars: 10001 }, telegramUserId: 1 }), /5 to 10000/);
});

test("pre-checkout validates buyer, payload, currency, amount and pending state", () => {
  const invoice = createStarsInvoice({ plan, telegramUserId: 12345, invoiceId: "inv_test_000002" });
  const query = { from: { id: 12345 }, invoice_payload: invoice.payload, currency: "XTR", total_amount: 500 };
  assert.deepEqual(validateStarsPreCheckout(invoice, query), { ok: true, reason: "precheckout_valid" });
  assert.equal(validateStarsPreCheckout(invoice, { ...query, total_amount: 499 }).reason, "amount_mismatch");
  assert.equal(validateStarsPreCheckout(invoice, { ...query, currency: "TON" }).reason, "currency_mismatch");
  assert.equal(validateStarsPreCheckout(invoice, { ...query, from: { id: 99 } }).reason, "telegram_user_mismatch");
  assert.equal(validateStarsPreCheckout({ ...invoice, state: "paid" }, query).reason, "invoice_not_pending");
});

test("only a matching successful Stars receipt is eligible for entitlement", () => {
  const invoice = createStarsInvoice({ plan, telegramUserId: 12345, invoiceId: "inv_test_000003" });
  const payment = {
    invoice_payload: invoice.payload,
    currency: "XTR",
    total_amount: 500,
    telegram_payment_charge_id: "charge_123",
    is_recurring: true,
    is_first_recurring: true,
  };
  const verified = verifyStarsSuccessfulPayment(invoice, payment, 12345);
  assert.equal(verified.paid, true);
  assert.equal(verified.paymentReference, "charge_123");
  assert.equal(verified.isRecurring, true);
  assert.equal(verifyStarsSuccessfulPayment(invoice, { ...payment, total_amount: 1 }, 12345).reason, "amount_mismatch");
  assert.equal(verifyStarsSuccessfulPayment(invoice, payment, 9).reason, "telegram_user_mismatch");
  assert.equal(verifyStarsSuccessfulPayment(invoice, { ...payment, telegram_payment_charge_id: "" }, 12345).reason, "missing_telegram_charge_id");
});
