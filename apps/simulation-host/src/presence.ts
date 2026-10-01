import {integer} from '../../../packages/combat-core/scheduling/event-queue.ts';

export type PresenceState = {offlineLimitMs: number; accounts: [string, number][]};

/** Durable activity time allowance. Wall time is supplied by the owner; this
 * component neither reads a clock nor advances combat or consumes RNG. */
export class PresenceClock {
  private readonly seen: Map<string, number>;
  readonly offlineLimitMs: number;
  constructor(state: PresenceState, accounts: string[]) {
    integer(state.offlineLimitMs, 'offlineLimitMs', 1);
    this.offlineLimitMs = state.offlineLimitMs;
    const expected = new Set(accounts);
    if (!expected.size || !Array.isArray(state.accounts) || state.accounts.length !== expected.size) throw new Error('Invalid presence accounts');
    this.seen = new Map();
    for (const [accountId, at] of state.accounts) {
      if (!expected.has(accountId) || this.seen.has(accountId)) throw new Error('Invalid presence account');
      this.validateTime(at); this.seen.set(accountId, at);
    }
  }
  get deadline() { return Math.min(...this.seen.values()) + this.offlineLimitMs; }
  record(accountId: string, at: number) {
    this.validateTime(at);
    const previous = this.seen.get(accountId);
    if (previous === undefined) throw new Error('Presence access denied');
    const before = this.deadline;
    this.seen.set(accountId, Math.max(previous, at));
    // Shift only the interval outside the old allowance. Any unprocessed
    // allowed time remains payable to the same deterministic rule kernel.
    return Math.max(0, Math.min(at, this.deadline) - before);
  }
  snapshot(): PresenceState { return {offlineLimitMs: this.offlineLimitMs, accounts: [...this.seen]}; }
  private validateTime(at: number) {
    integer(at, 'presence time');
    integer(at + this.offlineLimitMs, 'presence deadline');
  }
}
