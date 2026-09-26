import {emergencyGoldExit} from './rules/gold-raid.js';
import {resolveGroupLoot} from './rules/group-loot.js';
import type {Transaction} from '../../persistence/src/store.ts';
import type {GameService} from './service.ts';
import {type Activity, type ActorLease, type Character, type Instance, requireThat} from './model.ts';
import {bump, characterRules, clone, context, owned, persistAssets} from './context.ts';
import {invalidateCombatPlan} from './combat-execution.ts';
import {log, stats} from './rules/character.js';
import {dungeonRoute} from './rules/dungeon.js';
import {receive} from './rules/inventory.js';

// Emergency cancellation uses committed characters/assets, never advance() or a
// predicted combat result. It remains usable when the old runner is unavailable.
export async function unstuck(this: GameService, tx: Transaction, actor: Character, now: number, requestId: string) {
    const lease = await tx.get<ActorLease>('actor_leases', actor.id);
    const owner = !lease ? null : lease.kind === 'instance'
        ? await tx.get<Instance>('instances', lease.ownerId)
        : await tx.get<Activity>('activities', lease.ownerId);
    const instance = owner && 'roster' in owner ? owner : null;
    const activity = owner && 'type' in owner ? owner : null;
    if (lease) requireThat(lease.actorId === actor.id && lease.accountId === actor.accountId,
        'FORBIDDEN', '角色活动占用归属无效', 403);
    if (owner) requireThat(instance ? instance.roster.some(row => row.characterId === actor.id && row.accountId === actor.accountId) : activity!.accountId === actor.accountId,
        'FORBIDDEN', '不能处理其他账号的活动', 403);

    const key = `unstuck:${actor.accountId}:${requestId}`;
    if(instance?.simulation?.groupLoot?.pending.length && instance.roster.some(r=>r.controller==='npc')){
        // Only committed drops are settled. Escape cannot reroll or transfer an
        // NPC's winnings to the leader after the instance party is discarded.
        const committed=instance.simulation,combat=committed.combat;
        committed.combat=null;
        for(const loot of [...committed.groupLoot.pending])resolveGroupLoot(committed,loot.id,'pass');
        committed.combat=combat;
        await this.persistInstance(tx,instance,now,`${key}:group-loot`);
    }
    if (owner) await invalidateCombatPlan(tx, owner);
    if (lease) await tx.delete('combat_plans', lease.ownerId);
    if (activity) await this.restoreReservation(tx, activity, now, key);
    if (lease?.kind === 'activity' && !activity) {
        // An orphaned lease must not strand a committed material reservation.
        for (const reserved of await tx.list('reservations', {activityId:lease.ownerId, accountId:actor.accountId, status:'reserved'}))
            await this.restoreReservation(tx, {reservationId:reserved.id, accountId:actor.accountId, payerId:reserved.payerId}, now, key);
    }
    // With no lease, clear the selected character's residual simulation state too.
    const leases = lease ? await tx.list<ActorLease>('actor_leases', {kind:lease.kind, ownerId:lease.ownerId}) : [];
    const members = leases.length ? leases : [{actorId:actor.id, accountId:actor.accountId}];
    const accounts = new Set<string>();
    for (const memberLease of members) {
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
        if(instance?.leaderId===c.id && instance.simulation?.goldRaid?.active){
            // Settle NPC escrow and purchases from the committed instance roster.
            // Personal character rows intentionally do not contain party units.
            for(const field of ['party','goldRaid','npcWorld','goldRaidSaves'])s[field]=clone(instance.simulation[field]);
        }
        if (s.goldRaid?.active) {
            emergencyGoldExit(s);
            await persistAssets(tx, c, s, `${key}:gold`, this.id);
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
        if (lease) await this.release(tx, c.id, lease.ownerId);
        accounts.add(c.accountId);
    }
    if (owner) delete owner.resumeEventAt;
    if (lease?.kind === 'instance') {
        await tx.delete('instance_leases', lease.ownerId);

    }
    if (instance) {
        instance.status = 'completed';
        instance.simulation = null;
        instance.roster = [];
        instance.epoch++;
        instance.sequence++;
        await tx.put('instances', instance);
    } else if (activity) {
        activity.status = 'cancelled';
        activity.engineActivity = {type: 'idle'};
        activity.settledUntil = now;
        await tx.put('activities', activity);
    }
    for (const id of accounts) if (id !== actor.accountId) await bump(tx, id);
}
