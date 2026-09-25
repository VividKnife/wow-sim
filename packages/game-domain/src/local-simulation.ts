import {createHash} from 'node:crypto';
import type {ReadView, Transaction} from '../../persistence/src/store.ts';
import type {GameService} from './service.ts';
import {requireThat, type Activity, type Instance, type ActorLease, type Rules} from './model.ts';
import {account, owned, persistCharacter, bump, economicEvent} from './context.ts';
import {invalidateCombatPlan} from './combat-execution.ts';
import {PAUSED_EVENT_AT} from './presence.ts';

export type LocalSession = {id:string; clientId:string; expiresAt:number; sequence:number; lastSeenAt:number; receiptId?:string};
export const LOCAL_LEASE_MS = 30_000;
type Owner = Activity | Instance;
export function localEligible(owner: Owner | null | undefined) {
    if(owner && 'roster' in owner && owner.roster.some(r=>r.controller==='npc'))return false;
    return !!owner && !('simulation' in owner && owner.simulation?.goldRaid?.active) && owner.status === 'running' && ('roster' in owner
        ? new Set(owner.roster.filter(r => r.controller !== 'mercenary').map(r => r.accountId)).size === 1
        : owner.type === 'personal');
}
export function localManifest(owner: Owner | null | undefined) {
    return localEligible(owner) ? {ownerId:owner!.id, sessionId:owner!.localSimulation?.id || null} : null;
}
async function ownerFor(service: GameService, tx: ReadView, accountId: string, characterId?: string) {
    const a = await account(tx, accountId), c = await owned(tx, accountId, characterId || a.primaryCharacterId);
    const lease = await tx.get<ActorLease>('actor_leases', c.id);
    const table = lease?.kind === 'instance' ? 'instances' : 'activities';
    const owner = lease ? await tx.get<Owner>(table, lease.ownerId) : null;
    requireThat(owner && localEligible(owner), 'LOCAL_UNAVAILABLE', '此活动当前不能在本地推进');
    requireThat(('roster' in owner ? owner.creatorAccountId : owner.accountId) === accountId, 'FORBIDDEN', '不能接管其他账号的活动', 403);
    return {owner, table, c} as const;
}
async function stateFor(service: GameService, tx: ReadView, owner: Owner) {
    return 'roster' in owner ? structuredClone(owner.simulation!) : service.personalContext(tx, await owned(tx, owner.accountId, owner.actorId), owner.settledUntil);
}
export function resetLocalSession(owner: Owner) {
    if (owner.localSimulation) {
        // Commands fence in-flight browser results. The next claim creates a fresh token.
        owner.localSimulation = {id:'',clientId:'',expiresAt:0,sequence:0,lastSeenAt:owner.localSimulation.lastSeenAt,receiptId:owner.localSimulation.receiptId};
    }
}
export async function guardLocalCommand(service: GameService, tx: ReadView, cId:string, cmd:Rules, now:number) {
    const lease = await tx.get<ActorLease>('actor_leases', cId);
    const owner = lease ? await tx.get<Owner>(lease.kind === 'instance' ? 'instances' : 'activities', lease.ownerId) : null;
    const local = owner?.localSimulation;
    if (!local || cmd.type === 'unstuck') return;
    // A finished or released browser session has no owner. Keep the tombstone
    // to fence late checkpoints, but allow a fresh command without credentials.
    if (!local.id && !cmd.localSessionId && !cmd.localClientId) return;
    requireThat(local.expiresAt <= now || local.clientId === cmd.localClientId, 'LOCAL_HELD', '此角色正在另一个页面中冒险，请先在该页面暂停或关闭它');
    requireThat(cmd.localSessionId === local.id && cmd.localClientId === local.clientId, 'LOCAL_SYNC_REQUIRED', '请先同步本地冒险进度后再操作');
}

export async function localSimulation(this: GameService, accountId:string, input:Rules) {
    this.request(input.requestId);
    requireThat(typeof input.clientId === 'string' && input.clientId.length > 0 && input.clientId.length <= 100, 'LOCAL_CLIENT', '本地会话标识无效', 400);
    requireThat(input.contentVersion === this.contentVersion, 'CONTENT_VERSION', '游戏规则已更新，请刷新页面', 409);
    requireThat(['claim','checkpoint','release'].includes(input.type), 'LOCAL_ACTION', '本地操作无效', 400);
    // A hash bounds receipt storage even for a large checkpoint. Retrying after a
    // lost response returns exactly the canonical IDs from the first commit.
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.store.transaction(async tx => {
        const receiptId = `${accountId}:local:${input.requestId}`;
        const previous = await tx.get<Rules>('receipts', receiptId);
        if (previous) {
            requireThat(previous.fingerprint === fingerprint, 'REQUEST_REUSED', 'requestId 已被其他命令使用');
            return previous.result;
        }
        const now = this.now();
        const {owner, table} = await ownerFor(this, tx, accountId, input.characterId);
        requireThat(owner.contentVersion === this.contentVersion, 'CONTENT_VERSION', '此活动的规则版本已过期，请重新创建开发存档');
        requireThat(input.ownerId === owner.id, 'LOCAL_STALE', '活动已更新，请重新同步');
        const local = owner.localSimulation;
        if (input.type === 'release') {
            requireThat(local && local.id === input.sessionId && local.clientId === input.clientId, 'LOCAL_STALE', '本地执行权已更新，请重新同步');
            resetLocalSession(owner);
            owner.nextEventAt = PAUSED_EVENT_AT;
            owner.localSimulation!.receiptId = receiptId;
            await tx.put(table, owner);
            await bump(tx, accountId);
            const result = {released:true, serverNow:now};
            await tx.insert('receipts', {id:receiptId, accountId, fingerprint, result, createdAt:now});
            if (local.receiptId) await tx.delete('receipts', local.receiptId);
            return result;
        }
        let state = await stateFor(this, tx, owner);
        if (input.type === 'claim') {
            requireThat(!local || local.clientId === input.clientId || local.expiresAt <= now, 'LOCAL_HELD', '此角色正在另一个页面中冒险，请先在该页面暂停或关闭它');
            // Presence polls cannot extend a suspended browser's offline allowance.
            const lastSeen = local?.lastSeenAt ?? (await tx.get<Rules>('account_presence', accountId))!.lastSeenAt;
            const skipped = Math.max(0, now - Math.max(lastSeen, state.wallAt) - this.offlineLimitMs);
            state.wallAt += skipped;
            await invalidateCombatPlan(tx, owner);
            owner.localSimulation = {id:this.id(), clientId:input.clientId, expiresAt:now+LOCAL_LEASE_MS, sequence:0, lastSeenAt:now};
            if ('roster' in owner) {
                owner.simulation = state;
                owner.sequence++;
            } else if (skipped) {
                for (const id of owner.participantIds || [owner.actorId]) {
                    const c = await owned(tx, accountId, id);
                    c.rules.wallAt += skipped;
                    await tx.put('characters', c);
                }
                owner.settledUntil += skipped;
            }
        } else {
            requireThat(local && local.id === input.sessionId && local.clientId === input.clientId, 'LOCAL_STALE', '本地执行权已更新，请重新同步');
            requireThat(Number.isSafeInteger(input.sequence) && input.sequence === local.sequence+1, 'LOCAL_SEQUENCE', '检查点顺序无效');
            const next = input.state;
            validateCheckpoint(state, next, Math.min(now, local.lastSeenAt+this.offlineLimitMs));
            state = structuredClone(next);
            const key = `local:${owner.id}:${local.id}:${input.sequence}`;
            if ('roster' in owner) {
                owner.simulation = state;
                owner.rngState = state.rngState;
                owner.sequence++;
                await this.persistInstance(tx, owner, now, key);
            } else {
                const c = await owned(tx, accountId, owner.actorId);
                await persistCharacter(tx, c, state, state.wallAt, key, this.id);
                for (const member of state.party) await this.persistMember(tx, member, state.wallAt, key, state);
                owner.rngState = state.rngState;
                owner.engineActivity = structuredClone(state.activity);
                owner.settledUntil = state.wallAt;
                if (!state.combat && ['idle','dead'].includes(state.activity.type) && !state.rest) {
                    owner.status = 'completed';
                    for (const id of owner.participantIds || [owner.actorId]) await this.release(tx, id, owner.id);
                }
                await economicEvent(tx, key, accountId, 'localCheckpoint', {ownerId:owner.id, sequence:input.sequence});
            }
            owner.localSimulation = {...local, sequence:input.sequence, expiresAt:now+LOCAL_LEASE_MS, lastSeenAt:now};
        }
        owner.nextEventAt = PAUSED_EVENT_AT;
        delete owner.resumeEventAt;
        await tx.put(table, owner);
        await bump(tx, accountId);
        // Re-read personal assets: newly looted item IDs are assigned on commit.
        state = await stateFor(this, tx, owner);
        const oldReceipt = local?.receiptId;
        owner.localSimulation!.receiptId = receiptId;
        const result = {ownerId:owner.id, session:owner.localSimulation, state, serverNow:now,
            contentVersion:this.contentVersion, deadline:now+this.offlineLimitMs, active:owner.status === 'running'};
        await tx.insert('receipts', {id:receiptId, accountId, fingerprint, result, createdAt:now});
        // Keep only the last response per client/owner; there is one checkpoint in flight.
        if (oldReceipt && oldReceipt !== receiptId) await tx.delete('receipts', oldReceipt);
        if (owner.status !== 'running') delete owner.localSimulation;
        await tx.put(table, owner);
        return result;
    });
}

function validateCheckpoint(previous:Rules, next:Rules, until:number) {
    requireThat(next && typeof next === 'object' && !Array.isArray(next), 'LOCAL_STATE', '检查点状态无效', 400);
    requireThat(next.id === previous.id && Array.isArray(next.party) && next.party.length === previous.party.length &&
        next.party.every((p:Rules,i:number) => p?.id === previous.party[i].id), 'LOCAL_ROSTER', '检查点参战者不一致', 400);
    requireThat([next,...next.party].every((actor:Rules,i:number) => JSON.stringify(actor.serverBuffs || []) === JSON.stringify([previous,...previous.party][i].serverBuffs || [])), 'LOCAL_STATE', '经验增益由服务器配置，请重新同步', 400);
    requireThat(Number.isSafeInteger(next.wallAt) && next.wallAt >= previous.wallAt && next.wallAt <= until &&
        Number.isSafeInteger(next.clock) && next.clock>=previous.clock && Number.isSafeInteger(next.commandPausedMs||0) && (next.commandPausedMs||0)>=(previous.commandPausedMs||0) && next.clock-previous.clock+(next.commandPausedMs||0)-(previous.commandPausedMs||0) === next.wallAt-previous.wallAt, 'LOCAL_TIME', '检查点时间无效，请重新同步');
    requireThat(Number.isInteger(next.rngState) && next.rngState > 0 && next.rngState <= 0xffffffff &&
        Number.isFinite(next.nextTick) && next.nextTick > next.clock && Number.isFinite(next.nextRegen) &&
        next.activity && typeof next.activity.type === 'string' && Array.isArray(next.logs) &&
        ['bag','bags','bank','pending','auctions'].every(key => Array.isArray(next[key])) && next.equipment &&
        [next,...next.party].every(p => Number.isFinite(p.hp) && Number.isFinite(p.mana)), 'LOCAL_STATE', '检查点结构无效', 400);
}
