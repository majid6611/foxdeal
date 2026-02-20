-- Migration 019: track ad views for posted time-based deals

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS ad_views INTEGER,
  ADD COLUMN IF NOT EXISTS ad_views_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_deals_time_posted_for_views
  ON deals (status, pricing_model, posted_at)
  WHERE pricing_model = 'time'
    AND status IN ('posted', 'verified', 'completed')
    AND posted_message_id IS NOT NULL;
