-- Migration 002: Add 'cancelled' to deal status check constraint

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_status_check;
ALTER TABLE deals ADD CONSTRAINT deals_status_check
  CHECK (status IN (
    'created', 'pending_approval', 'approved', 'rejected',
    'escrow_held', 'posted', 'verified', 'completed',
    'disputed', 'refunded', 'expired', 'cancelled'
  ));

-- Cancelled deals should not block the unique active deal constraint
DROP INDEX IF EXISTS idx_deals_active_unique;
CREATE UNIQUE INDEX idx_deals_active_unique
  ON deals (advertiser_id, channel_id)
  WHERE status NOT IN ('completed', 'rejected', 'refunded', 'expired', 'cancelled');
