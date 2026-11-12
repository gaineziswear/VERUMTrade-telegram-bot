-- VERUM AI platform persistence foundation (PostgreSQL 15+).
-- Apply through a migration runner; do not execute manually against production without backup.
BEGIN;

CREATE TABLE IF NOT EXISTS verum_users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  locale TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'UTC'
);

CREATE TABLE IF NOT EXISTS verum_signals (
  id TEXT PRIMARY KEY,
  strategy_name TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  asset_chain TEXT NOT NULL,
  asset_address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG','SHORT','WATCH')),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN (
    'CANDIDATE','APPROVED','PUBLISHED','ACTIVE','TP_PARTIAL','BREAKEVEN',
    'TRAILING','TP_HIT','SL_HIT','EXPIRED','INVALIDATED','CANCELLED'
  )),
  immutable_payload JSONB NOT NULL,
  market_observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (jsonb_typeof(immutable_payload) = 'object')
);
CREATE INDEX IF NOT EXISTS verum_signals_asset_created_idx ON verum_signals(asset_chain, asset_address, created_at DESC);
CREATE INDEX IF NOT EXISTS verum_signals_status_expiry_idx ON verum_signals(lifecycle_status, expires_at);

CREATE TABLE IF NOT EXISTS verum_signal_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  signal_id TEXT NOT NULL REFERENCES verum_signals(id),
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT NOT NULL,
  market_observed_at TIMESTAMPTZ,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verum_signal_events_signal_time_idx ON verum_signal_events(signal_id, created_at);

CREATE TABLE IF NOT EXISTS verum_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES verum_users(id),
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','past_due','grace','expired','cancelled','revoked')),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  price_usd NUMERIC(18,2) NOT NULL CHECK (price_usd > 0),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS verum_subscriptions_user_status_idx ON verum_subscriptions(user_id, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS verum_payment_invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES verum_users(id),
  subscription_id TEXT REFERENCES verum_subscriptions(id),
  plan_id TEXT NOT NULL,
  quote_currency TEXT NOT NULL DEFAULT 'USD' CHECK (quote_currency = 'USD'),
  quote_amount_usd NUMERIC(18,2) NOT NULL CHECK (quote_amount_usd > 0),
  payment_asset TEXT NOT NULL CHECK (payment_asset IN ('USD','USDT','USDC')),
  payment_network TEXT,
  token_contract TEXT,
  recipient TEXT,
  quote_usd_per_token NUMERIC(24,12),
  quote_provider TEXT,
  expected_token_amount NUMERIC(36,18) NOT NULL CHECK (expected_token_amount > 0),
  state TEXT NOT NULL CHECK (state IN ('pending','confirming','paid','expired','underpaid','overpaid','cancelled','manual_review')),
  idempotency_key TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (payment_asset = 'USD' AND payment_network IS NULL AND token_contract IS NULL)
    OR
    (payment_asset IN ('USDT','USDC') AND payment_network IS NOT NULL AND token_contract IS NOT NULL
      AND recipient IS NOT NULL AND quote_usd_per_token > 0 AND quote_provider IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS verum_invoice_user_state_idx ON verum_payment_invoices(user_id, state, expires_at);

CREATE TABLE IF NOT EXISTS verum_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES verum_payment_invoices(id),
  provider TEXT NOT NULL,
  provider_reference TEXT,
  network TEXT,
  transaction_hash TEXT,
  event_index INTEGER NOT NULL DEFAULT 0,
  asset TEXT NOT NULL CHECK (asset IN ('USD','USDT','USDC')),
  amount NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  confirmations INTEGER,
  verified BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  raw_verified_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_reference),
  UNIQUE(network, transaction_hash, event_index)
);
CREATE INDEX IF NOT EXISTS verum_payments_invoice_idx ON verum_payments(invoice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS verum_scan_runs (
  run_key TEXT PRIMARY KEY,
  slot_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','completed','failed')),
  worker_id TEXT NOT NULL,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS verum_delivery_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  signal_id TEXT REFERENCES verum_signals(id),
  channel TEXT NOT NULL CHECK (channel IN ('telegram','discord','whatsapp','web')),
  destination_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','sent','retry','dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_message_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS verum_outbox_ready_idx ON verum_delivery_outbox(state, next_attempt_at, id);

-- Channel-level daily quota: use INSERT/UPDATE ... WHERE signals_used < 3 in one transaction.
CREATE TABLE IF NOT EXISTS verum_free_channel_quota (
  channel TEXT NOT NULL CHECK (channel IN ('telegram','discord','whatsapp')),
  destination_id TEXT NOT NULL,
  utc_date DATE NOT NULL,
  signals_used SMALLINT NOT NULL DEFAULT 0 CHECK (signals_used BETWEEN 0 AND 3),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(channel, destination_id, utc_date)
);

CREATE TABLE IF NOT EXISTS verum_trade_fills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES verum_users(id),
  signal_id TEXT REFERENCES verum_signals(id),
  asset_chain TEXT NOT NULL,
  asset_address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  quantity NUMERIC(36,18) NOT NULL CHECK (quantity > 0),
  price_usd NUMERIC(36,18) NOT NULL CHECK (price_usd > 0),
  fee_usd NUMERIC(18,8) NOT NULL DEFAULT 0 CHECK (fee_usd >= 0),
  venue TEXT,
  transaction_hash TEXT,
  evidence_type TEXT NOT NULL DEFAULT 'user_reported' CHECK (evidence_type IN ('paper','user_reported','chain_verified','exchange_verified')),
  executed_at TIMESTAMPTZ NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verum_trade_fills_user_asset_time_idx ON verum_trade_fills(user_id, asset_chain, asset_address, executed_at);

CREATE TABLE IF NOT EXISTS verum_user_channel_links (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES verum_users(id),
  channel TEXT NOT NULL CHECK (channel IN ('telegram','discord','whatsapp')),
  external_user_id TEXT NOT NULL,
  external_destination_id TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  UNIQUE(channel, external_user_id)
);

COMMIT;
