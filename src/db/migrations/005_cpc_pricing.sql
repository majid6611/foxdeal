-- Migration 005: Cost-per-click pricing model

-- Channel owners set a per-click price alongside their time-based price
ALTER TABLE channels ADD COLUMN IF NOT EXISTS cpc_price INTEGER NOT NULL DEFAULT 0;

-- Deals track which pricing model was chosen and CPC-specific fields
ALTER TABLE deals ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(10) NOT NULL DEFAULT 'time';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS budget INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS budget_spent INTEGER NOT NULL DEFAULT 0;

-- Add check constraint for pricing_model
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_pricing_model_check;
ALTER TABLE deals ADD CONSTRAINT deals_pricing_model_check
  CHECK (pricing_model IN ('time', 'cpc'));
