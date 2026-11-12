# VERUM AI Platform — Workstream

This directory is the platform boundary being added alongside the existing VERUM Telegram trading bot. It is deliberately separate from the current Windows-oriented CLI and its SQLite runtime.

## Current foundation

- `src/publishing-policy.js`: deterministic publication gates shared by all channel adapters.
- `test/publishing-policy.test.js`: unit tests for stale data, incomplete security coverage, invalid levels, free-tier caps and VIP access.
- `contracts/signal.v1.schema.json`: canonical signal payload contract.
- `../docs/VERUM_AI_PLATFORM_ARCHITECTURE.md`: full architecture, entitlements, lifecycle, release phases and security controls.

## Run domain tests

From this directory, with Node.js 22.13 or newer:

```sh
npm test
```

## Implementation status

This is a foundation branch, not a production launch. The current publication policy is pure and deterministic, but the database-backed daily free quota, 15-minute distributed scheduler, adapters, subscriptions, user authentication, web UI and WhatsApp compliance workflow still need implementation and integration tests.

The existing signal engine is still the source of strategy decisions. AI components may explain and enrich those decisions, but may not override hard risk gates or invent market levels. Paper/shadow mode remains the default until forward-test evidence supports release.
