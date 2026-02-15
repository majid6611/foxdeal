-- Migration 014: Allow multiple active deals per advertiser+channel
-- Drop the partial unique index that enforced only one active deal.

DROP INDEX IF EXISTS idx_deals_active_unique;

-- Keep a regular index for common lookups without enforcing uniqueness.
CREATE INDEX IF NOT EXISTS idx_deals_advertiser_channel_status
  ON deals (advertiser_id, channel_id, status);
