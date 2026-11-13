# VERUM AI Platform — Workstream

This directory contains the modular VERUM AI platform boundary alongside the existing VERUM Telegram trading engine. The current platform domain code remains separate from the legacy Windows-oriented CLI and SQLite runtime.

## Implemented foundation

- Deterministic signal publication and risk gates, plus the three-curated-signals-per-day free-channel policy.
- UTC quarter-hour scheduling primitives, lease/store contracts and idempotent delivery outbox keys.
- Provider-neutral billing contracts and USDT/USDC invoice grading for separately permitted products; no stablecoin checkout is configured for Telegram VIP access.
- Telegram Stars (XTR) recurring invoice-link construction and strict pre-checkout/successful-payment validation.
- Telegram Bot API adapter with identity checks, message delivery receipts, rate-limit metadata, invite/member operations and explicit ambiguous-network handling.
- Canonical Signal v1 JSON Schema and PostgreSQL persistence migration for signals, subscriptions, invoices/payments, scan runs, delivery outbox, quotas, fills and channel identities.
- FIFO realized P&L accounting for user-reported trade fills.
- Node 22 GitHub Actions workflow and domain unit tests.

## Live Telegram access service

The separate Hatchable project **VERUM Access** is deployed publicly at https://verum-access.hatchable.site.

The live service currently provides:
- BotFather token and webhook-secret configuration as server-side secrets.
- Telegram Stars recurring invoice links at the configured 90-XTR / 30-day plan.
- Server-side pre-checkout validation and successful-payment receipt verification.
- Database-backed payment and VIP entitlement records with payment-charge idempotency.
- Single-use, 15-minute invitation links to the registered VERUM SIGNALS group after verified payment.
- Hourly expiry processing and administrative Stars refund endpoint.
- `/terms`, `/support`, `/paysupport`, `/cancel` and `/resume` command handling.
- Telegram subscription-state webhook handling for cancellation, reactivation and failed renewal events.
- Health checks that verify credentials, price, Signals group, webhook registration and subscription-update coverage.

Checkout health is currently green, but no Stars payment or VIP entitlement has yet been recorded. Do not describe the paid access lifecycle as end-to-end tested until a real successful payment, invitation, cancellation/renewal and expiry path have been verified. The public bot may display the checkout link, but public marketing/scale-up should wait for that operational test.

Telegram recurring Stars invoices must use the `createInvoiceLink` flow with XTR and the 30-day `subscription_period`; do not send recurring subscription invoices using `sendInvoice`. Bot-side cancellation is not exposed as a Bot API operation. The bot directs users to Telegram's subscription settings and records Telegram's subscription update events.

## Remaining production integration

The platform domain foundation is tested, but it is not yet a production trading system. Remaining work includes:
- PostgreSQL/Redis adapters for the strategy worker, persistent quarter-hour scan worker, lease management and transactional delivery outbox.
- Market-data provider adapters with freshness, provenance and fallback checks.
- Chain RPC/indexer and security-screening integrations for supported assets.
- Authenticated web dashboard, member role synchronization, and Discord/WhatsApp delivery adapters.
- Forward paper/shadow validation, observability, alerting and explicit release gates.

No live trading is enabled. The existing VERUM strategy engine remains the source of trading decisions. LLM agents may research and explain but cannot override deterministic risk gates, invent prices or create signals without verified market data.

## Run domain tests

Requires Node.js 22 or newer:

```sh
npm test
```

GitHub Actions workflow: `.github/workflows/verum-platform.yml`.
