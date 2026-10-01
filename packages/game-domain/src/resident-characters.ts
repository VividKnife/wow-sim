import {participantState, participantCheckpointState, validateParticipants, type ResidentParticipant} from './resident-participants.ts';
import {DEFAULT_OFFLINE_LIMIT_MS, offlineLimit} from './presence.ts';
import {removeInvalidSave} from './account-reset.ts';
import type {Ownership} from '../../persistence/src/simulation.ts';
import {randomUUID} from 'node:crypto';
import type {Store,Transaction} from '../../persistence/src/store.ts';
import type {CheckpointBoundary} from '../../persistence/src/simulation.ts';
import {context, owned, persistCharacter, bump, validAccountPresence} from './context.ts';
import {DomainError, requireThat, type AccountPresence, type Character, type Rules} from './model.ts';
import {residentStore, withResidentAuthority, withResidentDeletion, withResidentRetirement, type CharacterClaim} from './resident-store.ts';
import {applyExperienceBuff, experienceMultiplier} from './rules/experience.js';

export type CharacterAdmission = {
  instanceId: string; state: Rules;
  presence: {offlineLimitMs: number; accounts: [string, number][]};
  controllers: {actorId: string; accountId: string; generation: number; canPause: boolean}[];
};
type Version = {rulesetVersion: string; contentHash: string};
export type Residency = Version & {id: string; characterId: string; accountId: string; participants: ResidentParticipant[]; encodedAdmission: string};

/** Personal residency starts from database-owned records, not a gateway copy.
 * Claims and the initial boundary commit together, so a crash between admission
 * and the first Worker checkpoint leaves a recoverable admission. */
export class ResidentCharacters {
  private readonly store: Store;
  private readonly xpMultiplier: number;
  private readonly version: Version;
  private readonly offlineLimitMs: number;
  private readonly retireState?: (tx:Transaction,character:Character,now:number)=>Promise<void>;
  constructor(store: Store, options: {version: Version; xpMultiplier?: number; offlineLimitMs?: number;
    retireState?: (tx:Transaction,character:Character,now:number)=>Promise<void>}) {
    this.store = residentStore(store); this.xpMultiplier = experienceMultiplier(options.xpMultiplier);
    this.version = {...options.version};
    this.offlineLimitMs = offlineLimit(options.offlineLimitMs ?? DEFAULT_OFFLINE_LIMIT_MS);
    this.retireState=options.retireState;
  }
  private decode(residency: Residency): CharacterAdmission {
    requireThat(residency.rulesetVersion === this.version.rulesetVersion && residency.contentHash === this.version.contentHash,
      'SIMULATION_VERSION', '运行规则或内容版本不一致');
    validateParticipants(residency.participants, residency.characterId);
    const admission = JSON.parse(residency.encodedAdmission) as CharacterAdmission;
    requireThat(admission.instanceId === residency.id && admission.state.id === residency.characterId &&
      admission.controllers.length === residency.participants.length &&
      residency.participants.every(p => admission.controllers.some(c => c.actorId === p.characterId && c.accountId === p.accountId)),
      'SIMULATION_STATE', '实例初始角色与名册不一致');
    return admission;
  }
  async find(accountId: string, characterId: string): Promise<CharacterAdmission | null> {
    return this.store.read(async tx => {
      await owned(tx, accountId, characterId);
      const claim = await tx.get<CharacterClaim>('simulation_characters', characterId);
      if (!claim) return null;
      const residency = await tx.get<Residency>('simulation_residencies', claim.instanceId);
      requireThat(residency && claim.accountId === accountId, 'SIMULATION_STATE', '角色执行权记录不完整');
      const admission = this.decode(residency);
      requireThat(residency.participants.some(p => p.characterId === characterId && p.accountId === accountId),
        'SIMULATION_STATE', '角色执行权记录不完整');
      return admission;
    });
  }
  /** Start a new runtime from committed character/assets when an expired
   * personal runtime belongs to a different rules/content release. */
  async retireIncompatiblePersonal(accountId:string,characterId:string):Promise<void>{
    await this.store.transaction(async tx=>{
      const character=await owned(tx,accountId,characterId);
      const claim=await tx.get<CharacterClaim>('simulation_characters',characterId);
      if(!claim)return;
      const residency=await tx.get<Residency>('simulation_residencies',claim.instanceId);
      requireThat(residency&&claim.accountId===accountId,'SIMULATION_STATE','角色执行权记录不完整');
      if(residency.rulesetVersion===this.version.rulesetVersion&&residency.contentHash===this.version.contentHash)return;
      requireThat(claim.instanceId.startsWith('personal:')&&residency.accountId===accountId&&
        residency.characterId===characterId&&residency.participants.length===1&&
        residency.participants[0].characterId===characterId&&residency.participants[0].accountId===accountId,
        'SIMULATION_VERSION','共享实例需要先结束当前活动',503);
      requireThat((this.retireState||!character.rules.combat&&!character.rules.dungeon)&&!await tx.get('actor_leases',characterId),
        'SIMULATION_VERSION','旧活动需要先结束才能更新运行规则',503);
      const claims=await tx.list<CharacterClaim>('simulation_characters',{instanceId:claim.instanceId});
      requireThat(claims.some(row=>row.id===characterId)&&claims.every(row=>row.accountId===accountId),
        'SIMULATION_STATE','实例角色归属无效');
      const saved=await tx.get<{encodedCheckpoint:string}>('simulation_checkpoints',claim.instanceId);
      if(saved){
        const checkpoint=JSON.parse(saved.encodedCheckpoint);
        requireThat(checkpoint.state?.id===characterId&&checkpoint.state?.level===character.rules.level,
          'SIMULATION_STATE','旧实例与已保存的角色状态不一致');
      }
      await withResidentRetirement(tx,claim.instanceId,async()=>{
        for(const row of claims)await tx.delete('simulation_characters',row.id);
        await tx.delete('simulation_residencies',claim.instanceId);
        const now=Date.now();
        await this.retireState?.(tx,character,now);
        if(this.retireState){
          const presence=await tx.get<AccountPresence>('account_presence',accountId);
          if(!presence||!validAccountPresence(presence))throw new DomainError('ACCOUNT_STATE','账号在线状态无效');
          await tx.put('account_presence',{...presence,lastSeenAt:Math.max(presence.lastSeenAt,now)});
        }
      });
    });
  }
  async admission(accountId: string, characterId: string): Promise<CharacterAdmission> {
    return this.store.transaction(async tx => {
      const character = await owned(tx, accountId, characterId);
      const previous = await tx.get<CharacterClaim>('simulation_characters', characterId);
      if (previous) {
        requireThat(previous.accountId === accountId, 'FORBIDDEN', '角色不属于此账号', 403);
        const residency = await tx.get<Residency>('simulation_residencies', previous.instanceId);
        requireThat(residency, 'SIMULATION_STATE', '角色执行权记录不完整');
        const admission = this.decode(residency);
        requireThat(residency.participants.some(p => p.characterId === characterId && p.accountId === accountId),
          'SIMULATION_STATE', '角色执行权记录不完整');
        return admission;
      }
      requireThat(!await tx.get('actor_leases', characterId), 'ACTOR_BUSY', '角色正在执行另一项活动');
      const reservations = await tx.list('reservations', {accountId, status: 'reserved'});
      requireThat(!reservations.some(row => row.payerId === characterId || row.recipientId === characterId),
        'ASSETS_RESERVED', '角色有尚未结算的制造资产');
      const state = await context(tx, character, Date.now(), false);
      requireThat(!state.combat && !state.dungeon, 'ACTOR_BUSY', '角色尚未离开原活动');
      applyExperienceBuff(state, this.xpMultiplier);
      const instanceId = `personal:${randomUUID()}`;
      const presence = await tx.get('account_presence', accountId);
      const admission: CharacterAdmission = {instanceId, state,
        presence: {offlineLimitMs: this.offlineLimitMs, accounts: [[accountId, Number(presence?.lastSeenAt ?? state.wallAt)]]},
        controllers: [{actorId: characterId, accountId, generation: 1, canPause: true}]};
      await tx.insert('simulation_residencies', {id: instanceId, characterId, accountId, participants: [{characterId, accountId}], ...this.version, encodedAdmission: JSON.stringify(admission)});
      await tx.insert('simulation_characters', {id: characterId, accountId, instanceId});
      for (const npc of state.npcWorld?.residents ?? []) {
        requireThat(!await tx.get('simulation_characters', npc.id), 'ACTOR_BUSY', '冒险者已由另一实例管理');
        await tx.insert('simulation_characters', {id: npc.id, accountId, instanceId});
      }
      return admission;
    });
  }
  /** Explicit user-owned save deletion. Revocation and asset removal share a
   * serializable transaction; tombstones prevent stale admissions resurrecting
   * an instance even when its original host is unavailable. */
  async deleteSave(userId: string, saveId: string): Promise<string[]> {
    requireThat(typeof userId === 'string' && userId.length > 0 && userId.length <= 200 &&
      typeof saveId === 'string' && saveId.length > 0 && saveId.length <= 200, 'INVALID_SAVE', '存档标识无效', 400);
    return this.store.transaction(async tx => {
      const receiptId = `deleted-save:${saveId}`, receipt = await tx.get('receipts', receiptId);
      if (receipt) {
        requireThat(receipt.userId === userId, 'NOT_FOUND', '存档不存在或已删除', 404);
        return receipt.instanceIds as string[];
      }
      const account = await tx.get('accounts', saveId);
      requireThat(account?.userId === userId, 'NOT_FOUND', '存档不存在或已删除', 404);
      const claims = await tx.list<CharacterClaim>('simulation_characters', {accountId: saveId});
      const instanceIds = [...new Set(claims.map(claim => claim.instanceId))];
      const now = Date.now();
      for (const id of instanceIds) {
        const members = await tx.list<CharacterClaim>('simulation_characters', {instanceId: id});
        requireThat(members.every(member => member.accountId === saveId), 'SHARED_INSTANCE', '共享实例必须先移出待删除角色');
        const previous = await tx.get<Ownership>('simulation_owners', id), epoch = (previous?.epoch ?? 0) + 1;
        requireThat(Number.isSafeInteger(epoch), 'SIMULATION_STATE', '执行权序号已耗尽');
        await tx.put('simulation_owners', {id, ownerId: 'deleted-save', epoch, expiresAt: now,
          commitSequence: previous?.commitSequence ?? 0, deleted: {at: now, userId, saveId}} satisfies Ownership);
      }
      await withResidentDeletion(tx, saveId, () => removeInvalidSave(tx, saveId));
      // These rows are keyed by instance, not account. Keep only the owner
      // tombstone and user-scoped receipts needed to reject stale resurrection.
      for (const id of instanceIds) {
        await tx.delete('simulation_checkpoints', id);
        for (const table of ['simulation_commits', 'settlements'] as const)
          for (const row of await tx.list(table, {instanceId: id})) await tx.delete(table, row.id);
      }
      await tx.delete('account_presence', saveId);
      await tx.insert('receipts', {id: receiptId, userId, saveId, instanceIds});
      return instanceIds;
    });
  }
  /** Stage-B snapshot materialization. Rules allocate stable item IDs; this
   * boundary does not reroll loot or calculate a second set of rewards. */
  commit: CheckpointBoundary = async (tx, {owner, checkpoint, businessKey}) => {
    const residency = await tx.get<Residency>('simulation_residencies', owner.id);
    if (!residency) return; // Unbound rule/benchmark rooms have no game assets.
    requireThat(residency.rulesetVersion === checkpoint.rulesetVersion && residency.contentHash === checkpoint.contentHash,
      'SIMULATION_VERSION', '运行规则或内容版本不一致');
    validateParticipants(residency.participants, residency.characterId);
    const boundary = checkpoint as typeof checkpoint & {state: Rules; controllers: CharacterAdmission['controllers']; presence: CharacterAdmission['presence']};
    const state = boundary.state;
    requireThat(state?.id === residency.characterId && Array.isArray(state.party), 'SIMULATION_STATE', '实例队伍结构无效');
    const members = residency.participants;
    requireThat(Array.isArray(boundary.controllers) && boundary.controllers.length === members.length &&
      new Set(boundary.controllers.map(c => c.actorId)).size === members.length &&
      members.every(p => boundary.controllers.some(c => c.actorId === p.characterId && c.accountId === p.accountId)),
      'SIMULATION_STATE', '控制器与持久角色名册不一致');
    const accountIds = new Set(members.map(p => p.accountId));
    const presence = boundary.presence;
    requireThat(presence?.accounts.length === accountIds.size && new Set(presence.accounts.map(row => row[0])).size === accountIds.size &&
      presence.accounts.every(([id, at]) => accountIds.has(id) && Number.isSafeInteger(at) && at >= 0),
      'SIMULATION_STATE', '实例在线记录无效');
    const actors = members.map(p => participantState(state, p.characterId));
    const npcIds = new Set(actors.flatMap(actor => (actor.npcWorld?.residents ?? []).map((npc: Rules) => npc.id)));
    const humanIds = new Set(members.map(p => p.characterId));
    requireThat(new Set([state.id, ...state.party.map((c: Rules) => c.id)]).size === state.party.length + 1 &&
      state.party.every((c: Rules) => humanIds.has(c.id) || c.npcPlayer === true && npcIds.has(c.id)),
      'SIMULATION_STATE', '实例包含未归属的参战成员');
    await withResidentAuthority(tx, owner, async () => {
      for (const participant of members) {
        const claim = await tx.get<CharacterClaim>('simulation_characters', participant.characterId);
        requireThat(claim?.instanceId === owner.id && claim.accountId === participant.accountId,
          'SIMULATION_FENCED', '角色不属于当前模拟实例');
        const character = await tx.get<Character>('characters', participant.characterId);
        requireThat(character?.accountId === participant.accountId, 'SIMULATION_STATE', '角色身份记录不一致');
        await persistCharacter(tx, character, participantCheckpointState(state, participant.characterId), state.wallAt, businessKey);
        await tx.insert('outbox', {id: `${businessKey}:character:${character.id}`, businessKey, accountId: participant.accountId,
          type: 'simulation-commit', payload: {instanceId: owner.id, ownerEpoch: owner.epoch, characterId: character.id}, delivered: false});
      }
      for (const [accountId, at] of presence.accounts) {
        const previous = await tx.get('account_presence', accountId);
        if (at > Number(previous?.lastSeenAt ?? -1))
          await tx.put('account_presence', {...previous, id: accountId, accountId, lastSeenAt: at});
        await bump(tx, accountId);
      }
    });
  };
}
