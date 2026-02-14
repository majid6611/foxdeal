-- Migration 009: Channel approval by admins
-- New channels start as 'pending' and must be approved before appearing in catalog.

ALTER TABLE channels ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved';

-- Add check constraint
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_approval_status_check;
ALTER TABLE channels ADD CONSTRAINT channels_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Existing channels are already 'approved' (default), so no backfill needed.
-- New channels will be created with 'pending' status (set by application code).
