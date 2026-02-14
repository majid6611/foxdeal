-- Migration 008: Switch click tracking from telegram_user_id to visitor hash (IP+UA fingerprint)
-- This allows seamless URL redirect tracking without requiring bot interaction

ALTER TABLE deal_clicks ADD COLUMN IF NOT EXISTS visitor_hash VARCHAR(64);

-- Backfill existing rows with a placeholder hash based on telegram_user_id
UPDATE deal_clicks SET visitor_hash = 'tg_' || telegram_user_id WHERE visitor_hash IS NULL;

-- Make telegram_user_id optional (URL clicks won't have it)
ALTER TABLE deal_clicks ALTER COLUMN telegram_user_id DROP NOT NULL;

-- Drop old unique index and create new one based on visitor_hash
DROP INDEX IF EXISTS idx_deal_clicks_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_clicks_visitor_unique
  ON deal_clicks (deal_id, visitor_hash);
