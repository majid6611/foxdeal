-- Add customizable button text for inline ad buttons
ALTER TABLE deals ADD COLUMN IF NOT EXISTS button_text VARCHAR(32) DEFAULT '🔗 Learn More';
