-- Migration 015: Store average post view count per channel
ALTER TABLE channels
ADD COLUMN IF NOT EXISTS avg_post_views INTEGER;
