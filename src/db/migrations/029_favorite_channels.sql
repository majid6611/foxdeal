CREATE TABLE IF NOT EXISTS favorite_channels (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_channels_user_created
  ON favorite_channels (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_favorite_channels_channel
  ON favorite_channels (channel_id);
