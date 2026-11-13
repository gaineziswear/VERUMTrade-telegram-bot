# VERUM AI — Multichannel Crypto Intelligence Platform

## Mission

Evolve the existing VERUM trading intelligence into one auditable signal and research service, delivered through Telegram, Discord, WhatsApp and a web workspace. The platform is informational by default; it does not custody user funds or place live orders in the initial release.

## Existing assets and reuse decisions

- `src/analyzer.js`, `src/backtest.js`, `src/costs.js`, `src/chains.js`, `src/bot.js`: preserve as the first strategy/runtime integration boundary. Refactor behind interfaces only after regression tests exist.
- VERUM Meme Trader Skill: source of the Solana-first meme-token discovery, token-risk, round-trip-cost, shadow-testing and trade-journal workflows. Port rules into tested services; do not let an LLM override hard safety gates.
- Telegram signal parser: use as a parser/reference for external signal ingestion, not as the primary signal generator.
- Subscription manager: reuse its webhook verification, idempotent payment references and expiry/revocation patterns; replace provider-specific NGN/Paystack assumptions with a payment-provider adapter.
- ChronosTrade: reference selected quantitative patterns (multi-timeframe alignment, decision tracing, backtesting, partial exits, break-even and drawdown guards). Do not import its MT5 bridge as the crypto execution layer.
- VERUMthor / VerumEgo: evaluate as optional agent-memory references. Both need provenance, dependency, license and security review before any runtime dependency. Keep trading decisions deterministic and reproducible.
- Trojan API repository: unavailable at the supplied URL during initial inspection (404); no integration assumption is made.

## Product behaviour

### Signal cadence and distribution
- Run a market scan every 15 minutes on UTC-aligned quarter-hour boundaries.
- A scan is not required to produce a trade. Publish only when data freshness, liquidity, security, cost, strategy and risk gates pass.
- VIP receives all qualified signals and lifecycle updates in near real time.
- Free Telegram and Discord receive at most three curated signals per UTC day, selected by a deterministic ranking policy. WhatsApp free distribution is opt-in and policy-compliant; use a daily digest/approved templates for business-initiated messages.
- Never duplicate a signal on retries. Every signal has a stable ID, strategy version, data timestamp, publication timestamp and immutable initial parameters.
- Publish revisions as explicit amendments; never silently overwrite entry, TP or SL after distribution.

### Signal lifecycle
`CANDIDATE -> APPROVED -> PUBLISHED -> ACTIVE -> TP_PARTIAL / BREAKEVEN / TRAILING -> TP_HIT | SL_HIT | EXPIRED | INVALIDATED`

Persist every transition with timestamp, triggering market observation and reason. Track outcomes net of fees, slippage and estimated execution impact. Report open/unresolved signals separately from closed outcomes.

### Signal payload
- Market, chain, contract/pair, direction, entry zone and invalidation level.
- Stop loss, staged take-profit levels, risk/reward, estimated round-trip cost and expected holding horizon.
- Strategy and model versions, confidence/risk score with calibrated definition, liquidity and security checks, data age, thesis and invalidation conditions.
- Chart/deep-link, signal ID, created/expiry timestamps and explicit informational-risk disclaimer.

### Free and VIP entitlements
Free:
- Up to three curated signals per day on Telegram and Discord.
- WhatsApp opt-in daily market brief, crypto headlines and selected new-gem alerts.
- Public performance summary with sample size and open-trade disclosure.

VIP:
- Every qualified 15-minute scan signal, subject to quality gates.
- Earlier delivery, advanced rationale, multi-target plans and lifecycle updates.
- Personal watchlists, pair/chain filters, configurable alerts, assistant access, portfolio and trade-journal analytics.
- Signal replay, strategy breakdowns, downloadable reports and priority support.
- No promise of profitability, guaranteed accuracy or risk-free returns.

Enforce entitlements centrally; channel role/group membership is a projection of the subscription ledger, not the source of truth.

## Core architecture

1. **Market-data adapters** — DEXScreener, GeckoTerminal, RugCheck, GoPlus, honeypot checks, Jupiter quotes and supported exchange feeds. Record provider, timestamp, freshness and missing fields.
2. **Discovery workers** — new pairs, liquidity/volume anomalies, watchlists, trending assets and news/gem ingestion.
3. **Deterministic strategy engine** — existing VERUM rules, indicators, multi-timeframe confirmation, market regime and entry/exit calculations.
4. **Risk & eligibility gate** — hard token-security vetoes, liquidity floor, slippage/round-trip cost ceiling, stale-data rejection, exposure limits, cooldowns and kill switch.
5. **AI research agents** — summarize catalysts, compare sources, explain a decision and detect contradictory evidence. Agents may recommend HOLD/SKIP or request review; they cannot bypass deterministic gates or fabricate prices.
6. **Signal ledger & lifecycle monitor** — immutable signal snapshots, idempotency keys, outcome grading and auditable event stream.
7. **Distribution service** — Telegram Bot API, Discord interactions/embeds, WhatsApp Business Cloud API and web notifications. Retries use an outbox and per-channel delivery receipts.
8. **Identity, billing & entitlements** — provider-neutral subscription ledger, verified webhooks, trials/coupons/referrals, renewals, grace periods, revocations and role sync.
9. **Trade journal** — user-entered real fills, partial fills, fees, transaction hashes, notes and evidence. Clearly separate manual user reports, chain-verified events and simulated trades.
10. **Assistant & memory** — user-scoped preferences, portfolio context, strategy documentation and cited signal history. Memory must be permission-scoped, exportable and deletable; no cross-user leakage.
11. **Web control room** — signal feed, live status, track record, watchlists, journal, billing, admin moderation, delivery health and strategy observability.

## Runtime and persistence

- Keep the current Node.js trading engine isolated from channel SDKs.
- Recommended production shape: Node.js 22+ services, PostgreSQL (time-series tables and JSONB; TimescaleDB optional), Redis-backed queue/scheduler, and a web dashboard/API.
- Use an outbox pattern for reliable delivery, idempotency keys for webhooks and signal publication, dead-letter queues, structured logs and health/readiness endpoints.
- Deploy long-running workers separately from serverless web routes. A 15-minute scheduler must have a distributed lock and missed-run recovery.
- Store credentials only in deployment secrets. Never commit bot tokens, API keys, webhook secrets, wallet private keys or user phone numbers.
- Keep paper trading as the default. No seed phrase or private key should ever be requested by the signal platform.

## Security and compliance controls

- Telegram/Discord role membership and payment webhooks are verified server-side.
- WhatsApp requires explicit opt-in, opt-out handling and approved templates for business-initiated messages outside the customer-service window.
- Apply per-user and per-channel rate limits, signed webhooks, replay protection, admin audit logs, least-privilege permissions and secret rotation.
- Trade journal data is private by default. Public performance reporting is aggregate and anonymized.
- Label hypothetical/paper results separately from user-reported or chain-verified real trades.
- Display risk disclosures and avoid personalized financial-advice claims. Obtain jurisdiction-specific legal review before commercial launch.

## Delivery phases and acceptance criteria

### Phase 0 — foundation
- Freeze and baseline current engine tests.
- Create normalized signal contract, database migrations, service boundaries and provider interfaces.
- Add strategy versioning, signal IDs, idempotency and audit events.

### Phase 1 — internal signal pipeline
- Run 15-minute scans in shadow mode.
- Persist candidates, rejection reasons, approved signals and lifecycle changes.
- Backtest and forward-test without publication. Publish nothing until data and risk gates are validated.

### Phase 2 — Telegram + Discord
- Free and VIP channels, bot commands, membership/role sync and subscription entitlement checks.
- Delivery retries, deduplication, per-channel receipts and admin kill switch.

### Phase 3 — web workspace + trade journal
- User authentication, private trade ledger, manual fills, P&L and performance dashboards.
- Separate paper, user-reported real and independently verified trade records.

### Phase 4 — WhatsApp + news/gem desk
- Official WhatsApp Business Cloud API integration, opt-in/opt-out registry, approved templates and message-cost controls.
- News provenance, source quality and duplicate/catalyst checks.

### Phase 5 — AI assistant and VIP intelligence
- Context-aware assistant, user-scoped memory, signal explanation, watchlists, alerts and research reports.
- Evaluate assistant factuality and prevent any ability to change published trade levels without an explicit signal amendment.

### Release gates
- All strategy and risk rules have deterministic unit tests.
- No publication when market data is stale or a hard safety check is missing.
- Duplicate scheduler runs and webhook replays create no duplicate signal, payment or delivery.
- TP/SL outcome grading is reproducible from stored market observations.
- Performance reports disclose sample size, fees, slippage, open positions and methodology.
- Load, retry, outage and permission tests pass before VIP launch.

## Known constraints from initial inspection

- The existing Telegram bot README identifies the project as alpha, documents 174 passing tests, and states that no real-funds swap has yet been sent. Treat it as a practice/shadow system until separately validated.
- Its documented runtime is Windows 10/11 x64 with Node.js 22.13+ and built-in SQLite. The multichannel platform must not inherit the Windows-only deployment assumption; isolate the current engine and add a Linux-capable service boundary.
- The subscription manager is Paystack/NGN-specific. It is a workflow reference, not a production-ready Mauritius/global billing configuration.
- The supplied Trojan API URL returned 404 during initial inspection.
