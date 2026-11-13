# VERUM AI Platform — Workstream

This directory contains the first modular platform boundary alongside the existing VERUM Telegram trading engine. It remains separate from the current Windows-oriented CLI and SQLite runtime.

## Implemented foundation

- `src/publishing-policy.js`: deterministic publication gates and free/VIP entitlement policy.
- `src/scheduler.js`: UTC quarter-hour slot calculation, lease-based scan coordinator contract and idempotent delivery outbox key.
- `src/billing.js`: USD plan normalization, provider-neutral checkout request, USDT/USDC invoice grading and idempotent VIP entitlement extension.
- `src/billing-config.js`: explicit stablecoin route allowlist and provider adapter contract.
- `src/trade-journal.js`: user-reported fill normalization and FIFO realized P&L calculation.\n- `src/telegram-adapter.js`: credential-injected Telegram Bot API client, bot identity check, message validation, normalized delivery receipts and explicit handling of ambiguous network outcomes.
- `contracts/signal.v1.schema.json`: canonical signal payload contract.
- `migrations/001_platform_core.sql`: PostgreSQL persistence tables for signals, subscriptions, payments, scan runs, outbox, quotas, fills and channel links.
- `docs/VERUM_AI_PLATFORM_ARCHITECTURE.md`: product and system architecture.
- `docs/BILLING_INTEGRATION.md`: provider and stablecoin payment safety contract.
- `docs/PERSISTENCE_AND_TRANSACTIONS.md`: persistence, idempotency and transaction boundaries.

## Run domain tests

Requires Node.js 22 or newer:

```sh
npm test
```

GitHub Actions workflow: `.github/workflows/verum-platform.yml`.

## Current validation

The Node 22 platform domain test workflow has completed successfully on the current feature branch. The PostgreSQL migration has not yet been applied to a live database.

## Not yet production-connected

This is a tested domain foundation, not a production deployment. PostgreSQL/Redis adapters, persistent quota transactions, live scheduler worker, market-data adapters, payment provider, chain RPC verification, Discord/WhatsApp adapters, authentication, role synchronization and web dashboard remain to be integrated. The Telegram adapter is a tested transport component only; it is not yet wired to the live worker or configured with production bot credentials and chat IDs.

No payment processor, stablecoin receiving wallet, token contract or network route is configured. Configure and independently verify those before accepting funds. Fiat and stablecoin checkout must use provider-backed pricing and authenticated payment evidence.

The existing VERUM strategy engine remains the source of trading decisions. AI agents may research and explain but cannot override deterministic risk gates or fabricate market levels. Paper/shadow mode remains the default until forward testing and release gates are satisfied.
