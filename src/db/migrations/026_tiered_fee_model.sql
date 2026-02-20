-- Migration 026: Apply tiered platform fee model to existing earnings

UPDATE owner_earnings
SET
  platform_fee = ROUND(
    gross_amount
    * (
      CASE
        WHEN gross_amount = 5 THEN 0.15
        WHEN gross_amount > 5 AND gross_amount < 10 THEN 0.10
        WHEN gross_amount >= 10 AND gross_amount < 25 THEN 0.07
        WHEN gross_amount >= 25 AND gross_amount < 100 THEN 0.05
        WHEN gross_amount >= 100 AND gross_amount < 300 THEN 0.04
        WHEN gross_amount >= 300 THEN 0.03
        ELSE 0.15
      END
    ),
    4
  ),
  net_amount = ROUND(
    gross_amount - ROUND(
      gross_amount
      * (
        CASE
          WHEN gross_amount = 5 THEN 0.15
          WHEN gross_amount > 5 AND gross_amount < 10 THEN 0.10
          WHEN gross_amount >= 10 AND gross_amount < 25 THEN 0.07
          WHEN gross_amount >= 25 AND gross_amount < 100 THEN 0.05
          WHEN gross_amount >= 100 AND gross_amount < 300 THEN 0.04
          WHEN gross_amount >= 300 THEN 0.03
          ELSE 0.15
        END
      ),
      4
    ),
    4
  );

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
