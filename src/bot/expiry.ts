import { pool } from '../db/index.js';
import { getExpiredApprovedDeals, getExpiredPendingDeals } from '../db/queries.js';
import { transitionDeal } from '../escrow/transitions.js';
import { env } from '../config/env.js';
import { notifyUser } from './jobs.js';
import type { Deal } from '../shared/types.js';

/**
 * Check for and expire stale deals:
 * - approved deals older than PAYMENT_TIMEOUT_HOURS → expired
 * - pending_approval deals older than APPROVAL_TIMEOUT_HOURS → expired
 */
async function checkExpiredDeals(): Promise<void> {
  // Expire approved deals (advertiser didn't pay in time)
  const expiredApproved = await getExpiredApprovedDeals(env.PAYMENT_TIMEOUT_HOURS);
  for (const deal of expiredApproved) {
    try {
      await transitionDeal(deal.id, 'approved', 'expired');
      console.log(`[expiry] Deal ${deal.id} expired (approved, no payment after ${env.PAYMENT_TIMEOUT_HOURS}h)`);
      await notifyUser(deal.advertiser_id, `Your deal #${deal.id} expired because payment was not received within ${env.PAYMENT_TIMEOUT_HOURS} hours.`);
    } catch (err) {
      console.error(`[expiry] Failed to expire deal ${deal.id}:`, (err as Error).message);
    }
  }

  // Expire pending_approval deals (owner didn't respond in time)
  const expiredPending = await getExpiredPendingDeals(env.APPROVAL_TIMEOUT_HOURS);
  for (const deal of expiredPending) {
    try {
      // pending_approval → expired is not in our valid transitions, so add it
      // Actually, per the PRD, pending_approval can only go to approved|rejected
      // We need to auto-reject these instead
      await transitionDeal(deal.id, 'pending_approval', 'rejected', {
        rejection_reason: `Auto-rejected: owner did not respond within ${env.APPROVAL_TIMEOUT_HOURS} hours`,
      });
      console.log(`[expiry] Deal ${deal.id} auto-rejected (pending_approval, no response after ${env.APPROVAL_TIMEOUT_HOURS}h)`);
      await notifyUser(deal.advertiser_id, `Your deal #${deal.id} was auto-rejected because the channel owner did not respond within ${env.APPROVAL_TIMEOUT_HOURS} hours.`);
    } catch (err) {
      console.error(`[expiry] Failed to auto-reject deal ${deal.id}:`, (err as Error).message);
    }
  }
}

/**
 * Start a periodic job that checks for expired deals.
 * Runs every 5 minutes.
 */
export function startExpiryJob(): void {
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  // Run once immediately
  checkExpiredDeals().catch((err) =>
    console.error('[expiry] Initial check failed:', err),
  );

  // Then repeat
  setInterval(() => {
    checkExpiredDeals().catch((err) =>
      console.error('[expiry] Periodic check failed:', err),
    );
  }, INTERVAL_MS);

  console.log('[expiry] Expiry job started (checking every 5 minutes)');
}
