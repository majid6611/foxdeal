-- Migration 003: Owner earnings tracking
-- When a deal completes, owner/platform split is recorded in owner_earnings.
-- Payouts are scheduled 3 days after the earning is recorded.

CREATE TABLE IF NOT EXISTS owner_earnings (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  deal_id INTEGER NOT NULL REFERENCES deals(id),
  channel_id INTEGER NOT NULL REFERENCES channels(id),
  gross_amount INTEGER NOT NULL,          -- full deal price (Stars)
  platform_fee INTEGER NOT NULL,          -- platform cut
  net_amount INTEGER NOT NULL,            -- owner payout after fee
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid')),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payout_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 days'),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_earnings_owner ON owner_earnings(owner_id);
CREATE INDEX IF NOT EXISTS idx_earnings_status ON owner_earnings(status);
CREATE INDEX IF NOT EXISTS idx_earnings_payout ON owner_earnings(payout_at) WHERE status = 'pending';
