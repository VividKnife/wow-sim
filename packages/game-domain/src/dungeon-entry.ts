import type {Transaction,ReadView} from '../../persistence/src/store.ts';
import {owned} from './context.ts';
import {requireThat,type Rules} from './model.ts';
import {dungeonDefinitions} from './rules/dungeon-registry.js';
import {combatRole} from './rules/combat-roles.js';
import {currentEntry,fits,supportedRoles,type Group} from './social-party.ts';
import {validateDungeonOccupants} from './dungeon-roster.ts';

export type DungeonEntryRequest={accountId:string;actorId:string;groupId:string;entryId:string};

async function validateRoster(tx:ReadView,group:Group,dungeonId:string){
  const definition=Object.hasOwn(dungeonDefinitions,dungeonId)?dungeonDefinitions[dungeonId]:null;
  requireThat(definition,'DUNGEON','请选择已开放的地下城');
  requireThat(group.members.length===5&&new Set(group.members.map(m=>m.id)).size===5&&fits(group.members),
    'PARTY_ROLE','进本需要完整的 1 坦克、1 治疗、3 输出队伍');
  const levels:number[]=[];
  for(const member of group.members){
    requireThat((await tx.get('social_members',member.id))?.groupId===group.id,'PARTY_CHANGED','队伍成员已改变');
    const row=await tx.get(member.npc?'npc_characters':'characters',member.id);
    requireThat(row&&(!member.npc?row.kind==='hero':row.ownerCharacterId===member.ownerCharacterId),'PARTY_CHANGED','队伍角色身份已改变');
    requireThat(member.role&&supportedRoles(row!.rules.classId).includes(member.role),'PARTY_ROLE','成员职责已失效');
    if(member.npc){const role=combatRole(row!.rules);requireThat((role==='tank'||role==='healer'?role:'dps')===member.role,'PARTY_ROLE','NPC 职责已改变');}
    levels.push(row!.rules.level);
  }
  requireThat(levels.every(level=>Number.isSafeInteger(level)&&level>=definition.minimumLevel&&level<=60)&&Math.max(...levels)-Math.min(...levels)<=5,
    'PARTY_LEVEL','成员需满足副本最低等级，彼此等级差不超过 5 级');
}

/** Called in the SAME transaction as checkpoint/claim transfer. The game
 * gateway identity is authoritative; no client roster or asset data is used. */
export async function authorizeDungeonEntry(tx:ReadView,request:DungeonEntryRequest):Promise<Group>{
  await owned(tx,request.accountId,request.actorId);
  const group=await tx.get<Group>('social_groups',request.groupId);
  requireThat(group&&group.members.some(m=>m.id===request.actorId&&!m.npc),'PARTY_MEMBER','只有匹配队员可以进入副本',403);
  requireThat(currentEntry(group!)&&group!.entry!.id===request.entryId,'ENTRY_EXPIRED','匹配队伍已改变，请重新匹配');
  await validateRoster(tx,group!,group!.entry!.dungeonId);
  return group!;
}

/** The normal Enter Dungeon action records only this authenticated human's
 * intention. Matching acceptance and ordinary invitations never record it.
 * The live owner still validates entrance location and activity at transfer. */
export async function requestDungeonEntry(tx:Transaction,request:DungeonEntryRequest){
  const group=await authorizeDungeonEntry(tx,request);
  group.entry!.requested=[...new Set([...group.entry!.requested,request.actorId])];
  await tx.put('social_groups',group);
}

/** Compare the live composed room, including controller accounts, with the
 * consented roster before saving the group destination. Never grants asset IO. */
export async function bindDungeonEntry(tx:Transaction,request:DungeonEntryRequest,checkpoint:{instanceId:string;state:Rules;controllers:{actorId:string;accountId:string}[]},now:number,previousInstanceId:string|null){
  const group=await authorizeDungeonEntry(tx,request),{state,controllers}=checkpoint;
  requireThat((group.instanceId??null)===previousInstanceId,'ENTRY_INSTANCE','副本运行房间已改变，请重新进入');
  validateDungeonOccupants(state);
  const actors=[state,...state.party];
  requireThat(state.dungeonRoster.groupId===group.id&&state.dungeonRoster.leaderId===group.leaderId&&
    state.dungeonRoster.members.every((a:{id:string;npc:boolean})=>group.members.some(m=>m.id===a.id&&m.npc===a.npc))&&
    state.dungeon?.id===group.entry!.dungeonId&&actors.some(a=>a.id===request.actorId&&!a.npcPlayer)&&
    actors.every(a=>group.members.some(m=>m.id===a.id&&m.npc===(a.npcPlayer===true))),
    'ENTRY_ROSTER','运行房间与已确认的副本队伍不一致');
  const humans=group.members.filter(m=>!m.npc&&actors.some(a=>a.id===m.id));
  requireThat(humans.every(m=>group.entry!.requested.includes(m.id)),'ENTRY_MANUAL','玩家需要各自在副本入口手动进入');
  requireThat(controllers.length===humans.length&&new Set(controllers.map(c=>c.actorId)).size===humans.length,'ENTRY_ROSTER','运行控制器与队伍不一致');
  for(const member of humans){
    const row=(await tx.get('characters',member.id))!;
    requireThat(controllers.some(c=>c.actorId===member.id&&c.accountId===row.accountId),'ENTRY_ROSTER','运行控制器账号不一致');
  }
  const levels=actors.map(a=>a.level);
  requireThat(levels.every(level=>Number.isSafeInteger(level)&&level>=dungeonDefinitions[group.entry!.dungeonId].minimumLevel&&level<=60)&&
    Math.max(...levels)-Math.min(...levels)<=5,'PARTY_LEVEL','运行角色等级不符合副本要求');
  for(const actor of actors)requireThat(supportedRoles(actor.classId).includes(group.members.find(m=>m.id===actor.id)!.role!),
    'PARTY_ROLE','运行角色职责已失效');
  for(const member of group.members.filter(m=>m.npc&&actors.some(a=>a.id===m.id))){
    const actor=actors.find(a=>a.id===member.id),role=combatRole(actor);
    requireThat((role==='tank'||role==='healer'?role:'dps')===member.role,'PARTY_ROLE','运行 NPC 职责已改变');
  }
  group.instanceId=checkpoint.instanceId;group.updatedAt=now;
  await tx.put('social_groups',group);
}
