-- Migration 022: Reduce owner earnings hold period from 30 days to 3 days

ALTER TABLE owner_earnings
  ALTER COLUMN payout_at SET DEFAULT (NOW() + INTERVAL '3 days');

UPDATE owner_earnings
SET payout_at = earned_at + INTERVAL '3 days'
WHERE status = 'pending';
