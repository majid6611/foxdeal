-- Migration 001: Initial schema
-- Tables: users, channels, deals, transactions

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('advertiser', 'owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  telegram_channel_id VARCHAR(100) UNIQUE NOT NULL,
  username VARCHAR(100) NOT NULL,
  subscribers INTEGER NOT NULL DEFAULT 0,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  price INTEGER NOT NULL,
  duration_hours INTEGER NOT NULL DEFAULT 24,
  bot_is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deals (
  id SERIAL PRIMARY KEY,
  advertiser_id INTEGER NOT NULL REFERENCES users(id),
  channel_id INTEGER NOT NULL REFERENCES channels(id),
  ad_text TEXT NOT NULL,
  ad_image_url TEXT,
  duration_hours INTEGER NOT NULL,
  price INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'created'
    CHECK (status IN (
      'created', 'pending_approval', 'approved', 'rejected',
      'escrow_held', 'posted', 'verified', 'completed',
      'disputed', 'refunded', 'expired'
    )),
  posted_message_id VARCHAR(100),
  posted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active deal per advertiser + channel (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_active_unique
  ON deals (advertiser_id, channel_id)
  WHERE status NOT IN ('completed', 'rejected', 'refunded', 'expired');

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('hold', 'release', 'refund')),
  amount INTEGER NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'telegram_stars',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_channels_owner ON channels(owner_id);
CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_deals_advertiser ON deals(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_deals_channel ON deals(channel_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_transactions_deal ON transactions(deal_id);

-- Auto-update updated_at on deals
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deals_updated_at ON deals;
CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
