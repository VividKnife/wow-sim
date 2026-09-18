import {talentSummary} from './rules/talent-summary.js';
import {roles} from './rules/party.js';
import { createInstance, instanceFor, joinInstance, startInstance, bumpInstanceAccounts, instanceCommand, persistInstance, leaveInstance, hireMercenary, acquireInstanceLease, advanceInstance } from './instances.ts';
import { startActivity, recall, restoreReservation, settleActivity } from './activities.ts';
import { randomUUID, randomBytes } from 'node:crypto';
import { removeInvalidSave } from './account-reset.ts';
import { unstuck } from './unstuck.ts';
import { validAccountPresence } from './context.ts';
import {simulationInterval} from './simulation-cadence.ts';
import {prepareCombatPlan, combatRecording, invalidateCombatPlan, combatExecutionMode} from './combat-execution.ts';
import type { Account } from './model.ts';
import { act, advance, quietIdle } from './rules/engine.js';
import { offlineLimit, recordPresence, activityDeadline, instanceDeadline } from './presence.ts';
import { professions } from './rules/profession-data.js';
import { receive } from './rules/inventory.js';
import { canEquip, takeItem } from './rules/character.js';
import { items, quests } from './rules/catalog.js';
import { questProgress } from './rules/quests.js';
import type { Store, Transaction } from '../../persistence/src/store.ts';
import { DomainError, requireThat } from './model.ts';
import type { Character, Party, Activity, Rules, ActorLease, Instance, InstanceLease, Item } from './model.ts';
import { account, owned, bump, context, newState, characterRules, persistCharacter, persistAssets, economicEvent, clone, rebaseSimulation } from './context.ts';
type Options = {
    contentVersion: string;
    now?: () => number;
    id?: () => string;
    seed?: () => number;
    offlineLimitMs?: number;
};
export class GameService {
    prepareCombatPlan = prepareCombatPlan;
    combatRecording = combatRecording;
    store: Store;
    contentVersion: string;
    now: () => number;
    id: () => string;
    seed: () => number;
    offlineLimitMs: number;
    recordPresence = recordPresence;
    activityDeadline = activityDeadline;
    instanceDeadline = instanceDeadline;
    constructor(store: Store, options: Options) { this.offlineLimitMs = offlineLimit(options.offlineLimitMs); this.store = store; this.contentVersion = options.contentVersion; this.now = options.now || Date.now; this.id = options.id || randomUUID; this.seed = options.seed || (() => randomBytes(4).readUInt32LE(0) || 1); }
    async createAccount(accountId: string, input: {
        name: string;
        classId: number;
        raceId: number;
    }, requestId: string) {
        this.request(requestId);
        await this.store.transaction(async (tx) => {
            const existing = await tx.get<Account>('accounts', accountId);
            if (existing && !validAccountPresence(existing)) await removeInvalidSave(tx, accountId);
            const previous = await tx.get<Rules>('receipts', `${accountId}:${requestId}`); if (previous) {
            requireThat(previous.fingerprint === JSON.stringify({ type: 'createAccount', ...input }), 'REQUEST_REUSED', 'requestId 已被其他命令使用');
            return;
        } requireThat(!await tx.get('accounts', accountId), 'EXISTS', '账号已有主角'); const now = this.now(), id = this.id(), partyId = this.id(); const s = newState(input.name, input.classId, input.raceId, this.seed(), now, id); const c: Character = { id, accountId, kind: 'hero', rules: characterRules(s), professionReadyAt: {}, resourceReadyAt: {} }; await tx.insert('accounts', { id: accountId, primaryCharacterId: id, partyId, revision: 1, createdAt: now, lastSeenAt: now }); await tx.insert('characters', c); await tx.insert('parties', { id: partyId, accountId, characterIds: [id] }); await persistAssets(tx, c, s, `create:${accountId}`, this.id); await this.receipt(tx, accountId, requestId, { type: 'createAccount', ...input }); });
        return this.snapshot(accountId);
    }
    request(id: unknown) { requireThat(typeof id === 'string' && id.length > 0 && id.length <= 160, 'INVALID_REQUEST', '需要有效的 requestId', 400); }
    async receipt(tx: Transaction, accountId: string, requestId: string, command: Rules) { await tx.insert('receipts', { id: `${accountId}:${requestId}`, accountId, requestId, fingerprint: JSON.stringify(command), createdAt: this.now() }); }
    async snapshot(accountId: string, characterId?: string, online = false) {
        // A polling read must not hold a presence write while assembling the
        // entire snapshot: that makes it compete with every combat settlement.
        if (online) await this.store.transaction(async tx => {
            const a = await account(tx, accountId), now = this.now();
            if (now - a.lastSeenAt >= Math.min(1000, this.offlineLimitMs / 4))
                await this.recordPresence(tx, accountId, now);
        });
        return this.store.transaction(async (tx) => {
            let a = await account(tx, accountId);
            let c = await owned(tx, accountId, characterId || a.primaryCharacterId);
            const now = this.now();
            const lease = await tx.get<ActorLease>('actor_leases', c.id);
            const instance = lease?.kind === 'instance' ? await tx.get<Instance>('instances', lease.ownerId) : null;
            const activity = lease?.kind === 'activity' ? await tx.get<Activity>('activities', lease.ownerId) : null;
            let state = await this.personalContext(tx, c, now);
            // Free actors have no worker. Commit bounded catch-up on reads, including
            // effects at full resources, so failed commands cannot roll it back forever.
            if (!lease) {
                let recovered = false;
                for (const member of [state, ...state.party]) {
                    if (await tx.get<ActorLease>('actor_leases', member.id)) continue;
                    const character = await owned(tx, accountId, member.id);
                    const current = await context(tx, character, now, false);
                    if (current.combat || quietIdle(current)) continue;
                    if (now - current.wallAt < current.nextRegen - current.clock) continue;
                    const result = advance(current, now);
                    await persistCharacter(tx, character, result.state, result.state.wallAt, `recovery:${character.id}:${result.state.wallAt}`, this.id);
                    recovered = true;
                }
                if (recovered) {
                    await bump(tx, accountId);
                    a = await account(tx, accountId);
                    state = await this.personalContext(tx, await owned(tx, accountId, c.id), now);
                }
            }
            if (instance?.simulation) {
                const simulation = clone(instance.simulation);
                if (simulation.id === c.id)
                    state = simulation;
                else {
                    const participant = simulation.party.find((p: Rules) => p.id === c.id);
                    state = { ...state, ...participant, party: [simulation, ...simulation.party].filter((p: Rules) => p.id !== c.id).map((p: Rules) => this.member(p)), combat: simulation.combat, lastCombat: simulation.lastCombat, activity: simulation.activity, dungeon: simulation.dungeon, clock: simulation.clock, wallAt: simulation.wallAt };
                }
            }
            const roster = (await tx.list<Character>('characters', { accountId })).map(row => ({ id: row.id, characterId: row.id, name: row.rules.name, classId: row.rules.classId, raceId: row.rules.raceId, level: row.rules.level, kind: row.kind, talentSummary: talentSummary(row.rules), professions: row.rules.professions }));
            const activities = await tx.list<Activity>('activities', { accountId });
            const owner = instance || activity;
            return { state, revision: a.revision, account: a, roster, activities, combatMode: owner && state.combat ? combatExecutionMode(owner, state) : null, playback: owner?.playback ?? null, instanceId: instance?.id || null, instance: instance ? { id: instance.id, leaderId: instance.leaderId, contentId: instance.contentId, status: instance.status, capacity: instance.capacity, roster: instance.roster, sequence: instance.sequence, epoch: instance.epoch } : null };
        });
    }
    member(s: Rules) { const { party, bag, bags, bank, pending, auctions, money, activity, combat, lastCombat, dungeon, receipts, ...member } = s; return member; }
    async personalContext(tx: Transaction, c: Character, now: number, settleFree = false) {
        let s = await context(tx, c, now);
        const ownLease = await tx.get<ActorLease>('actor_leases', c.id);
        const activity = ownLease?.kind === 'activity' ? await tx.get<Activity>('activities', ownLease.ownerId) : null;
        const a = await account(tx, c.accountId), p = await tx.get<Party>('parties', a.partyId);
        const participants = activity?.type === 'personal' ? activity.participantIds || [activity.actorId] : !ownLease && p?.characterIds.includes(c.id) ? p.characterIds : [];
        if (settleFree && !ownLease) {
            const result = advance(s, now);
            requireThat(result.complete, 'CATCHING_UP', '离线活动仍在结算');
            s = result.state;
        }
        for (const id of participants) {
            if (id === c.id)
                continue;
            const lease = await tx.get<ActorLease>('actor_leases', id);
            if (activity?.type === 'personal')
                requireThat(lease?.ownerId === activity.id, 'ACTIVITY_ROSTER', '活动参战者执行租约不一致');
            else if (lease)
                continue;
            const other = await owned(tx, c.accountId, id);
            let member = await context(tx, other, now, false);
            if (!activity && member.location !== s.location)
                continue;
            if (settleFree && !ownLease) {
                const result = advance(member, now);
                requireThat(result.complete, 'CATCHING_UP', '队员离线活动仍在结算');
                member = result.state;
            }
            rebaseSimulation(member, s.clock + member.wallAt - s.wallAt);
            s.party.push(this.member(member));
        }
        return s;
    }
    async ensureFree(tx: Transaction, actorId: string) { requireThat(!await tx.get('actor_leases', actorId), 'ACTOR_BUSY', '角色正在执行另一项活动'); }
    async lock(tx: Transaction, c: Character, kind: 'activity' | 'instance', ownerId: string) { await this.ensureFree(tx, c.id); if (kind === 'instance') {
        const pending = await tx.list<Rules>('reservations', { accountId: c.accountId, status: 'reserved' });
        requireThat(!pending.some(r => r.payerId === c.id || r.recipientId === c.id), 'ASSETS_RESERVED', '角色有尚未结算的制造资产');
    } await tx.insert('actor_leases', { id: c.id, actorId: c.id, accountId: c.accountId, kind, ownerId }); }
    async release(tx: Transaction, actorId: string, ownerId: string) { const lease = await tx.get<ActorLease>('actor_leases', actorId); if (lease?.ownerId === ownerId)
        await tx.delete('actor_leases', actorId); }
    async command(accountId: string, command: Rules) {
        this.request(command?.requestId);
        requireThat(typeof command.type === 'string', 'INVALID_COMMAND', '缺少操作类型', 400);
        await this.store.transaction(async tx => {
            const a = await account(tx, accountId);
            await owned(tx, accountId, command.characterId || a.primaryCharacterId);
            await this.recordPresence(tx, accountId, this.now());
        });
        try {
            await this.store.transaction(async (tx) => {
                const a = await account(tx, accountId);
                const old = await tx.get<Rules>('receipts', `${accountId}:${command.requestId}`);
                if (old) {
                    requireThat(old.fingerprint === JSON.stringify(command), 'REQUEST_REUSED', 'requestId 已被其他命令使用');
                    return;
                }
                const c = await owned(tx, accountId, command.characterId || a.primaryCharacterId), now = this.now();
                const lease = await tx.get<ActorLease>('actor_leases', c.id);
                if (command.type === 'unstuck')
                    await unstuck.call(this, tx, c, now, command.requestId);
                else if (command.type === 'createCompanion')
                    await this.createCompanion(tx, c, command, now);
                else if (command.type === 'setParty') {
                    requireThat(Array.isArray(command.characterIds) && command.characterIds.length >= 1 && command.characterIds.length <= 40 && new Set(command.characterIds).size === command.characterIds.length, 'PARTY', '队伍名册无效', 400);
                    const previous = await tx.get<Party>('parties', a.partyId);
                    for (const id of new Set([c.id, ...previous?.characterIds || [], ...command.characterIds])) {
                        await owned(tx, accountId, id);
                        await this.ensureFree(tx, id);
                    }
                    await tx.put('parties', { id: a.partyId, accountId, characterIds: command.characterIds });
                }
                else if (command.type === 'recall')
                    await this.recall(tx, accountId, command.activityId, now);
                else if (command.type === 'createInstance' || command.type === 'enterDungeon')
                    await this.createInstance(tx, c, command, now);
                else if (command.type === 'joinInstance')
                    await this.joinInstance(tx, c, command, now);
                else if (command.type === 'startInstance')
                    await this.startInstance(tx, c, command, now);
                else if (command.type === 'leaveInstance' || command.type === 'leaveDungeon')
                    await this.leaveInstance(tx, c, command.instanceId || lease?.ownerId, now);
                else if (command.type === 'hireMercenary')
                    await this.hireMercenary(tx, c, command, now);
                else if (lease?.kind === 'instance')
                    await this.instanceCommand(tx, c, lease.ownerId, command, now);
                else if (['startActivity', 'gatherResource', 'gatherAll', 'craft'].includes(command.type))
                    await this.startActivity(tx, c, command, now);
                else if (command.type === 'stop' && lease?.kind === 'activity') {
                    const activity = await tx.get<Activity>('activities', lease.ownerId);
                    if (activity?.type !== 'personal')
                        await this.recall(tx, accountId, lease.ownerId, now);
                    else
                        await this.personalCommand(tx, c, command, now);
                }
                else
                    await this.personalCommand(tx, c, command, now);
                await this.receipt(tx, accountId, command.requestId, command);
                await bump(tx, accountId);
            });
        }
        catch (error) {
            if (error instanceof DomainError)
                throw error;
            throw new DomainError('RULE_REJECTED', error instanceof Error ? error.message : '操作失败', 400);
        }
        return this.snapshot(accountId, command.characterId);
    }
    async createCompanion(tx: Transaction, owner: Character, cmd: Rules, now: number) {
        const candidate = roles.find(r => r.classId === cmd.classId);
        requireThat(candidate, 'CLASS', '未知职业');
        await this.personalCommand(tx, owner, {...cmd, type:'recruit', id:candidate!.id}, now);
    }
    async personalCommand(tx: Transaction, c: Character, cmd: Rules, now: number) {
        const lease = await tx.get<ActorLease>('actor_leases', c.id);
        const existing = lease?.kind === 'activity' ? await tx.get<Activity>('activities', lease.ownerId) : null;
        requireThat(!lease || existing?.type === 'personal', 'ACTOR_BUSY', '角色正在执行后台订单');
        if (existing && existing.actorId !== c.id && ['talent', 'resetTalents'].includes(cmd.type)) {
            await this.settleActivity(tx, existing, now);
            const leader = await owned(tx, c.accountId, existing.actorId);
            const shared = await this.personalContext(tx, leader, now);
            requireThat(!shared.combat && ['idle', 'hunt'].includes(shared.activity.type) && !shared.escort,
                'ACTOR_BUSY', '请先结束队伍当前战斗或活动，再调整天赋');
            c = await owned(tx, c.accountId, c.id);
            const selected = await context(tx, c, now, false);
            rebaseSimulation(selected, shared.clock);
            selected.wallAt = shared.wallAt;
            // Apply at the settled party time. A follower must not advance a second
            // simulation or replace/release the leader's activity and leases.
            const result = act(selected, cmd, selected.wallAt);
            const key = `command:${c.accountId}:${cmd.requestId}`;
            await persistCharacter(tx, c, result, result.wallAt, key, this.id);
            await invalidateCombatPlan(tx, existing);
            await tx.put('activities', existing);
            await economicEvent(tx, key, c.accountId, 'command', {characterId:c.id});
            return;
        }
        requireThat(!existing || existing.actorId === c.id, 'ACTOR_BUSY', '角色正在随队执行活动，请通过活动发起者操作');
        if (existing) {
            await this.settleActivity(tx, existing, now);
            c = await owned(tx, c.accountId, c.id);
        }
        let s = await this.personalContext(tx, c, now, true);
        if (cmd.type === 'recruit') {
            requireThat(c.kind === 'hero', 'PARTY_OWNER', '请切换到主角管理队友');
            const companions = await tx.list<Character>('characters', {accountId:c.accountId, kind:'companion'});
            if (cmd.replaceId) {
                const target = companions.find(member => member.id === cmd.replaceId);
                requireThat(target && s.party.some((member: Rules) => member.id === target.id), 'PARTY_TARGET', '请先让要更换的队友归队');
                await this.ensureFree(tx, target!.id);
                const reservations = await tx.list<Rules>('reservations', {accountId:c.accountId});
                requireThat(!reservations.some(row => [row.payerId,row.recipientId,row.actorId].includes(target!.id) && row.status === 'reserved'), 'ASSETS_RESERVED', '请先结算队友的制造订单');
            } else requireThat(companions.length < 4, 'PARTY_FULL', '最多拥有四名队友，请更换已有队友');
        }
        const beforeParty = new Set(s.party.map((p: Rules) => p.id));
        const action = { ...cmd };
        if (action.target && ['strategy', 'equip', 'equipBag'].includes(action.type)) {
            const target = s.party.find((p: Rules) => p.id === action.target);
            if (target)
                await owned(tx, c.accountId, target.id);
            else
                requireThat(action.target === c.id, 'FORBIDDEN', '不能控制其他账号的角色', 403);
        }
        if (action.type === 'learnProfession') {
            requireThat(c.kind !== 'companion' || Object.keys(s.professions).length < 2, 'PROFESSION_LIMIT', '每名队友最多学习两项生活职业');
            const main = professions.filter((p: Rules) => p.kind !== '副职业').map((p: Rules) => p.id);
            requireThat(!main.includes(action.id) || Object.keys(s.professions).filter(id => main.includes(id)).length < 2, 'PROFESSION_LIMIT', '每个角色最多学习两个主要专业');
        }
        let rewardKey: string | undefined, rewardPlan: Rules | undefined;
        if (action.type === 'turnin' || action.type === 'claimQuestReward') {
            action.type = 'turnin';
            const round = (s.completed[action.id] || 0) + 1;
            rewardKey = `quest:${c.id}:${action.id}:${round}`;
            if (!s.quests[action.id] && s.completed[action.id])
                return;
            requireThat(!await tx.get('reward_claims', rewardKey), 'ALREADY_CLAIMED', '已领取任务奖励');
            rewardPlan = questProgress(s, action.id)!;
        }
        s = act(s, action, now);
        const key = rewardKey || `command:${c.accountId}:${cmd.requestId}`;
        if (rewardPlan)
            await this.claimEquipmentRewards(tx, c, s, action, rewardPlan, now, key);
        if (action.type === 'equip' || action.type === 'recruit')
            await this.transferEquipment(tx, c, s);
        for (const member of s.party) {
            if (!beforeParty.has(member.id)) {
                const id = this.id();
                member.id = id;
                for (const item of Object.values(member.equipment) as Rules[])
                    item.ownerId = id;
                const state = { ...newState(member.name, member.classId, member.raceId || 1, this.seed(), now, id), ...member, party: [] };
                const recruit: Character = { id, accountId: c.accountId, kind: 'companion', rules: characterRules(state), professionReadyAt: {}, resourceReadyAt: {} };
                await tx.insert('characters', recruit);
                await tx.insert('companions', { id, characterId: id, accountId: c.accountId, ownerCharacterId: c.id, growthPolicy: 'companion' });
                await persistAssets(tx, recruit, state, key, this.id);
                const a = await account(tx, c.accountId), party = await tx.get<Party>('parties', a.partyId);
                party!.characterIds.push(id);
                await tx.put('parties', party!);
            }
            else
                await this.persistMember(tx, member, now, key, s);
        }
        await persistCharacter(tx, c, s, now, key, this.id);
        await this.trackPersonal(tx, c, s, now, existing?.id);
        if (rewardKey)
            await tx.insert('reward_claims', { id: rewardKey, businessKey: rewardKey, accountId: c.accountId, characterId: c.id, questId: action.id, round: s.completed[action.id], rewardGroup: 'personal' });
        await economicEvent(tx, key, c.accountId, rewardKey ? 'questReward' : 'command', { characterId: c.id });
    }
    async claimEquipmentRewards(tx: Transaction, actor: Character, s: Rules, action: Rules, plan: Rules, now: number, key: string) {
        const round = s.completed[action.id], definition = quests[action.id];
        const eligible = (member: Rules) => !definition.RequiredClasses || !!(definition.RequiredClasses & (1 << (member.classId - 1)));
        for (const member of [s, ...s.party]) {
            if (!eligible(member))
                continue;
            const claimId = `quest:${member.id}:${action.id}:${round}:equipment`;
            const isActor = member.id === actor.id;
            const rewards = [...plan.rewards, ...plan.choices.filter((item: Rules) => item.id === (isActor ? action.choice : action.rewardChoices?.[member.id] || action.choice))].filter((r: Rules) => [2, 4].includes(items[r.id]?.class) && (isActor || canEquip(member, items[r.id])));
            if (!rewards.length)
                continue;
            const existing = await tx.get('reward_claims', claimId);
            if (existing) {
                if (isActor)
                    for (const item of rewards)
                        takeItem(s, item.id, item.count);
                continue;
            }
            if (!isActor) {
                const recipient = await owned(tx, actor.accountId, member.id), recipientState = await context(tx, recipient, now, false);
                for (const reward of rewards)
                    receive(recipientState, reward.id, reward.count);
                await persistAssets(tx, recipient, recipientState, `${key}:equipment:${member.id}`, this.id);
            }
            await tx.insert('reward_claims', { id: claimId, businessKey: claimId, accountId: actor.accountId, characterId: member.id, questId: action.id, round, rewardGroup: 'equipment', rewards });
        }
    }
    async transferEquipment(tx: Transaction, actor: Character, s: Rules) {
        for (const member of [s, ...s.party])
            for (const item of Object.values(member.equipment) as Rules[]) {
                const row = await tx.get<Item>('items', item.uid);
                if (row && row.ownerCharacterId !== member.id) {
                    requireThat(row.accountId === actor.accountId, 'ASSET_OWNER', '装备归属无效');
                    await owned(tx, actor.accountId, member.id);
                    requireThat(!row.data.issued, 'BOUND_ITEM', '配发装备不能转移');
                    row.ownerCharacterId = member.id;
                    row.container = 'equipment';
                    await tx.put('items', row);
                }
            }
        for (const item of [...s.bag]) {
            const row = await tx.get<Item>('items', item.uid);
            if (!row || row.ownerCharacterId === actor.id)
                continue;
            requireThat(row.accountId === actor.accountId, 'ASSET_OWNER', '装备归属无效');
            if (item.ownerId && item.ownerId !== actor.id) {
                const owner = await owned(tx, actor.accountId, item.ownerId), ownerState = await context(tx, owner, this.now(), false);
                ownerState.bag.push(item);
                s.bag = s.bag.filter((i: Rules) => i.uid !== item.uid);
                row.container = 'bag';
                row.position = ownerState.bag.length;
                await tx.put('items', row);
            }
            else {
                row.ownerCharacterId = actor.id;
                row.container = 'bag';
                await tx.put('items', row);
            }
        }
    }
    async persistMember(tx: Transaction, member: Rules, now: number, key: string, shared?: Rules) {
        const c = await tx.get<Character>('characters', member.id);
        if (!c)
            return;
        const old = await context(tx, c, now, false);
        const replacing = member.recruitmentGeneration !== old.recruitmentGeneration;
        const base = replacing ? {...newState(member.name, member.classId, member.raceId, this.seed(), now, member.id),
            bag:old.bag, bags:old.bags, bank:old.bank, pending:old.pending, auctions:old.auctions, money:old.money,
            bankUpgrades:old.bankUpgrades, visited:old.visited} : old;
        const s = { ...base, ...member };
        if (shared) {
            s.clock = shared.clock;
            s.wallAt = shared.wallAt;
            s.location = shared.location;
            for (const timer of ['nextTick', 'nextRegen']) {
                const period = timer === 'nextTick' ? 100 : 2000;
                s[timer] = shared[timer] ?? (s[timer] + Math.max(0, Math.floor((shared.clock - s[timer]) / period) + 1) * period);
            }
            if (!s.visited.includes(s.location))
                s.visited.push(s.location);
        }
        await persistCharacter(tx, c, s, s.wallAt, key, this.id);
    }
    async trackPersonal(tx: Transaction, c: Character, s: Rules, now: number, existingId?: string) {
        const active = !!s.combat || !['idle', 'dead'].includes(s.activity.type) || !!s.rest;
        let a = existingId ? await tx.get<Activity>('activities', existingId) : null;
        if (a) await invalidateCombatPlan(tx, a);
        if (!active) {
            if (a) {
                a.status = 'completed';
                a.settledUntil = now;
                await tx.put('activities', a);
                for (const id of a.participantIds || [c.id])
                    await this.release(tx, id, a.id);
            }
            return;
        }
        if (!a || a.status !== 'running') {
            a = { id: this.id(), accountId: c.accountId, actorId: c.id, type: 'personal', status: 'running', location: s.location, startedAt: now, settledUntil: now, nextEventAt: now + 1000, contentVersion: this.contentVersion, rngState: s.rngState, engineActivity: clone(s.activity), participantIds: [c.id, ...s.party.map((p: Rules) => p.id)] };
            for (const id of a.participantIds!) {
                await this.lock(tx, await owned(tx, c.accountId, id), 'activity', a.id);
            }
        }
        a.rngState = s.rngState;
        a.engineActivity = clone(s.activity);
        a.nextEventAt = now + simulationInterval(s.combat, (await account(tx, c.accountId)).lastSeenAt, now);
        await tx.put('activities', a);
    }
    startActivity = startActivity;
    recall = recall;
    restoreReservation = restoreReservation;
    settleActivity = settleActivity;
    createInstance = createInstance;
    instanceFor = instanceFor;
    joinInstance = joinInstance;
    startInstance = startInstance;
    bumpInstanceAccounts = bumpInstanceAccounts;
    instanceCommand = instanceCommand;
    persistInstance = persistInstance;
    leaveInstance = leaveInstance;
    hireMercenary = hireMercenary;
    acquireInstanceLease = acquireInstanceLease;
    advanceInstance = advanceInstance;
    async work(now = this.now(), limit = 50) {
        requireThat(Number.isSafeInteger(now) && Number.isInteger(limit) && limit > 0, 'WORK', '无效的调度参数', 400);
        const pending = await this.store.transaction(async (tx) => ({ activities: await tx.due<Activity>('activities', now, limit), instances: await tx.due<Instance>('instances', now, limit) }));
        const result: {
            activities: number;
            instances: number;
            errors: {
                id: string;
                message: string;
            }[];
        } = { activities: 0, instances: 0, errors: [] };
        for (const selected of pending.activities)
            try {
                await this.store.transaction(async (tx) => { const activity = await tx.get<Activity>('activities', selected.id); if (activity)
                    await this.settleActivity(tx, activity, now); });
                await this.prepareCombatPlan('activities', selected.id, now);
                result.activities++;
            }
            catch (error) {
                result.errors.push({ id: selected.id, message: (error as Error).message });
            }
        const workerId = 'worker:' + this.id();
        for (const instance of pending.instances)
            try {
                const lease = await this.acquireInstanceLease(instance.id, workerId, now);
                if (await this.advanceInstance(instance.id, workerId, lease.epoch, now))
                    result.instances++;
                await this.store.transaction(async (tx) => { const current = await tx.get<InstanceLease>('instance_leases', instance.id); if (current?.workerId === workerId) {
                    current.expiresAt = now;
                    await tx.put('instance_leases', current);
                } });
                await this.prepareCombatPlan('instances', instance.id, now);
            }
            catch (error) {
                if ((error as DomainError).code !== 'LEASE_HELD')
                    result.errors.push({ id: instance.id, message: (error as Error).message });
            }
        return result;
    }
    async deliverOutbox(consumerId: string, deliver: (event: Rules) => Promise<void>, limit = 50) { const events = await this.store.transaction(tx => tx.list<Rules>('outbox')); let delivered = 0; for (const event of events) {
        if (delivered >= limit)
            break;
        const key = `${consumerId}:${event.id}`;
        if (await this.store.transaction(tx => tx.get('inbox', key)))
            continue;
        await deliver(event);
        await this.store.transaction(async (tx) => { if (!await tx.get('inbox', key))
            await tx.insert('inbox', { id: key, consumerId, eventId: event.id }); });
        delivered++;
    } return delivered; }
}
