import {residentNpcProfiles} from './npc-residency.ts';
import {persistNpcResident} from './npc-characters.ts';
import {syncNpcWorld} from './rules/npc-world.js';
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
import {mailForClaim,resolveMailRecipient,commitMailSend,type MailRow} from './mail.ts';

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
  mail(accountId:string,actorId:string,id:string,requestId:string){return mailForClaim(this.store,accountId,actorId,id,requestId);}
  mailRecipient(name:string,senderId:string){return resolveMailRecipient(this.store,name,senderId);}
  /** Retire the entire incompatible room atomically. Any human participant may
   * trigger recovery; each resumes from their own committed character/assets.
   * Old checkpoints are inspected for identity only, never executed or migrated. */
  async retireIncompatibleInstance(accountId:string,characterId:string):Promise<void>{
    await this.store.transaction(async tx=>{
      await owned(tx,accountId,characterId);
      const claim=await tx.get<CharacterClaim>('simulation_characters',characterId);
      if(!claim)return;
      const residency=await tx.get<Residency>('simulation_residencies',claim.instanceId);
      requireThat(residency&&claim.accountId===accountId,'SIMULATION_STATE','角色执行权记录不完整');
      if(residency.rulesetVersion===this.version.rulesetVersion&&residency.contentHash===this.version.contentHash)return;
      validateParticipants(residency.participants,residency.characterId);
      const participants=residency.participants,dungeon=claim.instanceId.startsWith('dungeon:');
      requireThat(participants.some(p=>p.characterId===characterId&&p.accountId===accountId)&&
        participants.some(p=>p.characterId===residency.characterId&&p.accountId===residency.accountId),
        'SIMULATION_STATE','实例角色归属无效');
      requireThat(dungeon||claim.instanceId.startsWith('personal:')&&participants.length===1,
        'SIMULATION_VERSION','当前实例类型无法自动结束旧活动',503);
      const claims=await tx.list<CharacterClaim>('simulation_characters',{instanceId:claim.instanceId});
      requireThat(participants.every(p=>claims.some(c=>c.id===p.characterId&&c.accountId===p.accountId))&&
        claims.every(c=>c.accountId===null||participants.some(p=>p.characterId===c.id&&p.accountId===c.accountId)),
        'SIMULATION_STATE','实例角色归属无效');
      const characters:Character[]=[];
      for(const p of participants){
        const c=await owned(tx,p.accountId,p.characterId);
        requireThat((this.retireState||!dungeon&&!c.rules.combat&&!c.rules.dungeon)&&!await tx.get('actor_leases',c.id),
          'SIMULATION_VERSION','旧活动需要先结束才能更新运行规则',503);
        characters.push(c);
      }
      const saved=await tx.get<{encodedCheckpoint:string}>('simulation_checkpoints',claim.instanceId);
      if(saved){
        const checkpoint=JSON.parse(saved.encodedCheckpoint);
        const actors=[checkpoint.state,...(checkpoint.state?.party??[])];
        requireThat(checkpoint.state?.id===residency.characterId&&characters.every(c=>{
          const matching=actors.filter(a=>a?.id===c.id);
          return matching.length===1&&matching[0].level===c.rules.level;
        }),'SIMULATION_STATE','旧实例与已保存的角色状态不一致');
      }
      await withResidentRetirement(tx,claim.instanceId,async()=>{
        // Remove every human and NPC claim before writing any member. If any
        // recovery fails, fencing, claims, group binding and all members roll back.
        for(const row of claims)await tx.delete('simulation_characters',row.id);
        await tx.delete('simulation_residencies',claim.instanceId);
        const now=Date.now();
        if(dungeon){
          for(const group of await tx.list('social_groups',{instanceId:claim.instanceId})){
            delete group.instanceId;delete group.entry;
            group.status='forming';group.dungeonId=null;group.updatedAt=now;
            await tx.put('social_groups',group);
          }
        }
        for(const character of characters){
          if(dungeon){
            // Discard encounter state without copying the leader's progress,
            // inventory or unallocated loot into another participant's save.
            for(const field of ['dungeonRoster','dungeonPresentNpcIds','sharedParty','groupLoot'])delete character.rules[field];
            await tx.put('characters',character);
          }
          await this.retireState?.(tx,character,now);
        }
        if(this.retireState)for(const id of new Set(participants.map(p=>p.accountId))){
          const presence=await tx.get<AccountPresence>('account_presence',id);
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
        requireThat(members.every(member => member.accountId === saveId || member.accountId === null), 'SHARED_INSTANCE', '共享实例必须先移出待删除角色');
        const previous = await tx.get<Ownership>('simulation_owners', id), epoch = (previous?.epoch ?? 0) + 1;
        requireThat(Number.isSafeInteger(epoch), 'SIMULATION_STATE', '执行权序号已耗尽');
        await tx.put('simulation_owners', {id, ownerId: 'deleted-save', epoch, expiresAt: now,
          commitSequence: previous?.commitSequence ?? 0, deleted: {at: now, userId, saveId}} satisfies Ownership);
      }
      await withResidentDeletion(tx, saveId, async () => {
        for(const id of instanceIds)for(const claim of await tx.list<CharacterClaim>('simulation_characters',{instanceId:id}))if(claim.accountId===null)await tx.delete('simulation_characters',claim.id);
        await removeInvalidSave(tx, saveId);
      });
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
    const boundary = checkpoint as typeof checkpoint & {state: Rules; controllers: CharacterAdmission['controllers']; presence: CharacterAdmission['presence']; recentInputs:{accountId:string;input:{actorId:string;requestId:string;command:Rules};receipt:{status:string;inputSequence:number}}[];appliedInputSequence:number};
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
    const profiles=residentNpcProfiles(state);
    const npcIds=new Set(profiles.map(p=>p.profile.id));
    requireThat(npcIds.size===profiles.length,'SIMULATION_STATE','NPC 运行身份重复');
    const publicClaims=(await tx.list<CharacterClaim>('simulation_characters',{instanceId:owner.id})).filter(c=>c.accountId===null);
    requireThat(publicClaims.length===npcIds.size&&publicClaims.every(c=>npcIds.has(c.id)),'SIMULATION_STATE','NPC 执行权名册不完整');
    const humanIds = new Set(members.map(p => p.characterId));
    requireThat(new Set([state.id, ...state.party.map((c: Rules) => c.id)]).size === state.party.length + 1 &&
      state.party.every((c: Rules) => humanIds.has(c.id) || c.npcPlayer === true && npcIds.has(c.id)),
      'SIMULATION_STATE', '实例包含未归属的参战成员');
    await withResidentAuthority(tx, owner, async () => {
      for(const row of boundary.recentInputs.filter(row=>row.receipt.status==='applied'&&row.receipt.inputSequence<=boundary.appliedInputSequence&&['mailClaim','mailSend'].includes(row.input.command.kind))){
        if(row.input.command.kind==='mailSend'){
          const sender=await tx.get<Character>('characters',row.input.actorId);
          requireThat(sender?.accountId===row.accountId,'MAIL_SENDER','发件人不存在',400);
          await commitMailSend(tx,row,sender,state.wallAt);
          continue;
        }
        const mail=await tx.get<MailRow>('mail',row.input.command.id);
        requireThat(mail?.accountId===row.accountId&&(!mail.recipientId||mail.recipientId===row.input.actorId),'MAIL_NOT_FOUND','邮件不存在',404);
        requireThat(JSON.stringify(row.input.command.mail)===JSON.stringify({copper:mail.copper,attachments:mail.attachments}),'MAIL_CONTENT','邮件附件已变化',409);
        if(mail.status==='claimed')requireThat(mail.claimRequestId===row.input.requestId&&mail.claimedBy===row.input.actorId,'MAIL_CLAIMED','邮件已领取',409);
        else await tx.put('mail',{...mail,status:'claimed',claimedAt:state.wallAt,claimedBy:row.input.actorId,claimRequestId:row.input.requestId});
      }
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
      syncNpcWorld(state);
      for(const {profile} of residentNpcProfiles(state))await persistNpcResident(tx,profile,businessKey,owner.id);
      for (const [accountId, at] of presence.accounts) {
        const previous = await tx.get('account_presence', accountId);
        if (at > Number(previous?.lastSeenAt ?? -1))
          await tx.put('account_presence', {...previous, id: accountId, accountId, lastSeenAt: at});
        await bump(tx, accountId);
      }
    });
  };
}
