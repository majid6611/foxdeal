-- Migration 010: Add pending_admin status to deals
-- Deals now start as 'pending_admin' and must be approved by admin before reaching channel owner.

-- Drop and recreate the status check constraint to include 'pending_admin'
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_status_check;
ALTER TABLE deals ADD CONSTRAINT deals_status_check
  CHECK (status IN (
    'created', 'pending_admin', 'pending_approval', 'approved', 'rejected',
    'escrow_held', 'posted', 'verified', 'completed',
    'disputed', 'refunded', 'expired', 'cancelled'
  ));

-- Update partial unique index to also exclude pending_admin from blocking new deals
DROP INDEX IF EXISTS idx_deals_active_unique;
CREATE UNIQUE INDEX idx_deals_active_unique
  ON deals (advertiser_id, channel_id)
  WHERE status NOT IN ('completed', 'rejected', 'refunded', 'expired', 'cancelled');
