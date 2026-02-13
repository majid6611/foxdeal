import type { DealStatus } from '../shared/types.js';

// Valid state transitions — enforced here and nowhere else
const VALID_TRANSITIONS: Record<DealStatus, DealStatus[]> = {
  created: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['escrow_held', 'expired', 'cancelled'],
  rejected: [],
  escrow_held: ['posted', 'refunded'],
  posted: ['verified', 'disputed'],
  verified: ['completed'],
  completed: [],
  disputed: ['refunded'],
  refunded: [],
  expired: [],
  cancelled: [],
};

export function canTransition(from: DealStatus, to: DealStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: DealStatus, to: DealStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid deal transition: ${from} → ${to}`);
  }
}
