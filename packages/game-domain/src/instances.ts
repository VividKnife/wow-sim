import { act, advance } from './rules/engine.js';
import { stats } from './rules/character.js';
import { commandCombatCast } from './rules/combat.js';
import { petCommand } from './rules/class-spell-effects.js';
import type { Transaction } from '../../persistence/src/store.ts';
import { requireThat } from './model.ts';
import type { Character, Party, Rules, Instance, InstanceLease } from './model.ts';
import { account, owned, bump, context, newState, persistCharacter, persistAssets, economicEvent, clone, rebaseSimulation } from './context.ts';
import { instanceContents, mercenaryTemplates } from './content.ts';
import type { GameService } from './service.ts';
import { PAUSED_EVENT_AT } from './presence.ts';
const instanceCommands = new Set(['strategy', 'settings', 'petCommand', 'cast', 'useItem', 'rest', 'stop', 'revive', 'resurrect', 'reincarnate', 'soulstoneRevive', 'dungeonNext', 'dungeonInteract', 'dungeonSkip', 'equip', 'equipBag', 'sortBag', 'lockItem', 'applyEnchant', 'useBandage', 'disenchant', 'disenchantAll', 'loot', 'conjure', 'talent']);
export const visitorCommands = Object.freeze(['strategy', 'settings', 'cast', 'petCommand']);
function rosterIds(value: unknown): asserts value is string[] { requireThat(Array.isArray(value) && value.length > 0 && value.every(id => typeof id === 'string' && id.length > 0) && new Set(value).size === value.length, 'ROSTER', '副本名册必须是非空且不重复的角色 ID 数组', 400); }
export async function createInstance(this: GameService, tx: Transaction, c: Character, cmd: Rules, now: number) {
    const contentId = cmd.contentId ?? (cmd.type === 'enterDungeon' ? 'deadmines' : 'northshire-skirmish');
    requireThat(typeof contentId === 'string' && Object.hasOwn(instanceContents, contentId), 'CONTENT', '未知的副本内容', 400);
    const capacity = cmd.capacity ?? 5;
    requireThat([5, 10, 20, 40].includes(capacity), 'CAPACITY', '副本席位必须为 5、10、20 或 40', 400);
    const a = await account(tx, c.accountId), party = await tx.get<Party>('parties', a.partyId);
    const ids = cmd.characterIds === undefined ? (cmd.type === 'enterDungeon' ? party!.characterIds : [c.id]) : cmd.characterIds;
    rosterIds(ids);
    requireThat(ids.includes(c.id) && ids.length <= capacity, 'ROSTER', '副本名册必须包含发起角色且不超过席位上限', 400);
    const instance: Instance = { id: this.id(), creatorAccountId: c.accountId, leaderId: c.id, contentId, contentVersion: this.contentVersion, capacity, status: 'forming', roster: [], simulation: null, rngState: this.seed(), sequence: 0, epoch: 0, nextEventAt: now + 1000, createdAt: now };
    for (const id of ids) {
        const character = await owned(tx, c.accountId, id);
        await this.lock(tx, character, 'instance', instance.id);
        instance.roster.push({ characterId: id, accountId: c.accountId, controller: character.kind === 'hero' ? 'player' : 'companion' });
    }
    await tx.insert('instances', instance);
    if (cmd.type === 'enterDungeon')
        await this.startInstance(tx, c, { instanceId: instance.id }, now);
}
export async function instanceFor(this: GameService, tx: Transaction, c: Character, id: string) { const instance = await tx.get<Instance>('instances', id); requireThat(instance && instance.roster.some(r => r.characterId === c.id && r.accountId === c.accountId), 'FORBIDDEN', '未授权访问此副本', 403); return instance; }
export async function joinInstance(this: GameService, tx: Transaction, c: Character, cmd: Rules, now: number) { const instance = await tx.get<Instance>('instances', cmd.instanceId); requireThat(instance, 'NOT_FOUND', '副本不存在', 404); requireThat(instance.status === 'forming', 'INSTANCE_STARTED', '副本已开始，不能加入'); const ids = cmd.characterIds === undefined ? [c.id] : cmd.characterIds; rosterIds(ids); requireThat(instance.roster.length + ids.length <= instance.capacity, 'CAPACITY', '副本名额已满'); for (const id of ids) {
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
    s = advance(s, now).state;
    s.party = [];
    s.rngState = instance.rngState;
    for (const row of instance.roster) {
        if (row.characterId === c.id)
            continue;
        if (row.controller === 'mercenary') {
            const contract = await tx.get<Rules>('contracts', row.characterId);
            s.party.push(clone(contract!.unit));
        }
        else {
            const other = await owned(tx, row.accountId, row.characterId);
            const state = advance(await context(tx, other, now, false), now).state;
            s.party.push(this.member(rebaseSimulation(state, s.clock)));
        }
    }
    const content = instanceContents[instance.contentId as keyof typeof instanceContents];
    requireThat([s, ...s.party].every((p: Rules) => p.level >= content.minimumLevel && p.hp > 0), 'ENTRY', '角色等级或生命值不满足副本要求');
    content.start(s);
    if (s.dungeon)
        s.dungeon.runId = instance.id;
    instance.simulation = s;
    instance.rngState = s.rngState;
    instance.status = 'running';
    instance.sequence++;
    instance.nextEventAt = now + 1000;
    await tx.put('instances', instance);
    await this.bumpInstanceAccounts(tx, instance, c.accountId);
}
export async function bumpInstanceAccounts(this: GameService, tx: Transaction, instance: Instance, except?: string) { for (const id of new Set(instance.roster.filter(r => r.controller !== 'mercenary').map(r => r.accountId)))
    if (id !== except)
        await bump(tx, id); }
export async function instanceCommand(this: GameService, tx: Transaction, c: Character, id: string, cmd: Rules, now: number) {
    const instance = await this.instanceFor(tx, c, id);
    requireThat(['running', 'completed'].includes(instance.status) && instance.simulation, 'INSTANCE_NOT_RUNNING', '副本尚未开始');
    requireThat(instanceCommands.has(cmd.type), 'INSTANCE_COMMAND', '请先离开实例再进行这项操作');
    const action = { ...cmd }, visitor = c.id !== instance.leaderId;
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
    const deadline = await this.instanceDeadline(tx, instance);
    requireThat(now <= deadline, 'OFFLINE_PARTICIPANT', '有副本参与者已超出离线时限，请等待其上线');
    const s = advance(instance.simulation, now, {}).state;
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
    if (action.type === 'equip')
        await this.transferEquipment(tx, c, instance.simulation!);
    instance.sequence++;
    instance.rngState = instance.simulation!.rngState;
    await this.persistInstance(tx, instance, now, `instance:${id}:command:${cmd.requestId}`);
    await this.bumpInstanceAccounts(tx, instance, c.accountId);
}
export async function persistInstance(this: GameService, tx: Transaction, instance: Instance, now: number, key: string) {
    const s = instance.simulation!;
    for (const row of instance.roster) {
        if (row.controller === 'mercenary')
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
    if (!s.combat && (!s.dungeon || s.dungeon.completedAt) && ['idle', 'dead'].includes(s.activity.type) && !s.rest)
        instance.status = 'completed';
    else
        instance.status = 'running';
    instance.nextEventAt = s.wallAt + 1000;
    const deadline = await this.instanceDeadline(tx, instance);
    if (s.wallAt < deadline) instance.nextEventAt = Math.min(instance.nextEventAt, deadline);
    else if (instance.status === 'running') {
        instance.resumeEventAt = instance.nextEventAt;
        instance.nextEventAt = PAUSED_EVENT_AT;
    }
    await tx.put('instances', instance);
    await economicEvent(tx, key, instance.creatorAccountId, 'instanceSettled', { instanceId: instance.id, sequence: instance.sequence });
}
export async function leaveInstance(this: GameService, tx: Transaction, c: Character, id: string, now: number) {
    const instance = await this.instanceFor(tx, c, id);
    requireThat(!instance.simulation?.combat, 'IN_COMBAT', '战斗结束后才能离开');
    const departing = instance.roster.filter(r => r.accountId === c.accountId), ownedRows = departing.filter(r => r.controller !== 'mercenary');
    requireThat(!departing.some(r => r.characterId === instance.leaderId) || instance.roster.every(r => r.accountId === c.accountId), 'LEADER', '其他账号离开后队长才能离开');
    for (const row of ownedRows) {
        await this.release(tx, row.characterId, id);
        const character = await owned(tx, c.accountId, row.characterId), s = await context(tx, character, now, false);
        s.activity = { type: 'idle' };
        s.combat = null;
        await persistCharacter(tx, character, s, now, `leave:${id}:${row.characterId}`, this.id);
    }
    for (const row of departing.filter(r => r.controller === 'mercenary')) {
        const contract = await tx.get<Rules & {
            id: string;
        }>('contracts', row.characterId);
        if (contract) {
            contract.status = 'ended';
            await tx.put('contracts', contract);
        }
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
export async function hireMercenary(this: GameService, tx: Transaction, c: Character, cmd: Rules, now: number) { const instance = await this.instanceFor(tx, c, cmd.instanceId); const template = mercenaryTemplates[cmd.templateId as keyof typeof mercenaryTemplates]; requireThat(template, 'TEMPLATE', '佣兵模板不存在', 400); const businessKey = `contract:${instance.id}:${c.id}:${template.id}`; if (await tx.get('contracts', businessKey))
    return; requireThat(instance.status === 'forming' && instance.roster.length < instance.capacity, 'CAPACITY', '当前不能雇佣佣兵'); let s = await context(tx, c, now, false); requireThat(s.money >= template.cost, 'BALANCE', '佣金不足'); s.money -= template.cost; await persistAssets(tx, c, s, businessKey, this.id); const unit = newState(template.name, template.classId, template.raceId, this.seed(), now, businessKey); unit.level = c.rules.level; const st: Rules = stats(unit); unit.hp = st.maxHp; unit.mana = st.maxMana; await tx.insert('contracts', { id: businessKey, businessKey, instanceId: instance.id, accountId: c.accountId, payerId: c.id, templateId: template.id, contentVersion: this.contentVersion, cost: template.cost, status: 'paid', unit: this.member(unit) }); instance.roster.push({ characterId: businessKey, accountId: c.accountId, controller: 'mercenary' }); instance.sequence++; await tx.put('instances', instance); await economicEvent(tx, businessKey, c.accountId, 'mercenaryHired', { instanceId: instance.id }); await this.bumpInstanceAccounts(tx, instance, c.accountId); }
export async function acquireInstanceLease(this: GameService, instanceId: string, workerId: string, now = this.now(), ttl = 10000) { requireThat(ttl > 0 && Number.isSafeInteger(ttl), 'LEASE', '租约时长无效', 400); return this.store.transaction(async (tx) => { const instance = await tx.get<Instance>('instances', instanceId); requireThat(instance, 'NOT_FOUND', '副本不存在', 404); const old = await tx.get<InstanceLease>('instance_leases', instanceId); requireThat(!old || old.expiresAt <= now || old.workerId === workerId, 'LEASE_HELD', '其他执行者持有副本租约'); const epoch = old && old.workerId === workerId && old.expiresAt > now ? old.epoch : instance.epoch + 1; instance.epoch = epoch; await tx.put('instances', instance); const lease = { id: instanceId, instanceId, workerId, epoch, expiresAt: now + ttl }; await tx.put('instance_leases', lease); return lease; }); }
export async function advanceInstance(this: GameService, instanceId: string, workerId: string, epoch: number, now = this.now()) { return this.store.transaction(async (tx) => { const lease = await tx.get<InstanceLease>('instance_leases', instanceId), instance = await tx.get<Instance>('instances', instanceId); requireThat(lease && instance && lease.workerId === workerId && lease.epoch === epoch && instance.epoch === epoch && lease.expiresAt > now, 'STALE_EPOCH', '副本执行租约已失效'); if (instance.status !== 'running' || instance.nextEventAt > now)
    return false; requireThat(instance.contentVersion === this.contentVersion, 'CONTENT_VERSION', '副本内容版本暂不可用'); const key = `instance:${instance.id}:sequence:${instance.sequence + 1}`; const deadline = await this.instanceDeadline(tx, instance); const result = advance(instance.simulation!, Math.min(now, deadline), { maxTicks: 20000 }); instance.simulation = result.state; instance.rngState = result.state.rngState; instance.sequence++; await this.persistInstance(tx, instance, now, key); await this.bumpInstanceAccounts(tx, instance); return true; }); }
