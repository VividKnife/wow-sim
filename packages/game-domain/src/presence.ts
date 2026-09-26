import type {Transaction, ReadView} from '../../persistence/src/store.ts';
import type {Activity, Character, Instance} from './model.ts';
import {account, presence, bump} from './context.ts';
import type {GameService} from './service.ts';
import {invalidateCombatPlan} from './combat-execution.ts';

export const DEFAULT_OFFLINE_LIMIT_MS = 2 * 60 * 60 * 1000;
// Keep paused jobs out of the due index without releasing their actor leases.
export const PAUSED_EVENT_AT = Number.MAX_SAFE_INTEGER;

export function offlineLimit(value: unknown = DEFAULT_OFFLINE_LIMIT_MS): number {
    const duration = Number(value);
    if (!Number.isSafeInteger(duration) || duration <= 0)
        throw new Error('GAME_OFFLINE_LIMIT_MS must be a positive safe integer');
    return duration;
}

export async function activityDeadline(this: GameService, tx: ReadView, a: Activity) {
    const actor = (await tx.get<Character>('characters', a.actorId))!;
    if (a.type !== 'personal' && actor.kind === 'companion') return Infinity;
    return (await presence(tx, a.accountId)).lastSeenAt + this.offlineLimitMs;
}

export async function instanceDeadline(this: GameService, tx: ReadView, instance: Instance, observedPresence?: ReadonlyMap<string, number>) {
    const accounts = new Set(instance.roster.filter(r => r.controller !== 'npc').map(r => r.accountId));
    let deadline = Infinity;
    for (const id of accounts) deadline = Math.min(deadline, (observedPresence?.get(id) ?? (await presence(tx, id)).lastSeenAt) + this.offlineLimitMs);
    return deadline;
}

export async function recordPresence(this: GameService, tx: Transaction, accountId: string, now: number) {
    await account(tx, accountId);
    const a = await presence(tx, accountId);
    if (now <= a.lastSeenAt) return;
    const oldDeadline = a.lastSeenAt + this.offlineLimitMs;
    const instances: {instance: Instance; deadline: number}[] = [];
    if (now >= oldDeadline) {
        const leases = await tx.list<{ownerId: string}>('actor_leases', {accountId, kind: 'instance'});
        for (const id of new Set(leases.map(l => l.ownerId))) {
            const instance = (await tx.get<Instance>('instances', id))!;
            if (instance.status === 'running' && instance.simulation)
                instances.push({instance, deadline: await this.instanceDeadline(tx, instance)});
        }
    }
    const returning = now - a.lastSeenAt >= 5_000;
    a.lastSeenAt = now;
    await tx.put('account_presence', a);
    if (now < oldDeadline) {
        if (returning) {
            for (const activity of await tx.list<Activity>('activities', {accountId})) {
                if (activity.localSimulation || activity.type !== 'personal' || activity.status !== 'running' || activity.playback) continue;
                activity.nextEventAt = Math.min(activity.nextEventAt, now);
                await tx.put('activities', activity);
            }
            for (const lease of await tx.list<{ownerId: string}>('actor_leases', {accountId, kind: 'instance'})) {
                const instance = await tx.get<Instance>('instances', lease.ownerId);
                if (!instance || instance.localSimulation || instance.status !== 'running' || instance.playback) continue;
                instance.nextEventAt = Math.min(instance.nextEventAt, now);
                await tx.put('instances', instance);
            }
        }
        return;
    }

    // Move wall anchors only. Simulation timers and remaining travel/combat stay
    // unchanged, including allowed progress the worker has not processed yet.
    const skipped = now - oldDeadline;
    for (const activity of await tx.list<Activity>('activities', {accountId})) {
        if (activity.localSimulation) continue;
        if (!['running', 'returning'].includes(activity.status)) continue;
        const actor = (await tx.get<Character>('characters', activity.actorId))!;
        if (activity.type !== 'personal' && actor.kind === 'companion') continue;
        for (const id of activity.participantIds || [activity.actorId]) {
            const c = (await tx.get<Character>('characters', id))!;
            c.rules.wallAt += skipped;
            await tx.put('characters', c);
        }
        activity.settledUntil += skipped;
        await invalidateCombatPlan(tx, activity);
        activity.nextEventAt = (activity.resumeEventAt ?? activity.nextEventAt) + skipped;
        delete activity.resumeEventAt;
        await tx.put('activities', activity);
    }
    for (const {instance, deadline} of instances) {
        if (instance.localSimulation) continue;
        const newDeadline = await this.instanceDeadline(tx, instance);
        const resumedUntil = Math.min(now, newDeadline);
        const shift = Math.max(0, resumedUntil - deadline);
        if (!shift && newDeadline <= now) continue;
        instance.simulation!.wallAt += shift;
        await invalidateCombatPlan(tx, instance);
        instance.nextEventAt = (instance.resumeEventAt ?? instance.nextEventAt) + shift;
        delete instance.resumeEventAt;
        instance.sequence++;
        await tx.put('instances', instance);
        await this.bumpInstanceAccounts(tx, instance, accountId);
    }
    await bump(tx, accountId);
}

// Frequent liveness updates never touch the account revision or assets. Reconnects
// can move simulation clocks and therefore still use the critical transaction path.
export async function refreshPresence(this: GameService, accountId: string) {
    const now = this.now();
    if (await this.store.heartbeat(accountId, now, Math.min(1000, this.offlineLimitMs / 4), Math.min(5000, this.offlineLimitMs))) return;
    await this.store.transaction(tx => this.recordPresence(tx, accountId, now));
}
