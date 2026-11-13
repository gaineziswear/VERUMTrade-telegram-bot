# VERUM Telegram access and payment decision

## Product boundary

VERUM Telegram VIP access, paid signals and other digital services delivered inside Telegram are digital goods/services. Telegram's current Bot Platform terms require these sales to use Telegram Stars (currency `XTR`) exclusively. Do not offer TON, USDT, USDC, card checkout or an external checkout link as an alternate way to buy the same Telegram VIP access inside the bot or Mini App.

Official policy:
- https://core.telegram.org/bots/payments-stars
- https://telegram.org/tos/bot-developers

## Live access service

The dedicated Hatchable project **VERUM Access** is deployed at https://verum-access.hatchable.site. The bot token and webhook secret are stored as server-side secrets, not in this repository.

Current live configuration:
- Access bot: `@verum_axsbot`.
- VIP plan: 90 Telegram Stars (`XTR`) every 30 days.
- VIP destination: the registered VERUM SIGNALS group.
- Checkout uses `createInvoiceLink` with `currency: XTR` and `subscription_period: 2592000`; recurring subscription invoices must not be sent using `sendInvoice`.
- The webhook validates pre-checkout user, invoice payload, currency and exact amount; it grants access only after a matching `successful_payment` receipt.
- Payment charge IDs are stored for idempotency and refund reconciliation.
- After verified payment, the service creates a one-use invite link that expires after 15 minutes.
- An hourly job expires unpaid invoices and removes expired VIP members.
- The service exposes an admin-only Stars refund endpoint and `/terms`, `/support`, `/paysupport`, `/cancel` and `/resume` commands.
- Telegram webhook subscription updates are enabled and reconciled: `canceled` marks auto-renewal canceled while preserving paid-through access; `active` restores renewal; `failed` is audited without prematurely revoking an already-paid period.

## Subscription cancellation semantics

The Bot API does not expose a bot-side method to cancel or reactivate a user's bot Stars subscription. Users manage renewal in Telegram Settings → My Stars → Subscriptions. The bot's `/cancel` and `/resume` commands therefore provide accurate instructions rather than calling a nonexistent Bot API method. The webhook subscribes to Telegram's `subscription` update type and records the authoritative `canceled`, `active` or `failed` state.

Cancellation stops future renewal; it does not erase the paid-through period. The expiry worker removes VIP access only after the entitlement's recorded expiry. A refund is a separate administrative action using `refundStarPayment`; the refund endpoint revokes the currently paid entitlement only when that payment is still the entitlement's latest payment.

## Operational release gate

Health checks currently confirm that bot credentials, price, Signals group, webhook URL and subscription-update coverage are configured. The invoice-link screen has been verified, but no real Stars payment or VIP entitlement has yet been recorded. Do not describe the payment-to-invitation, renewal, cancellation, refund and expiry lifecycle as end-to-end tested until a successful live receipt and the resulting access lifecycle have been exercised.

## TON and stablecoins

TON Connect is appropriate for permitted blockchain interactions. TON-native Gram and canonical TON USDT (Jetton) can be supported by a separate crypto payment service for a genuinely separate, non-Telegram product or other permitted use case. They must not be used as a workaround to sell the same Telegram-delivered VIP signals subscription.

If a future independent crypto product is approved, use TON Connect for wallet authorization and transaction signing. For deposits, allowlist the exact Jetton master contract, derive and verify the receiving jetton wallet, match a unique invoice reference, validate amount and recipient, and wait for masterchain finality before crediting. Never trust token name/symbol metadata or a client-side paid callback.

TON references:
- https://docs.ton.org/applications/ton-connect/overview
- https://docs.ton.org/applications/payments/overview
- https://docs.ton.org/applications/payments/jettons

## Remaining trading-platform integration

The access bot is separate from the strategy engine. It does not create trading signals or execute trades. The platform still needs production PostgreSQL/Redis adapters, a persistent market scan worker, verified market-data adapters, transactional delivery outbox, forward paper/shadow validation, monitoring and explicit release gates. The existing VERUM strategy engine remains authoritative; LLM agents cannot bypass risk gates or invent market prices. Live trading remains disabled.
