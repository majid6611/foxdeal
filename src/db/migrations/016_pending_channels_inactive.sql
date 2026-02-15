-- Migration 016: Pending channels must not be active until admin approval
UPDATE channels
SET is_active = FALSE
WHERE approval_status = 'pending';
