# VERUM Telegram access and payment decision

## Product boundary

VERUM Telegram VIP access, paid signals and other digital services delivered inside Telegram are digital goods/services. Telegram's current Bot Platform terms require these sales to use Telegram Stars (currency `XTR`) exclusively. Do not offer TON, USDT, USDC, card checkout or an external checkout link as an alternate way to buy the same Telegram VIP access inside the bot or Mini App.

Official policy:
- https://core.telegram.org/bots/payments-stars
- https://telegram.org/tos/bot-developers

## Recommended payment architecture

1. Create a dedicated access bot in @BotFather. Keep it separate from the Go Agent publishing bot.
2. Configure its token only as a server-side secret (never commit it or paste it into chat).
3. Use Telegram Stars invoices in XTR for Telegram VIP plans. Recurring bot invoices are constrained to Telegram's 30-day subscription period.
4. Verify `pre_checkout_query` against the stored pending invoice, Telegram user ID, exact payload, XTR currency and exact amount before answering it.
5. Grant access only after receiving and verifying `successful_payment`; store `telegram_payment_charge_id` for refunds and idempotency.
6. Persist the payment, entitlement and access-grant outbox record in one database transaction.
7. The access bot must be an administrator of VERUM SIGNALS with permission to create invite links and manage membership. Issue single-use/short-lived invite links only after payment confirmation. Enforce expiry and revocation from the entitlement ledger.
8. Implement `/terms`, `/support` and `/paysupport`, payment history, cancellation/renewal status, and the Telegram Stars refund path before production launch.

## TON and stablecoins

TON Connect is appropriate for permitted blockchain interactions. TON-native Gram and canonical TON USDT (Jetton) can be supported by a separate crypto payment service for a genuinely separate, non-Telegram digital product or other permitted use case. They must not be used as a workaround to sell the same Telegram-delivered VIP signals subscription.

If a future independent crypto product is approved, use TON Connect for wallet authorization and transaction signing. For deposits, allowlist the exact Jetton master contract, derive and verify the receiving jetton wallet, match a unique invoice reference, validate amount and recipient, and wait for masterchain finality before crediting. Never trust token name/symbol metadata or a client-side “paid” callback.

TON references:
- https://docs.ton.org/applications/ton-connect/overview
- https://docs.ton.org/applications/payments/overview
- https://docs.ton.org/applications/payments/jettons

## Current implementation status

- `src/stars-billing.js` prepares XTR monthly invoice data and validates pre-checkout and successful-payment receipts.
- Tests cover invoice construction, user/payload/currency/amount checks and payment charge references.
- Production webhook, database persistence, Telegram access-bot token, group admin rights, invite lifecycle, refund/support handling and live billing are not configured by this module.
- No live payment is accepted and no Telegram membership is automatically granted until the production integration and operational checks are complete.
