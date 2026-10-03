import {applyContentPhase} from './content-release.ts';
import {residentStore} from './resident-store.ts';
import {applyGmBuffs} from './gm-buffs.ts';
import {claimMail,mailInbox,resolveMailRecipientInView,validateMailDraft,commitMailSend} from './mail.ts';
import {experienceMultiplier, applyExperienceBuff} from './rules/experience.js';
import {advancePersonal, advanceInstance} from './background-simulation.ts';
import {talentSummary} from './rules/talent-summary.js';
import {listSaves,resolveSave,createSave,deleteSave} from './saves.ts';
import { createInstance, instanceFor, joinInstance, startInstance, bumpInstanceAccounts, instanceCommand, persistInstance, leaveInstance, acquireInstanceLease } from './instances.ts';
import { startActivity, recall, restoreReservation, settleActivity } from './activities.ts';
import { randomUUID, randomBytes } from 'node:crypto';
import { removeInvalidSave } from './account-reset.ts';
import { unstuck, recoverExpiredActivities } from './unstuck.ts';
import { validAccountPresence } from './context.ts';
import {simulationInterval} from './simulation-cadence.ts';
import {prepareCombatPlan, combatRecording, invalidateCombatPlan, combatExecutionMode} from './combat-execution.ts';
import type { Account } from './model.ts';
import { act, advance, quietIdle } from './rules/engine.js';
import { refreshPresence, offlineLimit, recordPresence, activityDeadline, instanceDeadline } from './presence.ts';
import { receive,putInBag } from './rules/inventory.js';
import { canEquip, takeItem, bagCapacity } from './rules/character.js';
import { transferItems } from './item-transfer.ts';
import { items, quests } from './rules/catalog.js';
import { questProgress } from './rules/quests.js';
import {DatabaseBusyError, DatabaseOperationError} from '../../persistence/src/store.ts';
import type { Store, ReadView, Transaction } from '../../persistence/src/store.ts';
import { DomainError, requireThat } from './model.ts';
import type { Character, Party, Activity, Rules, ActorLease, Instance, InstanceLease, Item } from './model.ts';
import { account, presence, owned, bump, context, newState, characterRules, persistCharacter, persistAssets, economicEvent, clone, rebaseSimulation } from './context.ts';
type Options = {
    contentVersion: string;
    now?: () => number;
    id?: () => string;
    seed?: () => number;
    offlineLimitMs?: number;
    xpMultiplier?: number;
};
export class GameService {
    async mailInbox(accountId:string,actorId?:string){
        if(!actorId)actorId=await this.store.read(async tx=>(await account(tx,accountId)).primaryCharacterId);
        return mailInbox(this.store,accountId,actorId);
    }
    listSaves = listSaves;
    resolveSave = resolveSave;
    createSave = createSave;
    deleteSave = deleteSave;
    prepareCombatPlan = prepareCombatPlan;
    combatRecording = combatRecording;
    store: Store;
    contentVersion: string;
    now: () => number;
    id: () => string;
    seed: () => number;
    offlineLimitMs: number;
    readonly xpMultiplier: number;
    recordPresence = recordPresence;
    refreshPresence = refreshPresence;
    activityDeadline = activityDeadline;
    instanceDeadline = instanceDeadline;
    constructor(store: Store, options: Options) { this.xpMultiplier = experienceMultiplier(options.xpMultiplier); this.offlineLimitMs = offlineLimit(options.offlineLimitMs); this.store = residentStore(store); this.contentVersion = options.contentVersion; this.now = options.now || Date.now; this.id = options.id || randomUUID; this.seed = options.seed || (() => randomBytes(4).readUInt32LE(0) || 1); }
    async createAccount(accountId: string, input: {
        name: string;
        classId: number;
        raceId: number;
        gender?: 'male' | 'female';
    }, requestId: string) {
        this.request(requestId);
        await this.store.transaction(async (tx) => {
            const existing = await tx.get<Account>('accounts', accountId);
            if (existing && !validAccountPresence(await tx.get('account_presence', accountId))) await removeInvalidSave(tx, accountId);
            const previous = await tx.get<Rules>('receipts', `${accountId}:${requestId}`); if (previous) {
            requireThat(previous.fingerprint === JSON.stringify({ type: 'createAccount', ...input }), 'REQUEST_REUSED', 'requestId 已被其他命令使用');
            return;
        } requireThat(!await tx.get('accounts', accountId), 'EXISTS', '账号已有主角'); const now = this.now(), id = this.id(), partyId = this.id(); const s = newState(input.name, input.classId, input.raceId, this.seed(), now, id, input.gender); const c: Character = { id, accountId, kind: 'hero', rules: characterRules(s), professionReadyAt: {}, resourceReadyAt: {} }; await tx.insert('accounts', { id: accountId, primaryCharacterId: id, partyId, revision: 1, createdAt: now }); await tx.insert('account_presence', {id:accountId, accountId, lastSeenAt:now}); await tx.insert('characters', c); await tx.insert('parties', { id: partyId, accountId, characterIds: [id] }); await persistAssets(tx, c, s, `create:${accountId}`); await this.receipt(tx, accountId, requestId, { type: 'createAccount', ...input }); });
        return this.snapshot(accountId);
    }
    request(id: unknown) { requireThat(typeof id === 'string' && id.length > 0 && id.length <= 160, 'INVALID_REQUEST', '需要有效的 requestId', 400); }
    async receipt(tx: Transaction, accountId: string, requestId: string, command: Rules) { await tx.insert('receipts', { id: `${accountId}:${requestId}`, accountId, requestId, fingerprint: JSON.stringify(command), createdAt: this.now() }); }
    async snapshot(accountId: string, characterId?: string, online = false) {
        await recoverExpiredActivities.call(this, accountId);
        if (online) await this.refreshPresence(accountId);
        const readSnapshot = () => this.store.read(async (tx) => {
            const a = await account(tx, accountId);
            await presence(tx, accountId);
            let c = await owned(tx, accountId, characterId || a.primaryCharacterId);
            const now = this.now();
            const lease = await tx.get<ActorLease>('actor_leases', c.id);
            const instance = lease?.kind === 'instance' ? await tx.get<Instance>('instances', lease.ownerId) : null;
            const activity = lease?.kind === 'activity' ? await tx.get<Activity>('activities', lease.ownerId) : null;
            let state = await this.personalContext(tx, c, now);
            const recovering: string[] = [];
            if (!lease) {
                for (const member of [state, ...state.party]) {
                    if (await tx.get<ActorLease>('actor_leases', member.id)) continue;
                    if (await tx.get('simulation_characters', member.id)) continue;
                    const current = await context(tx, await owned(tx, accountId, member.id), now, false);
                    if (!current.combat && !quietIdle(current) && now-current.wallAt >= current.nextRegen-current.clock)
                        recovering.push(member.id);
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
            // Free characters do not tick while idle. Expose the effective market
            // clock without mutating or persisting a read-only snapshot.
            state.marketClock = !lease ? state.clock + Math.max(0, now - state.wallAt) : state.clock;
            // Views show the current wall-time window even when an idle simulation
            // has no reason to tick. This projection never persists into simulation.
            await applyContentPhase(tx,state);
            await applyGmBuffs(tx,state,accountId,instance?new Map(instance.roster.map(row=>[row.characterId,row.accountId])):undefined,now);
            const roster = await Promise.all((await tx.list<Character>('characters', { accountId })).map(async row => {
                const inventory = await context(tx, row, now, false);
                return { id: row.id, characterId: row.id, name: row.rules.name, classId: row.rules.classId, raceId: row.rules.raceId, gender: row.rules.gender, level: row.rules.level, kind: row.kind, talentSummary: talentSummary(row.rules), professions: row.rules.professions,
                    bagUsed:inventory.bag.length, bagCapacity:bagCapacity(inventory), location:inventory.location };
            }));
            const activities = await tx.list<Activity>('activities', { accountId });
            const owner = instance || activity;
            return { recovering, state, revision: a.revision, account: a, roster, activities, combatMode: owner && state.combat ? combatExecutionMode(owner, state) : null, playback: owner?.playback ?? null, instanceId: instance?.id || null, instance: instance ? { id: instance.id, leaderId: instance.leaderId, contentId: instance.contentId, status: instance.status, capacity: instance.capacity, roster: instance.roster, sequence: instance.sequence, epoch: instance.epoch } : null };
        });
        let result = await readSnapshot();
        if (result.recovering.length) {
            try {
                await this.store.transaction(async tx => {
                    const now = this.now();
                    let changed = false;
                    for (const id of result.recovering) {
                        if (await tx.get('actor_leases', id)) continue;
                        if (await tx.get('simulation_characters', id)) continue;
                        const c = await owned(tx, accountId, id), current = await context(tx, c, now, false);
                        if (current.combat || quietIdle(current) || now-current.wallAt < current.nextRegen-current.clock) continue;
                        const next = advance(current, now).state;
                        await persistCharacter(tx, c, next, next.wallAt, `recovery:${id}:${next.wallAt}`);
                        changed = true;
                    }
                    if (changed) await bump(tx, accountId);
                }, {attempts:1});
            } catch (error) {
                // Regeneration is not a reason to fail an otherwise valid poll.
                // Nothing committed; a later poll retries from authoritative state.
                if (!(error instanceof DatabaseBusyError)) throw error;
            }
            result = await readSnapshot();
        }
        const {recovering, ...snapshot} = result;
        return snapshot;
    }
    member(s: Rules) { const { party, bank, auctions, activity, combat, lastCombat, dungeon, receipts, ...member } = s; return member; }
    async personalContext(tx: ReadView, c: Character, now: number, settleFree = false) {
        let s = await context(tx, c, now);
        const ownLease = await tx.get<ActorLease>('actor_leases', c.id);
        const activity = ownLease?.kind === 'activity' ? await tx.get<Activity>('activities', ownLease.ownerId) : null;
        const xpRate = activity?.xpMultiplier ?? this.xpMultiplier;
        applyExperienceBuff(s, xpRate);
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
            let member = applyExperienceBuff(await context(tx, other, now, false), xpRate);
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
        const receiptCommand=command;
        if (command.type !== 'unstuck') await recoverExpiredActivities.call(this, accountId);
        const selectedLease = await this.store.read(async tx => {
            const a = await account(tx, accountId);
            const c = await owned(tx, accountId, command.characterId || a.primaryCharacterId);
            return tx.get<ActorLease>('actor_leases', c.id);
        });
        // Recovery must not depend on reconnect/catch-up of the broken activity.
        const presenceCheckedAt = this.now();
        if (command.type !== 'unstuck') await this.refreshPresence(accountId);
        // Presence heartbeats use a separate short transaction. Keep their rows
        // out of the long SERIALIZABLE instance command transaction.
        const observedPresence = selectedLease?.kind === 'instance' && command.type !== 'unstuck'
            ? await this.store.read(async tx => {
                const instance = await tx.get<Instance>('instances', selectedLease.ownerId);
                const observed = new Map<string, number>();
                for (const id of new Set(instance?.roster.filter(r => r.controller !== 'npc').map(r => r.accountId) || []))
                    observed.set(id, (await presence(tx, id)).lastSeenAt);
                return observed;
            }) : undefined;
        try {
            await this.store.transaction(async (tx) => {
                const a = await account(tx, accountId);
                const old = await tx.get<Rules>('receipts', `${accountId}:${command.requestId}`);
                if (old) {
                    requireThat(old.fingerprint === JSON.stringify(receiptCommand), 'REQUEST_REUSED', 'requestId 已被其他命令使用');
                    return;
                }
                const action=command;
                const now = this.now();
                // Polling heartbeats update account_presence frequently. Reading it in
                // every long command transaction makes raid writes repeatedly fail
                // SERIALIZABLE with 40001. Only reconnect if the time since the
                // preflight heartbeat could have crossed the offline cutoff.
                const commandPresence = observedPresence && new Map(observedPresence);
                if (action.type !== 'unstuck' && now - presenceCheckedAt >= this.offlineLimitMs - Math.min(1000, this.offlineLimitMs / 4)) {
                    await this.recordPresence(tx, accountId, now);
                    commandPresence?.set(accountId, now);
                }
                const c = await owned(tx, accountId, action.characterId || a.primaryCharacterId);
                const lease = await tx.get<ActorLease>('actor_leases', c.id);
                if (action.type === 'unstuck')
                    await unstuck.call(this, tx, c, now, action.requestId);
                else if (action.type === 'transferItems')
                    await transferItems.call(this, tx, c, action, now);
                else if (action.type === 'setParty') {
                    requireThat(Array.isArray(action.characterIds) && action.characterIds.length >= 1 && action.characterIds.length <= 40 && new Set(action.characterIds).size === action.characterIds.length, 'PARTY', '队伍名册无效', 400);
                    const previous = await tx.get<Party>('parties', a.partyId);
                    for (const id of new Set([c.id, ...previous?.characterIds || [], ...action.characterIds])) {
                        await owned(tx, accountId, id);
                        await this.ensureFree(tx, id);
                    }
                    await tx.put('parties', { id: a.partyId, accountId, characterIds: action.characterIds });
                }
                else if (action.type === 'recall')
                    await this.recall(tx, accountId, action.activityId, now);
                else if (action.type === 'createInstance' || action.type === 'enterDungeon')
                    await this.createInstance(tx, c, action, now);
                else if (action.type === 'joinInstance')
                    await this.joinInstance(tx, c, action, now);
                else if (action.type === 'startInstance')
                    await this.startInstance(tx, c, action, now);
                else if (action.type === 'leaveInstance' || action.type === 'leaveDungeon')
                    await this.leaveInstance(tx, c, action.instanceId || lease?.ownerId, now);
                else if (lease?.kind === 'instance')
                    await this.instanceCommand(tx, c, lease.ownerId, action, now, commandPresence);
                else if (['startActivity', 'gatherResource', 'gatherAll', 'craft'].includes(action.type))
                    await this.startActivity(tx, c, action, now);
                else if (action.type === 'stop' && lease?.kind === 'activity') {
                    const activity = await tx.get<Activity>('activities', lease.ownerId);
                    if (activity?.type !== 'personal')
                        await this.recall(tx, accountId, lease.ownerId, now);
                    else
                        await this.personalCommand(tx, c, action, now);
                }
                else
                    await this.personalCommand(tx, c, action, now);
                await this.receipt(tx, accountId, command.requestId, receiptCommand);
                await bump(tx, accountId);
            });
        }
        catch (error) {
            if (error instanceof DomainError || error instanceof DatabaseOperationError)
                throw error;
            throw new DomainError('RULE_REJECTED', error instanceof Error ? error.message : '操作失败', 400);
        }
        return this.snapshot(accountId, command.characterId);
    }
    async personalCommand(tx: Transaction, c: Character, cmd: Rules, now: number) {
        const lease = await tx.get<ActorLease>('actor_leases', c.id);
        const existing = lease?.kind === 'activity' ? await tx.get<Activity>('activities', lease.ownerId) : null;
        requireThat(!lease || existing?.type === 'personal', 'ACTOR_BUSY', '角色正在执行后台订单');
        if (existing && existing.actorId !== c.id && ['talent', 'resetTalents', 'claimMail', 'sendMail'].includes(cmd.type)) {
            await this.settleActivity(tx, existing, now);
            const leader = await owned(tx, c.accountId, existing.actorId);
            const shared = await this.personalContext(tx, leader, now);
            requireThat(['claimMail','sendMail'].includes(cmd.type)||(!shared.combat && ['idle', 'hunt'].includes(shared.activity.type) && !shared.escort),
                'ACTOR_BUSY', '请先结束队伍当前战斗或活动，再调整天赋');
            c = await owned(tx, c.accountId, c.id);
            const selected = await context(tx, c, now, false);
            rebaseSimulation(selected, shared.clock);
            selected.wallAt = shared.wallAt;
            // Apply at the settled party time. A follower must not advance a second
            // simulation or replace/release the leader's activity and leases.
            const action={...cmd};
            if(action.type==='sendMail'){
                validateMailDraft(action);
                const recipient=await resolveMailRecipientInView(tx,action.recipient,c.id);
                Object.assign(action,{recipientId:recipient.id,recipientAccountId:recipient.accountId,recipientName:recipient.name});
            }
            const result = action.type==='claimMail'?await claimMail(tx,c,selected,action.id,now):act(selected, action, selected.wallAt);
            const key = `command:${c.accountId}:${cmd.requestId}`;
            if(action.type==='sendMail')await commitMailSend(tx,{accountId:c.accountId,input:{actorId:c.id,requestId:cmd.requestId,command:action}},c,now);
            await persistCharacter(tx, c, result, result.wallAt, key);
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
        const action = { ...cmd };
        if(action.type==='sendMail'){
            validateMailDraft(action);
            const recipient=await resolveMailRecipientInView(tx,action.recipient,c.id);
            Object.assign(action,{recipientId:recipient.id,recipientAccountId:recipient.accountId,recipientName:recipient.name});
        }
        if (action.target && ['strategy', 'pvpConfigure', 'equip', 'equipBag'].includes(action.type)) {
            const target = s.party.find((p: Rules) => p.id === action.target);
            if (target)
                await owned(tx, c.accountId, target.id);
            else
                requireThat(action.target === c.id, 'FORBIDDEN', '不能控制其他账号的角色', 403);
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
        s = action.type==='claimMail'?await claimMail(tx,c,s,action.id,now):act(s, action, now, {equipmentTargetId: action.type==='equip'?action.target:null});
        const key = rewardKey || `command:${c.accountId}:${cmd.requestId}`;
        if (rewardPlan)
            await this.claimEquipmentRewards(tx, c, s, action, rewardPlan, now, key);
        if (action.type === 'equip')
            await this.transferEquipment(tx, c, s);
        if(action.type==='sendMail')await commitMailSend(tx,{accountId:c.accountId,input:{actorId:c.id,requestId:cmd.requestId,command:action}},c,now);
        for (const member of s.party) await this.persistMember(tx, member, now, key, s);
        await persistCharacter(tx, c, s, now, key);
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
                await owned(tx, actor.accountId, member.id);
                // Persist this same updated member below; a second stale copy
                // would overwrite the granted equipment during party persistence.
                for (const reward of rewards) receive(member, reward.id, reward.count);
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
                putInBag(ownerState,item);
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
        const s: Rules = { ...old, ...member, bags:old.bags };
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
        await persistCharacter(tx, c, s, s.wallAt, key);
    }
    async trackPersonal(tx: Transaction, c: Character, s: Rules, now: number, existingId?: string) {
        const active = !!s.combat || !['idle', 'dead'].includes(s.activity.type) || !!s.rest;
        let a = existingId ? await tx.get<Activity>('activities', existingId) : null;
        if (a) { await invalidateCombatPlan(tx, a); }
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
            a = { id: this.id(), accountId: c.accountId, actorId: c.id, type: 'personal', xpMultiplier: this.xpMultiplier, status: 'running', location: s.location, startedAt: now, settledUntil: now, nextEventAt: now + 1000, contentVersion: this.contentVersion, rngState: s.rngState, engineActivity: clone(s.activity), participantIds: [c.id, ...s.party.map((p: Rules) => p.id)] };
            for (const id of a.participantIds!) {
                await this.lock(tx, await owned(tx, c.accountId, id), 'activity', a.id);
            }
        }
        a.rngState = s.rngState;
        a.engineActivity = clone(s.activity);
        // An authenticated command is itself proof of online activity. Avoid
        // reading the frequently updated presence row in this long transaction.
        a.nextEventAt = now + simulationInterval(s.combat, now, now);
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
    acquireInstanceLease = acquireInstanceLease;
    advanceInstance = advanceInstance;
    async work(now = this.now(), limit = 50) {
        requireThat(Number.isSafeInteger(now) && Number.isInteger(limit) && limit > 0, 'WORK', '无效的调度参数', 400);
        // Filter before LIMIT and before loading large simulation JSON or taking
        // leases. Incompatible activities cannot advance, and retrying them on
        // every worker tick causes a database/log storm after a deployment.
        // An older worker in a rolling deployment also cannot pause newer jobs.
        const pending = await this.store.read(async (tx) => ({ activities: await tx.due<Activity>('activities', now, limit, this.contentVersion), instances: await tx.due<Instance>('instances', now, limit, this.contentVersion) }));
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
                const committed = selected.type === 'personal'
                    ? await advancePersonal.call(this, selected.id, now)
                    : await this.store.transaction(async tx => {
                        const activity = await tx.get<Activity>('activities', selected.id);
                        if (!activity || !['running','returning'].includes(activity.status) || activity.nextEventAt > now) return false;
                        await this.settleActivity(tx, activity, now);
                        return true;
                    });
                if (committed) result.activities++;
                await this.prepareCombatPlan('activities', selected.id, now);
            }
            catch (error) {
                if (!(error instanceof DatabaseBusyError)) result.errors.push({ id: selected.id, message: (error as Error).message });
            }
        const workerId = 'worker:' + this.id();
        for (const instance of pending.instances)
            try {
                const lease = await this.acquireInstanceLease(instance.id, workerId, now);
                try {
                    if (await this.advanceInstance(instance.id, workerId, lease.epoch, now)) result.instances++;
                } finally {
                    await this.store.transaction(async tx => {
                        const current = await tx.get<InstanceLease>('instance_leases', instance.id);
                        if (current?.workerId === workerId && current.epoch === lease.epoch) {
                            current.expiresAt = now;
                            await tx.put('instance_leases', current);
                        }
                    }, {attempts:1});
                }
                await this.prepareCombatPlan('instances', instance.id, now);
            }
            catch (error) {
                if (!(error instanceof DatabaseBusyError) && (error as DomainError).code !== 'LEASE_HELD')
                    result.errors.push({ id: instance.id, message: (error as Error).message });
            }
        return result;
    }
    async deliverOutbox(consumerId: string, deliver: (event: Rules) => Promise<void>, limit = 50) { const events = await this.store.read(tx => tx.list<Rules>('outbox')); let delivered = 0; for (const event of events) {
        if (delivered >= limit)
            break;
        const key = `${consumerId}:${event.id}`;
        if (await this.store.read(tx => tx.get('inbox', key)))
            continue;
        await deliver(event);
        await this.store.transaction(async (tx) => { if (!await tx.get('inbox', key))
            await tx.insert('inbox', { id: key, consumerId, eventId: event.id }); });
        delivered++;
    } return delivered; }
}
