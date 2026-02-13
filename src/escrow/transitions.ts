import { assertTransition } from './index.js';
import { updateDealStatus, createTransaction } from '../db/queries.js';
import type { Deal, DealStatus } from '../shared/types.js';

/**
 * Transition a deal to a new status.
 * All deal state changes MUST go through this function.
 * Uses DB-level locking (WHERE status = currentStatus) to prevent race conditions.
 */
export async function transitionDeal(
  dealId: number,
  fromStatus: DealStatus,
  toStatus: DealStatus,
  extra?: Partial<Pick<Deal, 'posted_message_id' | 'posted_at' | 'verified_at' | 'paid_at' | 'completed_at' | 'rejection_reason'>>,
): Promise<Deal> {
  // Validate transition is allowed
  assertTransition(fromStatus, toStatus);

  // Attempt atomic update (WHERE status = fromStatus acts as optimistic lock)
  const updated = await updateDealStatus(dealId, fromStatus, toStatus, extra);

  if (!updated) {
    throw new Error(
      `Deal ${dealId} transition failed: expected status '${fromStatus}' but deal was already changed (race condition or invalid state)`,
    );
  }

  return updated;
}

/**
 * Hold payment in escrow: approved → escrow_held
 */
export async function holdEscrow(dealId: number, amount: number): Promise<Deal> {
  const deal = await transitionDeal(dealId, 'approved', 'escrow_held', {
    paid_at: new Date(),
  });
  await createTransaction(dealId, 'hold', amount);
  return deal;
}

/**
 * Release payment to owner: verified → completed
 */
export async function releaseEscrow(dealId: number, amount: number): Promise<Deal> {
  const deal = await transitionDeal(dealId, 'verified', 'completed', {
    completed_at: new Date(),
  });
  await createTransaction(dealId, 'release', amount);
  return deal;
}

/**
 * Refund payment to advertiser
 */
export async function refundEscrow(
  dealId: number,
  fromStatus: 'escrow_held' | 'disputed',
  amount: number,
): Promise<Deal> {
  const deal = await transitionDeal(dealId, fromStatus, 'refunded');
  await createTransaction(dealId, 'refund', amount);
  return deal;
}
