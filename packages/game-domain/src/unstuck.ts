import type {Transaction} from '../../persistence/src/store.ts';
import type {GameService} from './service.ts';
import {type Activity, type ActorLease, type Character, type Instance, requireThat} from './model.ts';
import {bump, characterRules, clone, context, owned, persistAssets} from './context.ts';
import {invalidateCombatPlan} from './combat-execution.ts';
import {log, stats} from './rules/character.js';
import {dungeonRoute} from './rules/dungeon.js';
import {receive} from './rules/inventory.js';

const STALLED_MS = 60_000;

// Emergency cancellation uses committed characters/assets, never advance() or a
// predicted combat result. It remains usable when the old runner is unavailable.
export async function unstuck(this: GameService, tx: Transaction, actor: Character, now: number, requestId: string) {
    const lease = await tx.get<ActorLease>('actor_leases', actor.id);
    requireThat(lease, 'NOT_STUCK', '当前没有卡住的活动。');
    const owner = lease.kind === 'instance'
        ? await tx.get<Instance>('instances', lease.ownerId)
        : await tx.get<Activity>('activities', lease.ownerId);
    requireThat(owner, 'NOT_STUCK', '找不到当前活动，请联系管理员。');
    const instance = 'roster' in owner ? owner : null;
    const activity = 'type' in owner ? owner : null;
    requireThat(instance ? instance.roster.some(row => row.characterId === actor.id && row.accountId === actor.accountId) : activity!.accountId === actor.accountId,
        'FORBIDDEN', '不能处理其他账号的活动', 403);
    requireThat(owner.contentVersion !== this.contentVersion || now - owner.nextEventAt >= STALLED_MS || owner.status === 'failed',
        'NOT_STUCK', '活动尚未停滞，请等待；结算逾期超过 60 秒后可脱离卡死。');

    const key = `unstuck:${actor.accountId}:${requestId}`;
    await invalidateCombatPlan(tx, owner);
    await tx.delete('combat_plans', owner.id);
    if (activity) await this.restoreReservation(tx, activity, now, key);
    const leases = await tx.list<ActorLease>('actor_leases', {kind: lease.kind, ownerId: owner.id});
    const accounts = new Set<string>();
    for (const memberLease of leases) {
        const c = await owned(tx, memberLease.accountId, memberLease.actorId);
        const s = await context(tx, c, now, false);
        // Keep simulation time (and cooldowns) fixed while discarding unprocessed time.
        s.wallAt = now;
        s.time = s.clock;
        s.nextTick = s.clock + 100;
        s.nextRegen = s.clock + 2000;
        s.activity = {type: 'idle'};
        for (const field of ['combat', 'cast', 'rest', 'escort', 'stockadesQuestEvent', 'mounted', 'queuedStrike', 'target', 'comboTarget', 'fall', 'cannibalize', 'shadowmeld', 'trap']) s[field] = null;
        for (const field of ['auras', 'hots', 'periodicClass', 'groundEffects', 'flares', 'environmentBuffs']) s[field] = [];
        s.talentProcs = {};
        s.totems = {};
        s.swimming = false;
        s.environment = {mode: 'shore', breathMs: 60000, lastTick: s.clock, nextDrown: null};
        s.spiritRedemptionUsed = false;
        // Save only on the original leader, exactly as a normal dungeon exit.
        // Do not copy a shared run to every participant or use a predicted result.
        if (instance?.leaderId === c.id && instance.simulation?.dungeon) {
            s.dungeonSaves ??= {};
            const saved = s.dungeonSaves[instance.simulation.dungeon.id] = clone(instance.simulation.dungeon);
            saved.autoAdvance = false;
            saved.advanceReason = '';
            // Igniting the cannon already consumed powder. Cancelling that action
            // must return it so the preserved route can still open the door.
            const action = instance.simulation.activity;
            const encounter = dungeonRoute(saved.id)[saved.cursor];
            if (action.type === 'dungeonCannon' && encounter?.id === action.routeId && encounter.interaction && !saved.interactions[encounter.id]) {
                receive(s, encounter.interaction.item, 1);
                await persistAssets(tx, c, s, `${key}:cannon`, this.id);
            }
        }
        delete s.dungeon;
        delete s.preparationTravel;
        if (s.location === 'deadmines') s.location = 'moonbrook';
        if (s.location === 'stockades') s.location = 'magetower';
        if (!s.visited.includes(s.location)) s.visited.push(s.location);
        if (s.hp <= 0) {
            const st = stats(s);
            s.hp = Math.max(1, Math.ceil(st.maxHp * .5));
            s.mana = Math.ceil(st.maxMana * .5);
        }
        if (s.pet) { s.pet.cast = null; s.pet.target = null; }
        log(s, '已脱离卡死，结束当前活动。已保存的成长和物品保留，未结算收益不补发。');
        c.rules = characterRules(s);
        await tx.put('characters', c);
        await this.release(tx, c.id, owner.id);
        accounts.add(c.accountId);
    }
    delete owner.resumeEventAt;
    if (instance) {
        for (const contract of await tx.list('contracts', {instanceId: instance.id})) {
            contract.status = 'ended';
            await tx.put('contracts', contract);
        }
        instance.status = 'completed';
        instance.simulation = null;
        instance.roster = [];
        instance.epoch++;
        instance.sequence++;
        await tx.delete('instance_leases', instance.id);
        await tx.put('instances', instance);
    } else {
        activity!.status = 'cancelled';
        activity!.engineActivity = {type: 'idle'};
        activity!.settledUntil = now;
        await tx.put('activities', activity!);
    }
    for (const id of accounts) if (id !== actor.accountId) await bump(tx, id);
}
