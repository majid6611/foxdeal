-- Migration 024 (test): Set earnings hold period to 0 days (immediate payout eligibility)

ALTER TABLE owner_earnings
  ALTER COLUMN payout_at SET DEFAULT NOW();

UPDATE owner_earnings
SET payout_at = NOW()
WHERE status = 'pending';
