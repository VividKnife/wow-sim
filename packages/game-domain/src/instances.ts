import {applyExperienceBuff} from './rules/experience.js';
import {resetLocalSession} from './local-simulation.ts';
import {progressNpcWorld} from './rules/npc-world.js';
import {leaveGoldRaid,goldCommands} from './rules/gold-raid.js';
import {dungeonIdFor,dungeonDefinitions} from './rules/dungeon-registry.js';
import { act, advance } from './rules/engine.js';
import { stats } from './rules/character.js';
import { commandCombatCast } from './rules/combat.js';
import { petCommand } from './rules/class-spell-effects.js';
import type { Transaction } from '../../persistence/src/store.ts';
import { requireThat } from './model.ts';
import type { Character, Party, Rules, Instance, InstanceLease } from './model.ts';
import { account, presence, owned, bump, context, newState, persistCharacter, persistAssets, economicEvent, clone, rebaseSimulation } from './context.ts';
import { instanceContents } from './content.ts';
import type { GameService } from './service.ts';
import { PAUSED_EVENT_AT } from './presence.ts';
import {simulationInterval} from './simulation-cadence.ts';
import {invalidateCombatPlan, combatExecutionMode} from './combat-execution.ts';
import {OFFLINE_BATCH_INTERVAL_MS} from './combat-playback.ts';
const instanceCommands = new Set(['combatCommand','raidPlan','raidOrder','groupLoot',...goldCommands,'strategy', 'settings', 'petCommand', 'cast', 'useItem', 'rest', 'stop', 'abandonCombat', 'revive', 'resurrect', 'reincarnate', 'soulstoneRevive', 'dungeonNext','dungeonNavigate','dungeonPause', 'dungeonInteract', 'dungeonSkip', 'equip', 'equipBag', 'sortBag', 'discardJunk', 'discardItem', 'lockItem', 'applyEnchant', 'useBandage', 'disenchant', 'disenchantAll', 'loot', 'conjure', 'talent']);
export const visitorCommands = Object.freeze(['strategy', 'settings', 'cast', 'petCommand']);
function rosterIds(value: unknown): asserts value is string[] { requireThat(Array.isArray(value) && value.length > 0 && value.every(id => typeof id === 'string' && id.length > 0) && new Set(value).size === value.length, 'ROSTER', '副本名册必须是非空且不重复的角色 ID 数组', 400); }
export async function createInstance(this: GameService, tx: Transaction, c: Character, cmd: Rules, now: number) {
    const contentId = cmd.contentId ?? (cmd.type === 'enterDungeon' ? dungeonIdFor(c.rules) : 'northshire-skirmish');
    requireThat(typeof contentId === 'string' && Object.hasOwn(instanceContents, contentId), 'CONTENT', '未知的副本内容', 400);
    const capacity = cmd.capacity ?? (['molten-core-gold','onyxias-lair-gold'].includes(contentId) ? 25 : 5);
    if(['molten-core-gold','onyxias-lair-gold'].includes(contentId))requireThat(capacity===25&&c.kind==='hero','RAID_ENTRY','团队副本需要主角发起25人金团');
    requireThat([5, 10, 20, 25, 40].includes(capacity), 'CAPACITY', '副本席位必须为 5、10、20、25 或 40', 400);
    const a = await account(tx, c.accountId), party = await tx.get<Party>('parties', a.partyId);
    const npcDraft = c.kind === 'hero' && Object.hasOwn(dungeonDefinitions,contentId) ? c.rules.npcWorld?.selection : null;
    const ids = contentId.endsWith('-gold') ? [c.id] : cmd.characterIds === undefined ? (npcDraft ? [c.id,...npcDraft] : cmd.type === 'enterDungeon' ? party!.characterIds : [c.id]) : cmd.characterIds;
    rosterIds(ids);
    requireThat(ids.includes(c.id) && ids.length <= capacity, 'ROSTER', '副本名册必须包含发起角色且不超过席位上限', 400);
    const instance: Instance = { id: this.id(), creatorAccountId: c.accountId, leaderId: c.id, contentId, contentVersion: this.contentVersion, capacity, status: 'forming', roster: [], simulation: null, rngState: this.seed(), sequence: 0, epoch: 0, nextEventAt: now + 1000, createdAt: now };
    for (const id of ids) {
        const npc = c.kind === 'hero' && Object.hasOwn(dungeonDefinitions,contentId) && c.rules.npcWorld?.residents.find((p:Rules)=>p.id===id);
        if (npc) {
            // The world's hero lease below owns all NPC state for this instance.
            instance.roster.push({characterId:id,accountId:c.accountId,controller:'npc'});
            continue;
        }
        const character = await owned(tx, c.accountId, id);
        await this.lock(tx, character, 'instance', instance.id);
        instance.roster.push({ characterId: id, accountId: c.accountId, controller: character.kind === 'hero' ? 'player' : 'companion' });
    }
    await tx.insert('instances', instance);
    if (cmd.type === 'enterDungeon')
        await this.startInstance(tx, c, { instanceId: instance.id }, now);
}
export async function instanceFor(this: GameService, tx: Transaction, c: Character, id: string) { const instance = await tx.get<Instance>('instances', id); requireThat(instance && instance.roster.some(r => r.characterId === c.id && r.accountId === c.accountId), 'FORBIDDEN', '未授权访问此副本', 403); return instance; }
export async function joinInstance(this: GameService, tx: Transaction, c: Character, cmd: Rules, now: number) { const instance = await tx.get<Instance>('instances', cmd.instanceId); requireThat(instance, 'NOT_FOUND', '副本不存在', 404); requireThat(!['molten-core-gold','onyxias-lair-gold'].includes(instance.contentId),'RAID_SOLO','金团目前由单个账号率队'); requireThat(instance.status === 'forming', 'INSTANCE_STARTED', '副本已开始，不能加入'); const ids = cmd.characterIds === undefined ? [c.id] : cmd.characterIds; rosterIds(ids); requireThat(instance.roster.length + ids.length <= instance.capacity, 'CAPACITY', '副本名额已满'); for (const id of ids) {
    const character = await owned(tx, c.accountId, id);
    await this.lock(tx, character, 'instance', instance.id);
    instance.roster.push({ characterId: id, accountId: c.accountId, controller: character.kind === 'hero' ? 'player' : 'companion' });
} instance.sequence++; await tx.put('instances', instance); for (const id of new Set(instance.roster.map(r => r.accountId)))
    if (id !== c.accountId)
        await bump(tx, id); }
export async function startInstance(this: GameService, tx: Transaction, c: Character, cmd: Rules, now: number) {
    const instance = await this.instanceFor(tx, c, cmd.instanceId);
    requireThat(instance.leaderId === c.id, 'FORBIDDEN', '只有队长可以开始副本', 403);
    requireThat(instance.status === 'forming', 'INSTANCE_STARTED', '副本已开始');
    requireThat(instance.contentVersion === this.contentVersion, 'CONTENT_VERSION', '副本内容版本暂不可用');
    let s = await context(tx, c, now, false);
    applyExperienceBuff(s, this.xpMultiplier);
    s = advance(s, now).state;
    progressNpcWorld(s);
    s.party = [];
    s.rngState = instance.rngState;
    for (const row of instance.roster) {
        if (row.characterId === c.id)
            continue;
        if (row.controller === 'npc') {
            const resident=s.npcWorld?.residents.find((p:Rules)=>p.id===row.characterId);
            requireThat(resident,'NPC_MISSING','冒险者档案不存在');
            const unit=clone(resident.unit),st=stats(unit);
            unit.hp=st.maxHp;unit.mana=st.maxMana;unit.time=s.clock;unit.location=s.location;
            s.party.push(unit);
        }
        else {
            const other = await owned(tx, row.accountId, row.characterId);
            const state = advance(await context(tx, other, now, false), now).state;
            s.party.push(this.member(rebaseSimulation(state, s.clock)));
        }
    }
    const content = instanceContents[instance.contentId as keyof typeof instanceContents];
    // The authoritative roster has already resolved the saved lobby draft.
    if(s.npcWorld && Object.hasOwn(dungeonDefinitions,instance.contentId))s.npcWorld.selection=s.party.map((p:Rules)=>p.id);
    requireThat([s, ...s.party].every((p: Rules) => p.level >= content.minimumLevel && p.hp > 0), 'ENTRY', '角色等级或生命值不满足副本要求');
    const savedRunId = s.dungeonSaves?.[instance.contentId]?.runId;
    content.start(s);
    if (s.dungeon && !savedRunId)
        s.dungeon.runId = instance.id;
    if (s.dungeon || s.goldRaid?.active)
        await persistCharacter(tx, c, s, s.wallAt, `instance:${instance.id}:start`, this.id);
    for (const member of s.party) applyExperienceBuff(member, this.xpMultiplier);
    instance.simulation = s;
    instance.rngState = s.rngState;
    instance.status = 'running';
    instance.sequence++;
    instance.nextEventAt = now + simulationInterval(s.combat, now, now);
    await tx.put('instances', instance);
    await this.bumpInstanceAccounts(tx, instance, c.accountId);
}
export async function bumpInstanceAccounts(this: GameService, tx: Transaction, instance: Instance, except?: string) { for (const id of new Set(instance.roster.filter(r => r.controller !== 'npc').map(r => r.accountId)))
    if (id !== except)
        await bump(tx, id); }
export async function instanceCommand(this: GameService, tx: Transaction, c: Character, id: string, cmd: Rules, now: number, observedPresence?: ReadonlyMap<string, number>) {
    const instance = await this.instanceFor(tx, c, id);
    requireThat(['running', 'completed'].includes(instance.status) && instance.simulation, 'INSTANCE_NOT_RUNNING', '副本尚未开始');
    requireThat(instanceCommands.has(cmd.type), 'INSTANCE_COMMAND', '请先离开实例再进行这项操作');
    if(instance.simulation?.goldRaid?.active){
        requireThat(goldCommands.includes(cmd.type)||['raidPlan','raidOrder','abandonCombat','cast','loot','equip','strategy','settings'].includes(cmd.type),'GOLD_PHASE','请使用金团营地的操作');
        if(['strategy','equip'].includes(cmd.type)&&cmd.target)requireThat(!instance.simulation.party.some((p:Rules)=>p.goldNpc&&p.id===cmd.target),'GOLD_NPC','NPC自行管理装备和打法，团长只能发布团队战术');
    }
    if(cmd.type==='combatCommand'&&cmd.memberId){const member=instance.roster.find(r=>r.characterId===cmd.memberId);requireThat(member && (member.accountId===c.accountId||member.controller==='npc'), 'FORBIDDEN', '不能指挥其他账号的角色',403);}
    const action = { ...cmd }, visitor = c.id !== instance.leaderId;
    if(instance.roster.some(r=>r.controller==='npc') && action.target && instance.roster.some(r=>r.controller==='npc'&&r.characterId===action.target))requireThat(!['equip','strategy','talent'].includes(action.type),'NPC_CONTROL','NPC 玩家自行管理装备、天赋和策略');
    requireThat((!action.actorId || action.actorId === c.id) && (!action.casterId || action.casterId === c.id), 'FORBIDDEN', '只能控制自己的角色', 403);
    if (visitor) {
        requireThat(visitorCommands.includes(action.type), 'VISITOR_COMMAND', '访客仅支持自己的策略、恢复设置、法师手动战斗施法和宠物控制', 403);
        if (action.type !== 'cast')
            requireThat(!action.target || action.target === c.id, 'FORBIDDEN', '只能配置自己角色的战斗策略或设置', 403);
        else
            requireThat(!instance.roster.some(row => row.characterId === action.target && row.accountId !== c.accountId), 'FORBIDDEN', '不能将其他账号角色作为控制目标', 403);
        if (action.type === 'strategy')
            action.target = c.id;
    }
    else if (action.target && action.target !== c.id) {
        const target = instance.roster.find(r => r.characterId === action.target);
        requireThat(!target || target.accountId === c.accountId, 'FORBIDDEN', '不能控制其他账号的角色', 403);
    }
    const deadline = await this.instanceDeadline(tx, instance, observedPresence);
    requireThat(now <= deadline, 'OFFLINE_PARTICIPANT', '有副本参与者已超出离线时限，请等待其上线');
    const s = instance.localSimulation ? structuredClone(instance.simulation) : advance(instance.simulation, now, {}).state;
    resetLocalSession(instance);
    const actor = visitor ? s.party.find((unit: Rules) => unit.id === c.id) : s;
    requireThat(actor, 'INSTANCE_ACTOR', '实例中找不到该角色');
    if (visitor && action.type === 'cast') {
        commandCombatCast(s, actor, action.id, action.target);
        instance.simulation = s;
    }
    else if (visitor && action.type === 'petCommand') {
        petCommand(s, action, actor);
        instance.simulation = s;
    }
    else if (visitor && action.type === 'settings') {
        requireThat(Number.isInteger(action.health) && Number.isInteger(action.mana) && action.health >= 1 && action.health <= 100 && action.mana >= 1 && action.mana <= 100, 'SETTINGS', '恢复阈值必须为 1—100 的整数', 400);
        actor.settings = { ...actor.settings, health: action.health, mana: action.mana };
        instance.simulation = s;
    }
    else
        instance.simulation = act(s, action, s.wallAt);
    if(action.type==='goldLaunch')instance.roster.push(...instance.simulation!.party.map((unit:Rules)=>({characterId:unit.id,accountId:c.accountId,controller:'npc' as const,joinedAt:now})));
    if (action.type === 'equip')
        await this.transferEquipment(tx, c, instance.simulation!);
    instance.sequence++;
    instance.rngState = instance.simulation!.rngState;
    await this.persistInstance(tx, instance, now, `instance:${id}:command:${cmd.requestId}`, observedPresence);
    await this.bumpInstanceAccounts(tx, instance, c.accountId);
}
export async function persistInstance(this: GameService, tx: Transaction, instance: Instance, now: number, key: string, observedPresence?: ReadonlyMap<string, number>, options:{localCheckpoint?:boolean}={}) {
    await invalidateCombatPlan(tx, instance);
    const s = instance.simulation!;
    for (const row of instance.roster) {
        if (row.controller === 'npc')
            continue;
        const c = await owned(tx, row.accountId, row.characterId);
        if (c.id === s.id)
            await persistCharacter(tx, c, { ...s, combat: null, lastCombat: null }, s.wallAt, key, this.id);
        else {
            const unit = s.party.find((p: Rules) => p.id === c.id);
            if (unit)
                await this.persistMember(tx, unit, s.wallAt, key, { clock: s.clock, wallAt: s.wallAt, location: s.location });
        }
    }
    if (!s.groupLoot?.pending.length && !s.goldRaid?.active && !s.combat && (!s.dungeon || s.dungeon.completedAt) && !s.dungeon?.autoAdvance && ['idle', 'dead'].includes(s.activity.type) && !s.rest)
        instance.status = 'completed';
    else
        instance.status = 'running';
    let lastSeenAt = 0;
    for (const accountId of new Set(instance.roster.filter(r => r.controller !== 'npc').map(r => r.accountId)))
        lastSeenAt = Math.max(lastSeenAt, observedPresence?.get(accountId) ?? (await presence(tx, accountId)).lastSeenAt);
    instance.nextEventAt = s.wallAt + (combatExecutionMode(instance, s) === 'recorded' && now - lastSeenAt >= 5_000 ? OFFLINE_BATCH_INTERVAL_MS : simulationInterval(s.combat, lastSeenAt, now));
    if (s.goldRaid?.active && !s.combat) instance.nextEventAt = s.wallAt + 5_000;
    if (Number.isFinite(s.activity.endsAt)) instance.nextEventAt = Math.min(instance.nextEventAt, s.wallAt + Math.max(1, s.activity.endsAt - s.clock));
    // Auctions change on inquiry rounds. Rewriting the entire raid every second
    // creates unnecessary serialization conflicts with manual bids.
    if (s.goldRaid?.active && s.goldRaid.auction) instance.nextEventAt = Math.min(instance.nextEventAt, s.wallAt + Math.max(1, s.goldRaid.auction.nextRoundAt - s.clock));
    const deadline = await this.instanceDeadline(tx, instance, observedPresence);
    if (s.wallAt < deadline) instance.nextEventAt = Math.min(instance.nextEventAt, deadline);
    else if (instance.status === 'running') {
        instance.resumeEventAt = instance.nextEventAt;
        instance.nextEventAt = PAUSED_EVENT_AT;
    }
    // A gold raid waiting at camp has no timed work. Keep the worker off the
    // instance until a command starts travel, recovery, combat, or an auction.
    if (s.goldRaid?.active && !s.combat && !s.goldRaid.autoAdvance && !s.goldRaid.auction && !s.goldRaid.lots.length &&
        !s.goldRaid.recoverUntil && s.activity.type === 'idle' && !s.rest)
        instance.nextEventAt = PAUSED_EVENT_AT;
    if (instance.localSimulation) instance.nextEventAt = PAUSED_EVENT_AT;
    await tx.put('instances', instance);
    // Routine browser saves are covered by the session sequence and bounded
    // receipt. Keep asset ledger entries and the actual completion event.
    if(!options.localCheckpoint||instance.status==='completed')await economicEvent(tx, key, instance.creatorAccountId, 'instanceSettled', { instanceId: instance.id, sequence: instance.sequence });
}
export async function leaveInstance(this: GameService, tx: Transaction, c: Character, id: string, now: number) {
    const instance = await this.instanceFor(tx, c, id);
    resetLocalSession(instance);
    requireThat(!instance.simulation?.combat, 'IN_COMBAT', '战斗结束后才能离开');
    await invalidateCombatPlan(tx, instance);
    const departing = instance.roster.filter(r => r.accountId === c.accountId), ownedRows = departing.filter(r => r.controller !== 'npc');
    requireThat(!departing.some(r => r.characterId === instance.leaderId) || instance.roster.every(r => r.accountId === c.accountId), 'LEADER', '其他账号离开后队长才能离开');
    if(instance.simulation?.goldRaid?.active){leaveGoldRaid(instance.simulation);await this.persistInstance(tx,instance,now,`instance:${id}:gold-leave:${instance.sequence}`);}
    if (instance.simulation?.dungeon && departing.some(r => r.characterId === instance.leaderId)) {
        // Save the authoritative route before releasing actors to personal play.
        instance.simulation = act(instance.simulation, { type: 'leaveDungeon' }, instance.simulation.wallAt);
        await this.persistInstance(tx, instance, now, `instance:${id}:leave:${instance.sequence}`);
    }
    for (const row of ownedRows) {
        await this.release(tx, row.characterId, id);
        const character = await owned(tx, c.accountId, row.characterId), s = await context(tx, character, now, false);
        s.activity = { type: 'idle' };
        s.combat = null;
        await persistCharacter(tx, character, s, now, `leave:${id}:${row.characterId}`, this.id);
    }
    instance.roster = instance.roster.filter(r => r.accountId !== c.accountId);
    if (instance.simulation)
        instance.simulation.party = instance.simulation.party.filter((p: Rules) => !departing.some(r => r.characterId === p.id));
    if (!instance.roster.length)
        instance.status = 'completed';
    instance.sequence++;
    await tx.put('instances', instance);
    await this.bumpInstanceAccounts(tx, instance, c.accountId);
}
export async function acquireInstanceLease(this: GameService, instanceId: string, workerId: string, now = this.now(), ttl = 10000) { requireThat(ttl > 0 && Number.isSafeInteger(ttl), 'LEASE', '租约时长无效', 400); return this.store.transaction(async (tx) => { const instance = await tx.get<Instance>('instances', instanceId); requireThat(instance, 'NOT_FOUND', '副本不存在', 404); const old = await tx.get<InstanceLease>('instance_leases', instanceId); requireThat(!old || old.expiresAt <= now || old.workerId === workerId, 'LEASE_HELD', '其他执行者持有副本租约'); const epoch = old && old.workerId === workerId && old.expiresAt > now ? old.epoch : instance.epoch + 1; instance.epoch = epoch; await tx.put('instances', instance); const lease = { id: instanceId, instanceId, workerId, epoch, expiresAt: now + ttl }; await tx.put('instance_leases', lease); return lease; }, {attempts:1}); }
