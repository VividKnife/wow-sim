import type {Transaction} from '../../persistence/src/store.ts';
import type {Activity, Character, Instance} from './model.ts';
import {account, bump} from './context.ts';
import type {GameService} from './service.ts';

export const DEFAULT_OFFLINE_LIMIT_MS = 2 * 60 * 60 * 1000;
// Keep paused jobs out of the due index without releasing their actor leases.
export const PAUSED_EVENT_AT = Number.MAX_SAFE_INTEGER;

export function offlineLimit(value: unknown = DEFAULT_OFFLINE_LIMIT_MS): number {
    const duration = Number(value);
    if (!Number.isSafeInteger(duration) || duration <= 0)
        throw new Error('GAME_OFFLINE_LIMIT_MS must be a positive safe integer');
    return duration;
}

export async function activityDeadline(this: GameService, tx: Transaction, a: Activity) {
    const actor = (await tx.get<Character>('characters', a.actorId))!;
    if (a.type !== 'personal' && actor.kind === 'companion') return Infinity;
    return (await account(tx, a.accountId)).lastSeenAt + this.offlineLimitMs;
}

export async function instanceDeadline(this: GameService, tx: Transaction, instance: Instance) {
    const accounts = new Set(instance.roster.filter(r => r.controller !== 'mercenary').map(r => r.accountId));
    let deadline = Infinity;
    for (const id of accounts) deadline = Math.min(deadline, (await account(tx, id)).lastSeenAt + this.offlineLimitMs);
    return deadline;
}

export async function recordPresence(this: GameService, tx: Transaction, accountId: string, now: number) {
    const a = await account(tx, accountId);
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
    a.lastSeenAt = now;
    await tx.put('accounts', a);
    if (now < oldDeadline) return;

    // Move wall anchors only. Simulation timers and remaining travel/combat stay
    // unchanged, including allowed progress the worker has not processed yet.
    const skipped = now - oldDeadline;
    for (const activity of await tx.list<Activity>('activities', {accountId})) {
        if (!['running', 'returning'].includes(activity.status)) continue;
        const actor = (await tx.get<Character>('characters', activity.actorId))!;
        if (activity.type !== 'personal' && actor.kind === 'companion') continue;
        for (const id of activity.participantIds || [activity.actorId]) {
            const c = (await tx.get<Character>('characters', id))!;
            c.rules.wallAt += skipped;
            await tx.put('characters', c);
        }
        activity.settledUntil += skipped;
        activity.nextEventAt = (activity.resumeEventAt ?? activity.nextEventAt) + skipped;
        delete activity.resumeEventAt;
        await tx.put('activities', activity);
    }
    for (const {instance, deadline} of instances) {
        const newDeadline = await this.instanceDeadline(tx, instance);
        const resumedUntil = Math.min(now, newDeadline);
        const shift = Math.max(0, resumedUntil - deadline);
        if (!shift && newDeadline <= now) continue;
        instance.simulation!.wallAt += shift;
        instance.nextEventAt = (instance.resumeEventAt ?? instance.nextEventAt) + shift;
        delete instance.resumeEventAt;
        instance.sequence++;
        await tx.put('instances', instance);
        await this.bumpInstanceAccounts(tx, instance, accountId);
    }
    await bump(tx, accountId);
}
