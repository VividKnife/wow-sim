import {MinHeap} from './min-heap.ts';

export const eventKinds = ['CastComplete', 'ChannelTick', 'AutoAttackReady', 'AuraPeriodic', 'AuraExpire',
  'GroundPulse', 'GroundExpire', 'ProjectileImpact', 'ResourceRegen', 'BotThink', 'EncounterEvent', 'MovementStep', 'ActivityComplete'] as const;
export type EventKind = typeof eventKinds[number];
/** References only. Rules resolve the referenced object in the owning instance. */
export type EventRequest = {
  atMs: number; phase: number; kind: EventKind;
  entitySlot: number; entityGeneration: number; subjectId: number; subjectVersion: number;
};
export type ScheduledEvent = Readonly<EventRequest & {sequence: number}>;
export type QueueSnapshot = {version: 2; nowMs: number; phase: number; nextSequence: number; failed: boolean; events: ScheduledEvent[]};
const compare = (a: ScheduledEvent, b: ScheduledEvent) => a.atMs - b.atMs || a.phase - b.phase || a.sequence - b.sequence;
export function integer(value: number, name: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum) throw new RangeError(`Invalid ${name}`);
}
function validate(event: EventRequest) {
  for (const key of ['atMs', 'phase', 'entitySlot', 'entityGeneration', 'subjectId', 'subjectVersion'] as const) integer(event[key], key);
  if (!eventKinds.includes(event.kind)) throw new Error('Invalid event kind');
}
function validateSnapshot(snapshot: QueueSnapshot, capacity: number) {
  if (snapshot.version !== 2 || snapshot.failed !== false || !Array.isArray(snapshot.events) || snapshot.events.length > capacity) throw new Error('Invalid or quarantined queue snapshot');
  integer(snapshot.nowMs, 'nowMs'); integer(snapshot.phase, 'phase'); integer(snapshot.nextSequence, 'nextSequence');
  const sequences = new Set<number>();
  for (const event of snapshot.events) {
    validate(event); integer(event.sequence, 'sequence');
    if (event.atMs < snapshot.nowMs || event.atMs === snapshot.nowMs && event.phase < snapshot.phase ||
      event.sequence >= snapshot.nextSequence || sequences.has(event.sequence)) throw new Error('Invalid event cursor');
    sequences.add(event.sequence);
  }
}

/** Exclusive plain storage stays current as the heap mutates. It may be embedded
 * in an instance so ordinary boundary cloning captures the exact cursor, without
 * serializing the entire queue during dispatch. No closures enter durable state. */
export class EventQueue {
  private storage: QueueSnapshot;
  private heap: MinHeap<ScheduledEvent>;
  readonly capacity: number;
  constructor(capacity = 100_000) {
    integer(capacity, 'capacity', 1); this.capacity = capacity;
    this.storage = {version: 2, nowMs: 0, phase: 0, nextSequence: 0, failed: false, events: []};
    this.heap = new MinHeap(compare, this.storage.events, true, event => event.sequence);
  }
  get nowMs() { return this.storage.nowMs; }
  get size() { return this.heap.size; }
  get nextAt() { return this.heap.peek()?.atMs ?? null; }
  /** Attach only to the owning instance. Callers must not edit this storage. */
  ownedState(): QueueSnapshot { this.healthy(); return this.storage; }
  private healthy() { if (this.storage.failed) throw new Error('Queue is quarantined'); }
  schedule(request: EventRequest): ScheduledEvent {
    this.healthy(); validate(request);
    if (request.atMs < this.nowMs || request.atMs === this.nowMs && request.phase < this.storage.phase) throw new Error('Cannot insert into a completed phase');
    if (this.heap.size >= this.capacity) throw new Error('Event queue capacity exceeded');
    if (this.storage.nextSequence >= Number.MAX_SAFE_INTEGER) throw new Error('Event sequence exhausted');
    const event = Object.freeze({atMs: request.atMs, phase: request.phase, kind: request.kind,
      entitySlot: request.entitySlot, entityGeneration: request.entityGeneration,
      subjectId: request.subjectId, subjectVersion: request.subjectVersion, sequence: this.storage.nextSequence++});
    this.heap.push(event); return event;
  }
  cancel(sequence: number): boolean {
    this.healthy(); integer(sequence, 'sequence'); return this.heap.remove(sequence) !== undefined;
  }
  advance(untilMs: number, maxEvents: number, valid: (event: ScheduledEvent) => boolean, handle: (event: ScheduledEvent) => void) {
    return this.drain(untilMs, maxEvents, valid, handle);
  }
  /** Finish only this time's requested phase; later phases stay queued. */
  advancePhase(untilMs: number, phase: number, maxEvents: number, valid: (event: ScheduledEvent) => boolean, handle: (event: ScheduledEvent) => void) {
    integer(phase, 'phase');
    if (untilMs === this.nowMs && phase < this.storage.phase) throw new Error('Cannot rewind a completed phase');
    return this.drain(untilMs, maxEvents, valid, handle, phase);
  }
  private drain(untilMs: number, maxEvents: number, valid: (event: ScheduledEvent) => boolean, handle: (event: ScheduledEvent) => void, phase?: number) {
    integer(untilMs, 'untilMs', this.nowMs); integer(maxEvents, 'maxEvents', 1); this.healthy();
    const due = () => { const e=this.heap.peek(); return !!e && (e.atMs < untilMs || e.atMs === untilMs && (phase === undefined || e.phase <= phase)); };
    let processed = 0, invalid = 0;
    try {
      while (due() && processed + invalid < maxEvents) {
        const event = this.heap.pop()!;
        this.storage.nowMs = event.atMs; this.storage.phase = event.phase;
        const live = valid(event);
        if (typeof live !== 'boolean') throw new Error('Event validation must be synchronous');
        if (live) {
          const result: unknown = handle(event);
          if (result && typeof (result as {then?: unknown}).then === 'function') throw new Error('Event handler must be synchronous');
          processed++;
        } else invalid++;
      }
    } catch (error) { this.storage.failed = true; throw error; }
    const complete = !due();
    if (complete) {
      if (phase !== undefined) { this.storage.nowMs = untilMs; this.storage.phase = phase; }
      else if (untilMs > this.nowMs) { this.storage.nowMs = untilMs; this.storage.phase = 0; }
    }
    return {complete, processed, invalid, nowMs: this.nowMs, queued: this.size};
  }
  checkpoint(): QueueSnapshot {
    this.healthy(); return {...this.storage, events: this.heap.snapshot().sort(compare).map(event => ({...event}))};
  }
  /** Boundary adoption after JSON/structuredClone. Validate once, then share the
   * exclusively owned heap array; no per-event snapshots or validation scans. */
  static own(snapshot: QueueSnapshot, capacity = 100_000) {
    const queue = new EventQueue(capacity); validateSnapshot(snapshot, capacity);
    queue.storage = snapshot; queue.heap = new MinHeap(compare, snapshot.events, true, event => event.sequence); return queue;
  }
  static restore(snapshot: QueueSnapshot, capacity = 100_000) {
    validateSnapshot(snapshot, capacity);
    return EventQueue.own({...snapshot, events: snapshot.events.map(event => Object.freeze({...event}))}, capacity);
  }
}
