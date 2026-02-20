-- Migration 023: Owner withdraw request workflow
-- Adds withdraw request records and links pending earnings to a request.

CREATE TABLE IF NOT EXISTS withdraw_requests (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  wallet_address VARCHAR(128) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'awaiting_tx_link', 'paid', 'cancelled')),
  tx_link TEXT,
  admin_chat_id BIGINT NOT NULL,
  admin_message_id INTEGER,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE owner_earnings
  ADD COLUMN IF NOT EXISTS withdraw_request_id INTEGER REFERENCES withdraw_requests(id);

CREATE INDEX IF NOT EXISTS idx_withdraw_requests_owner ON withdraw_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_status ON withdraw_requests(status);
CREATE INDEX IF NOT EXISTS idx_owner_earnings_withdraw_request ON owner_earnings(withdraw_request_id);
