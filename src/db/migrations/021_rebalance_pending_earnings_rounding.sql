-- Migration 021: Rebalance pending owner earnings with floor-on-fee policy
-- Previous logic rounded owner net down, which could make tiny deals (e.g. 1 TON)
-- show 0 owner earning and 100% platform fee.

UPDATE owner_earnings
SET
  platform_fee = FLOOR(gross_amount * 0.05)::int,
  net_amount = gross_amount - FLOOR(gross_amount * 0.05)::int
WHERE status = 'pending';
