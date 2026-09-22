import {advance} from './rules/engine.js';
import {battlePresentation} from './rules/battle-presentation.js';
import {projectCombatPlayback} from './rules/client-snapshot.ts';
import {diffProjectedState} from '../../contracts/src/events.ts';
import type {PlaybackFrame} from '../../contracts/src/combat-playback.ts';
import type {Rules, PlaybackManifest} from './model.ts';

// One bounded recording per owner. Long fights continue in another segment.
export const PLAYBACK_SEGMENT_MS = 60_000;
// Keep offline catch-up small enough that one stale, large party cannot monopolize
// the single worker loop and delay unrelated travel/activity confirmations.
// The worker will immediately pick still-overdue owners up again on its next pass.
export const OFFLINE_BATCH_TICKS = 20;
export const OFFLINE_BATCH_INTERVAL_MS = 30_000;
export type CombatRecording = PlaybackManifest & {
    contentVersion: string;
    initial: Rules;
    frames: PlaybackFrame[];
};
export type CombatPlan = {
    id: string;
    accountId: string;
    generation: number;
    finalState: Rules;
    recording: CombatRecording;
};

// Playback contains display state only. Inventory, rewards, RNG and future
// authoritative checkpoints must never be supplied by a browser.
export function playbackProjection(state: Rules, wallAt = state.wallAt) {
    return projectCombatPlayback(state,battlePresentation(state),wallAt);
}
const withoutLogs=(projection:Rules)=>({...projection,player:{...projection.player,logs:[]}});

export function simulateCombatRecording(state: Rules, options: {
    id: string; contentVersion: string; until?: number; maxTicks?: number;
}) {
    if (!state.combat) throw new Error('Recording requires an active combat');
    const encounterId = state.combat.id;
    const until = Math.min(state.wallAt + PLAYBACK_SEGMENT_MS, options.until ?? Infinity);
    if (!Number.isSafeInteger(until) || until <= state.wallAt) throw new Error('Invalid recording deadline');
    const initial = playbackProjection(state);
    const frames: PlaybackFrame[] = [];
    let previous = withoutLogs(initial), lastClock = state.clock, lastLog = state.logSequence;
    const record = (next: Rules, wallAt: number) => {
        if (next.clock === lastClock) return;
        const projected = withoutLogs(playbackProjection(next, wallAt));
        const events=next.logs.filter((event:Rules)=>event.id>lastLog);
        frames.push({clock: next.clock, operations: diffProjectedState(previous, projected),...(events.length?{events:structuredClone(events),firstLogId:next.logs[0]?.id??0}:{})});
        lastLog=next.logSequence;
        previous = projected;
        lastClock = next.clock;
    };
    const result = advance(state, until, {
        maxTicks: options.maxTicks ?? 600, idleFastForward: false,
        onStep: (next: Rules, wallAt: number) => {
            // 10 Hz simulation frames; the existing renderer interpolates at 60 Hz.
            if (next.clock - lastClock >= 100 || next.combat?.id !== encounterId) record(next, wallAt);
        },
        stopWhen: (next: Rules) => next.combat?.id !== encounterId,
    });
    record(result.state, result.state.wallAt);
    const recording: CombatRecording = {
        id: options.id, contentVersion: options.contentVersion, encounterId,
        startsAt: state.wallAt, endsAt: result.state.wallAt,
        startClock: state.clock, endClock: result.state.clock, initial, frames,
    };
    return {recording, finalState: result.state};
}

export function playbackManifest(recording: CombatRecording): PlaybackManifest {
    const {id, encounterId, startsAt, endsAt, startClock, endClock} = recording;
    return {id, encounterId, startsAt, endsAt, startClock, endClock};
}
