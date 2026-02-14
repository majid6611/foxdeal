-- Migration 006: Support fractional CPC pricing
-- cpc_price can be e.g. 0.5 Stars/click
-- budget_spent tracks fractional spending (budget itself stays integer)

ALTER TABLE channels ALTER COLUMN cpc_price TYPE NUMERIC(10,2) USING cpc_price::NUMERIC(10,2);
ALTER TABLE channels ALTER COLUMN cpc_price SET DEFAULT 0;

ALTER TABLE deals ALTER COLUMN budget_spent TYPE NUMERIC(10,2) USING budget_spent::NUMERIC(10,2);
ALTER TABLE deals ALTER COLUMN budget_spent SET DEFAULT 0;
