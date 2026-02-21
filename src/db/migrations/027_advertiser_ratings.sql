-- Migration 027: Advertiser ratings submitted by channel owners after completed deals

CREATE TABLE IF NOT EXISTS advertiser_ratings (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
  advertiser_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advertiser_ratings_advertiser_id ON advertiser_ratings(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_advertiser_ratings_owner_id ON advertiser_ratings(owner_id);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS advertiser_rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS advertiser_rating_count INTEGER NOT NULL DEFAULT 0;
