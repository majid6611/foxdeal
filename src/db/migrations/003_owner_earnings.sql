-- Migration 003: Owner earnings tracking
-- When a deal completes, 95% goes to owner, 5% is platform fee.
-- Payouts are scheduled 30 days after the earning is recorded.

CREATE TABLE IF NOT EXISTS owner_earnings (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  deal_id INTEGER NOT NULL REFERENCES deals(id),
  channel_id INTEGER NOT NULL REFERENCES channels(id),
  gross_amount INTEGER NOT NULL,          -- full deal price (Stars)
  platform_fee INTEGER NOT NULL,          -- 5% platform cut
  net_amount INTEGER NOT NULL,            -- 95% owner payout
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid')),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payout_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_earnings_owner ON owner_earnings(owner_id);
CREATE INDEX IF NOT EXISTS idx_earnings_status ON owner_earnings(status);
CREATE INDEX IF NOT EXISTS idx_earnings_payout ON owner_earnings(payout_at) WHERE status = 'pending';
