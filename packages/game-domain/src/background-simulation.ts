import {isDeepStrictEqual} from 'node:util';
import {DatabaseBusyError} from '../../persistence/src/store.ts';
import type {GameService} from './service.ts';
import type {Activity, Instance, InstanceLease, Rules} from './model.ts';
import {requireThat} from './model.ts';
import {account, owned, presence} from './context.ts';
import {advance} from './rules/engine.js';
import {readCombatPlan, combatExecutionMode} from './combat-execution.ts';
import {OFFLINE_BATCH_TICKS, OFFLINE_BATCH_INTERVAL_MS} from './combat-playback.ts';
import {simulationInterval, simulationTickBudget} from './simulation-cadence.ts';

// Simulation is speculative: a command or another worker may win while CPU work
// runs with no database connection. Only the short, fenced settlement is critical.
export async function advancePersonal(this: GameService, id: string, now: number): Promise<boolean> {
    const input = await this.store.read(async tx => {
        const activity = await tx.get<Activity>('activities', id);
        if (!activity || activity.localSimulation || activity.type !== 'personal' || activity.status !== 'running' || activity.nextEventAt > now) return null;
        requireThat(activity.contentVersion === this.contentVersion, 'CONTENT_VERSION', '活动内容版本暂不可用');
        const owner = await account(tx, activity.accountId);
        const deadline = await this.activityDeadline(tx, activity), until = Math.min(now, deadline);
        const state = await this.personalContext(tx, await owned(tx, owner.id, activity.actorId), activity.settledUntil);
        state.rngState = activity.rngState;
        const lastSeenAt = (await presence(tx, owner.id)).lastSeenAt;
        const recorded = (state.combat || state.activity.type === 'hunt') && combatExecutionMode(activity, state) === 'recorded';
        const offline = recorded && until-lastSeenAt >= 5000;
        const batch = recorded && (offline || until-state.wallAt > 2000);
        const due = Number.isFinite(state.activity.endsAt) ? state.wallAt+Math.max(0,state.activity.endsAt-state.clock) : until;
        return {activity, owner, state: await readCombatPlan(tx, activity, until, this.contentVersion) || state,
            until: Math.min(until,due), observedAt:until, lastSeenAt, offline, maxTicks: batch ? OFFLINE_BATCH_TICKS : simulationTickBudget(lastSeenAt,until)};
    });
    if (!input) return false;
    const state: Rules = advance(input.state, input.until, {maxTicks: input.maxTicks}).state;
    try {
        return await this.store.transaction(async tx => {
            const current = await tx.get<Activity>('activities', id);
            if (!isDeepStrictEqual(current, input.activity) || !isDeepStrictEqual(await tx.get('accounts', input.owner.id), input.owner)) return false;
            const interval = input.offline ? OFFLINE_BATCH_INTERVAL_MS : simulationInterval(state.combat,input.lastSeenAt,input.observedAt);
            await this.settleActivity(tx, current!, now, {state, interval});
            return true;
        }, {attempts: 1});
    } catch (error) {
        if (error instanceof DatabaseBusyError) return false;
        throw error;
    }
}

export async function advanceInstance(this: GameService, instanceId: string, workerId: string, epoch: number, now = this.now()): Promise<boolean> {
    const input = await this.store.read(async tx => {
        const lease = await tx.get<InstanceLease>('instance_leases', instanceId);
        const instance = await tx.get<Instance>('instances', instanceId);
        requireThat(lease && instance && lease.workerId === workerId && lease.epoch === epoch && instance.epoch === epoch && lease.expiresAt > now, 'STALE_EPOCH', '副本执行租约已失效');
        if (instance.localSimulation || instance.status !== 'running' || instance.nextEventAt > now) return null;
        requireThat(instance.contentVersion === this.contentVersion, 'CONTENT_VERSION', '副本内容版本暂不可用');
        const owners = [], ids = new Set(instance.roster.filter(r => r.controller !== 'mercenary').map(r => r.accountId));
        let lastSeenAt = 0;
        for (const id of ids) {
            owners.push(await account(tx,id));
            lastSeenAt = Math.max(lastSeenAt,(await presence(tx,id)).lastSeenAt);
        }
        const deadline = await this.instanceDeadline(tx,instance);
        const state = await readCombatPlan(tx,instance,Math.min(now,deadline),this.contentVersion) || instance.simulation!;
        const recorded = combatExecutionMode(instance,instance.simulation!) === 'recorded';
        const batch = recorded && (now-lastSeenAt >= 5000 || now-instance.simulation!.wallAt > 2000);
        const raidCamp = !state.combat && state.goldRaid?.active;
        return {instance, owners, state, until:Math.min(now,deadline), maxTicks:batch ? OFFLINE_BATCH_TICKS : raidCamp ? 200 : simulationTickBudget(lastSeenAt,now)};
    });
    if (!input) return false;
    const state = advance(input.state,input.until,{maxTicks:input.maxTicks}).state;
    try {
        return await this.store.transaction(async tx => {
            const lease = await tx.get<InstanceLease>('instance_leases',instanceId);
            if (!lease || lease.workerId !== workerId || lease.epoch !== epoch || lease.expiresAt <= Math.max(now,this.now())) return false;
            const instance = await tx.get<Instance>('instances',instanceId);
            if (!isDeepStrictEqual(instance,input.instance)) return false;
            for (const owner of input.owners)
                if (!isDeepStrictEqual(await tx.get('accounts',owner.id),owner)) return false;
            instance!.simulation = structuredClone(state);
            instance!.rngState = state.rngState;
            instance!.sequence++;
            await this.persistInstance(tx,instance!,now,`instance:${instanceId}:sequence:${instance!.sequence}`);
            await this.bumpInstanceAccounts(tx,instance!);
            return true;
        }, {attempts:1});
    } catch (error) {
        if (error instanceof DatabaseBusyError) return false;
        throw error;
    }
}
