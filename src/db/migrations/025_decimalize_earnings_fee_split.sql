-- Migration 025: Store owner earnings and withdraw amounts as decimals
-- Ensures exact 95/5 split even for small deals (e.g. 1 TON -> 0.95 / 0.05)

ALTER TABLE owner_earnings
  ALTER COLUMN gross_amount TYPE NUMERIC(20,4) USING gross_amount::numeric(20,4),
  ALTER COLUMN platform_fee TYPE NUMERIC(20,4) USING platform_fee::numeric(20,4),
  ALTER COLUMN net_amount TYPE NUMERIC(20,4) USING net_amount::numeric(20,4);

ALTER TABLE withdraw_requests
  ALTER COLUMN amount TYPE NUMERIC(20,4) USING amount::numeric(20,4);

UPDATE owner_earnings
SET
  platform_fee = ROUND(gross_amount * 0.05, 4),
  net_amount = ROUND(gross_amount - ROUND(gross_amount * 0.05, 4), 4);

UPDATE withdraw_requests wr
SET amount = sub.total_amount
FROM (
  SELECT
    withdraw_request_id,
    ROUND(COALESCE(SUM(net_amount), 0), 4) AS total_amount
  FROM owner_earnings
  WHERE withdraw_request_id IS NOT NULL
  GROUP BY withdraw_request_id
) sub
WHERE wr.id = sub.withdraw_request_id;
