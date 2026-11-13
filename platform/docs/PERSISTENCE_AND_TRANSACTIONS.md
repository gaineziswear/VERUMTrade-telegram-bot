# Persistence and transaction boundaries

Migration: `001_platform_core.sql`

The migration establishes PostgreSQL tables for users, immutable signal snapshots and lifecycle events, subscription entitlements, fiat/stablecoin invoices and payment evidence, quarter-hour scan runs, a delivery outbox, free-channel daily quotas, user trade fills and linked channel identities.

## Required transactional rules

- Signal creation and its first lifecycle event must commit together.
- A scan run key is unique per UTC quarter-hour slot. Workers acquire a lease before scanning; the run row is the durable idempotency record.
- Outbox insertion uses the unique idempotency key. Delivery workers claim rows with `FOR UPDATE SKIP LOCKED`, send outside the transaction, then persist provider receipt or retry state.
- Free-channel quota increments must be atomic and conditional: update only when `signals_used < 3`; quota and outbox insert must commit in the same transaction.
- Payment insertion, invoice state transition and subscription entitlement extension must be one transaction. Enforce payment-reference uniqueness and reject replay.
- A channel role/group is only a projection of the subscription ledger. Periodic reconciliation must revoke expired or cancelled VIP access.
- Trade fills are append-only. Corrections are compensating entries or audited amendments, never silent rewrites.

## Security boundary

The migration intentionally does not enable row-level security yet. Before exposing the API, implement authenticated user context and RLS policies (or enforce equivalent tenant scoping in a trusted service layer with audited tests). Never expose database credentials or accept user_id from an untrusted client as authorization proof.
