-- Migration 017: Store most-used language per channel (best-effort from public stats)
ALTER TABLE channels
ADD COLUMN IF NOT EXISTS most_used_language VARCHAR(16);
