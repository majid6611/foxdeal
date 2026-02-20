-- Channel ratings submitted by advertisers after deal completion.
CREATE TABLE IF NOT EXISTS channel_ratings (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  advertiser_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_ratings_channel_id ON channel_ratings(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_ratings_advertiser_id ON channel_ratings(advertiser_id);

ALTER TABLE channels
ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;
