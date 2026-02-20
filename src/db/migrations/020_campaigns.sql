-- Migration 020: Multi-channel campaigns
-- Adds campaign containers and per-channel campaign items linked to deals.

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  advertiser_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  ad_text TEXT NOT NULL,
  ad_image_url TEXT,
  ad_link TEXT,
  button_text VARCHAR(24),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_items (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id),
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_approval',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_advertiser
  ON campaigns(advertiser_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign
  ON campaign_items(campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_items_unique_channel
  ON campaign_items(campaign_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_campaign_items_deal
  ON campaign_items(deal_id);

CREATE INDEX IF NOT EXISTS idx_campaign_items_channel
  ON campaign_items(channel_id);

CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS campaigns_updated_at ON campaigns;
CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_campaigns_updated_at();

DROP TRIGGER IF EXISTS campaign_items_updated_at ON campaign_items;
CREATE TRIGGER campaign_items_updated_at
  BEFORE UPDATE ON campaign_items
  FOR EACH ROW
  EXECUTE FUNCTION update_campaigns_updated_at();
