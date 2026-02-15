-- Add photo_url column to channels for Telegram profile photos
ALTER TABLE channels ADD COLUMN IF NOT EXISTS photo_url TEXT;
