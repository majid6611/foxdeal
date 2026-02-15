-- Store TON wallet address for channel owners (for payouts)
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;
