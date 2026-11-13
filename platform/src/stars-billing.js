/**
 * Telegram Stars billing boundary for VERUM Telegram digital access.
 *
 * Telegram requires digital goods/services sold inside Telegram bots and
 * Mini Apps to use Stars (XTR). This module prepares and verifies the domain
 * payload; the webhook handler must persist state transactionally before
 * granting access.
 */
const STARS_CURRENCY = "XTR";
const STARS_SUBSCRIPTION_PERIOD_SECONDS = 2_592_000; // Telegram's 30-day period.

export function createStarsInvoice({ plan, telegramUserId, invoiceId = globalThis.crypto.randomUUID() }) {
  if (!plan?.id || !plan?.label) throw new TypeError("A named VERUM plan is required");
  if (!Number.isSafeInteger(plan.priceStars) || plan.priceStars < 5 || plan.priceStars > 10_000) {
    throw new RangeError("Telegram Stars subscription price must be an integer from 5 to 10000");
  }
  if (plan.durationDays !== 30) throw new RangeError("Telegram recurring Stars subscriptions currently require a 30-day period");
  if (telegramUserId === undefined || telegramUserId === null || String(telegramUserId).trim() === "") {
    throw new TypeError("telegramUserId is required");
  }
  if (typeof invoiceId !== "string" || invoiceId.length < 12 || invoiceId.length > 128) {
    throw new TypeError("invoiceId must be a unique opaque identifier");
  }

  const payload = `verum:stars:v1:${invoiceId}`;
  return Object.freeze({
    invoiceId,
    telegramUserId: String(telegramUserId),
    planId: String(plan.id),
    currency: STARS_CURRENCY,
    amountStars: plan.priceStars,
    state: "pending",
    subscriptionPeriodSeconds: STARS_SUBSCRIPTION_PERIOD_SECONDS,
    payload,
    telegram: Object.freeze({
      title: String(plan.label).slice(0, 32),
      description: `VERUM ${String(plan.label)} — 30-day access`.slice(0, 255),
      payload,
      currency: STARS_CURRENCY,
      prices: [{ label: String(plan.label).slice(0, 32), amount: plan.priceStars }],
      subscription_period: STARS_SUBSCRIPTION_PERIOD_SECONDS,
    }),
  });
}

/** Validate before answerPreCheckoutQuery(ok=true); never grant access here. */
export function validateStarsPreCheckout(invoice, query) {
  if (!invoice || !query) return { ok: false, reason: "missing_invoice_or_query" };
  if (invoice.state !== "pending") return { ok: false, reason: "invoice_not_pending" };
  if (String(query.from?.id) !== invoice.telegramUserId) return { ok: false, reason: "telegram_user_mismatch" };
  if (query.invoice_payload !== invoice.payload) return { ok: false, reason: "invoice_payload_mismatch" };
  if (query.currency !== STARS_CURRENCY) return { ok: false, reason: "currency_mismatch" };
  if (query.total_amount !== invoice.amountStars) return { ok: false, reason: "amount_mismatch" };
  return { ok: true, reason: "precheckout_valid" };
}

/**
 * Verify the successful_payment object from a Telegram Update.
 * Only this verified receipt may enter the transactional entitlement flow.
 */
export function verifyStarsSuccessfulPayment(invoice, payment, telegramUserId) {
  if (!invoice || !payment) return { paid: false, reason: "missing_invoice_or_payment" };
  if (String(telegramUserId) !== invoice.telegramUserId) return { paid: false, reason: "telegram_user_mismatch" };
  if (payment.invoice_payload !== invoice.payload) return { paid: false, reason: "invoice_payload_mismatch" };
  if (payment.currency !== STARS_CURRENCY) return { paid: false, reason: "currency_mismatch" };
  if (payment.total_amount !== invoice.amountStars) return { paid: false, reason: "amount_mismatch" };
  if (typeof payment.telegram_payment_charge_id !== "string" || !payment.telegram_payment_charge_id) {
    return { paid: false, reason: "missing_telegram_charge_id" };
  }
  return {
    paid: true,
    currency: STARS_CURRENCY,
    amountStars: payment.total_amount,
    invoiceId: invoice.invoiceId,
    planId: invoice.planId,
    telegramUserId: invoice.telegramUserId,
    paymentReference: payment.telegram_payment_charge_id,
    isRecurring: payment.is_recurring === true,
    isFirstRecurring: payment.is_first_recurring === true,
  };
}

export const TELEGRAM_STARS_SUBSCRIPTION_PERIOD_SECONDS = STARS_SUBSCRIPTION_PERIOD_SECONDS;
