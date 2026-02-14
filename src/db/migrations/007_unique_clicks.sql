-- Migration 007: Track unique clicks per user per deal (prevent CPC fraud)

CREATE TABLE IF NOT EXISTS deal_clicks (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id),
  telegram_user_id BIGINT NOT NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Each user can only have one paid click per deal
CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_clicks_unique
  ON deal_clicks (deal_id, telegram_user_id);

-- Fast lookup by deal
CREATE INDEX IF NOT EXISTS idx_deal_clicks_deal
  ON deal_clicks (deal_id);
