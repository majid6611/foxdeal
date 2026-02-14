-- Migration 004: Add ad link and click tracking to deals

ALTER TABLE deals ADD COLUMN IF NOT EXISTS ad_link TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0;
