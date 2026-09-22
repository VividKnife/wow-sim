import {isDeepStrictEqual} from 'node:util';
import type {ReadView, Transaction} from '../../persistence/src/store.ts';
import type {GameService} from './service.ts';
import {account, presence, owned} from './context.ts';
import {requireThat, type Activity, type Instance, type ActorLease, type Rules} from './model.ts';
import {simulateCombatRecording, playbackManifest, type CombatPlan} from './combat-playback.ts';

export function combatExecutionMode(owner: Activity | Instance, state: Rules): 'realtime' | 'recorded' | 'local' {
    if (owner.localSimulation) return 'local';
    // Content may declare manual control before an encounter starts. A browser
    // cannot change this flag through a command.
    if (state.combat?.requiresManualControl) return 'realtime';
    if ('roster' in owner && new Set(owner.roster.filter(row => row.controller !== 'mercenary').map(row => row.accountId)).size > 1) return 'realtime';
    return 'recorded';
}

export async function invalidateCombatPlan(tx: Transaction, owner: Activity | Instance) {
    if (owner.playback) await tx.delete('combat_plans', owner.id);
    delete owner.playback;
    owner.simulationVersion = (owner.simulationVersion ?? 0) + 1;
}

export async function readCombatPlan(tx: ReadView, owner: Activity | Instance, now: number, contentVersion: string): Promise<Rules | null> {
    if (!owner.playback || owner.playback.endsAt > now) return null;
    const plan = await tx.get<CombatPlan>('combat_plans', owner.id);
    requireThat(plan && plan.generation === owner.simulationVersion && plan.recording.id === owner.playback.id && plan.recording.contentVersion === contentVersion, 'COMBAT_PLAN', '战斗模拟记录已失效');
    requireThat(plan.finalState.wallAt === owner.playback.endsAt, 'COMBAT_PLAN', '战斗结算时间无效');
    return plan.finalState;
}
export async function consumeCombatPlan(tx: Transaction, owner: Activity | Instance, now: number, contentVersion: string): Promise<Rules | null> {
    const state = await readCombatPlan(tx, owner, now, contentVersion);
    if (state) await invalidateCombatPlan(tx, owner);
    return state;
}

/** Read a checkpoint, compute without an open transaction, then fence its commit.
 * A concurrent command/worker invalidates the generation; its future is discarded.
 */
export async function prepareCombatPlan(this: GameService, table: 'activities' | 'instances', id: string, now: number) {
    const input = await this.store.read(async tx => {
        const owner = await tx.get<Activity | Instance>(table, id);
        if (!owner || owner.localSimulation || owner.status !== 'running' || owner.playback || owner.contentVersion !== this.contentVersion) return null;
        if ('type' in owner && owner.type !== 'personal') return null;
        const accountId = 'roster' in owner ? owner.creatorAccountId : owner.accountId;
        const observed = await presence(tx, accountId);
        if (now - observed.lastSeenAt >= 5_000) return null;
        const state = 'roster' in owner ? owner.simulation : await this.personalContext(tx, await owned(tx, accountId, owner.actorId), now);
        if (!state?.combat || combatExecutionMode(owner, state) !== 'recorded' || state.wallAt < now - 1_000) return null;
        const deadline = 'roster' in owner ? await this.instanceDeadline(tx, owner) : await this.activityDeadline(tx, owner);
        if (deadline <= state.wallAt) return null;
        const owners = [];
        for (const id of new Set('roster' in owner ? owner.roster.filter(r => r.controller !== 'mercenary').map(r => r.accountId) : [accountId]))
            owners.push(await account(tx,id));
        return {owner, state, deadline, accountId, owners};
    });
    if (!input) return;
    const computed = simulateCombatRecording(input.state, {id: this.id(), contentVersion: this.contentVersion, until: input.deadline});
    await this.store.transaction(async tx => {
        const owner = await tx.get<Activity | Instance>(table, id);
        if (!owner || !isDeepStrictEqual(owner,input.owner)) return;
        for (const expected of input.owners)
            if (!isDeepStrictEqual(await tx.get('accounts',expected.id),expected)) return;
        // Presence can shorten an instance deadline when membership changes.
        const deadline = 'roster' in owner ? await this.instanceDeadline(tx, owner) : await this.activityDeadline(tx, owner);
        if (computed.recording.endsAt > deadline) return;
        owner.simulationVersion ??= 0;
        await tx.put('combat_plans', {id, accountId: input.accountId, generation: owner.simulationVersion, ...computed});
        owner.playback = playbackManifest(computed.recording);
        owner.nextEventAt = owner.playback.endsAt;
        await tx.put(table, owner);
        if ('roster' in owner) await this.bumpInstanceAccounts(tx, owner);
        else { const a = await account(tx, owner.accountId); a.revision++; await tx.put('accounts', a); }
    }, {attempts:1});
}

export async function combatRecording(this: GameService, accountId: string, characterId: string | undefined, recordingId: string) {
    const result = await this.store.read(async tx => {
        const a = await account(tx, accountId), c = await owned(tx, accountId, characterId || a.primaryCharacterId);
        const lease = await tx.get<ActorLease>('actor_leases', c.id);
        requireThat(lease, 'REPLAY_EXPIRED', '战斗回放已更新，请重新同步');
        const owner = await tx.get<Activity | Instance>(lease.kind === 'instance' ? 'instances' : 'activities', lease.ownerId);
        requireThat(owner?.playback?.id === recordingId, 'REPLAY_EXPIRED', '战斗回放已更新，请重新同步');
        const plan = await tx.get<CombatPlan>('combat_plans', owner.id);
        requireThat(plan && plan.generation === owner.simulationVersion && plan.recording.id === recordingId && plan.recording.contentVersion === this.contentVersion, 'REPLAY_EXPIRED', '战斗回放已更新，请重新同步');
        return plan.recording;
    });
    return {...result, serverNow: this.now()};
}
