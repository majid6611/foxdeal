import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition } from './index.js';

describe('Deal State Machine', () => {
  describe('canTransition', () => {
    // Valid transitions
    const validTransitions: [string, string][] = [
      ['created', 'pending_approval'],
      ['pending_approval', 'approved'],
      ['pending_approval', 'rejected'],
      ['approved', 'escrow_held'],
      ['approved', 'expired'],
      ['escrow_held', 'posted'],
      ['escrow_held', 'refunded'],
      ['posted', 'verified'],
      ['posted', 'disputed'],
      ['verified', 'completed'],
      ['disputed', 'refunded'],
    ];

    it.each(validTransitions)(
      'should allow %s → %s',
      (from, to) => {
        expect(canTransition(from as any, to as any)).toBe(true);
      },
    );

    // Invalid transitions
    const invalidTransitions: [string, string][] = [
      ['created', 'approved'],
      ['created', 'completed'],
      ['pending_approval', 'posted'],
      ['approved', 'completed'],
      ['escrow_held', 'completed'],
      ['posted', 'completed'],
      ['completed', 'refunded'],
      ['rejected', 'approved'],
      ['refunded', 'completed'],
      ['expired', 'approved'],
      // Backward transitions
      ['approved', 'created'],
      ['posted', 'escrow_held'],
      ['completed', 'posted'],
    ];

    it.each(invalidTransitions)(
      'should reject %s → %s',
      (from, to) => {
        expect(canTransition(from as any, to as any)).toBe(false);
      },
    );
  });

  describe('assertTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => assertTransition('created', 'pending_approval')).not.toThrow();
      expect(() => assertTransition('posted', 'verified')).not.toThrow();
    });

    it('should throw for invalid transitions', () => {
      expect(() => assertTransition('created', 'completed')).toThrow(
        'Invalid deal transition: created → completed',
      );
      expect(() => assertTransition('completed', 'refunded')).toThrow(
        'Invalid deal transition: completed → refunded',
      );
    });
  });

  describe('Terminal states', () => {
    const terminalStates = ['completed', 'rejected', 'refunded', 'expired'];

    it.each(terminalStates)(
      '%s should have no valid outgoing transitions',
      (state) => {
        const allStates = [
          'created', 'pending_approval', 'approved', 'rejected',
          'escrow_held', 'posted', 'verified', 'completed',
          'disputed', 'refunded', 'expired',
        ];
        for (const target of allStates) {
          expect(canTransition(state as any, target as any)).toBe(false);
        }
      },
    );
  });

  describe('Full deal lifecycle paths', () => {
    it('happy path: created → ... → completed', () => {
      const happyPath = [
        'created', 'pending_approval', 'approved',
        'escrow_held', 'posted', 'verified', 'completed',
      ];
      for (let i = 0; i < happyPath.length - 1; i++) {
        expect(canTransition(happyPath[i] as any, happyPath[i + 1] as any)).toBe(true);
      }
    });

    it('rejection path: created → pending_approval → rejected', () => {
      expect(canTransition('created', 'pending_approval')).toBe(true);
      expect(canTransition('pending_approval', 'rejected')).toBe(true);
    });

    it('refund path (post failure): escrow_held → refunded', () => {
      expect(canTransition('escrow_held', 'refunded')).toBe(true);
    });

    it('dispute path: posted → disputed → refunded', () => {
      expect(canTransition('posted', 'disputed')).toBe(true);
      expect(canTransition('disputed', 'refunded')).toBe(true);
    });

    it('expiry path: approved → expired', () => {
      expect(canTransition('approved', 'expired')).toBe(true);
    });
  });
});
