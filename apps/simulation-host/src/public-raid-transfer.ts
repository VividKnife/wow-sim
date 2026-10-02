import {createHash} from 'node:crypto';
import type {TransferBoundary} from '../../../packages/persistence/src/simulation.ts';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';
import type {InstanceCheckpoint} from './instance.ts';
import type {CharacterAdmission,Residency} from '../../../packages/game-domain/src/resident-characters.ts';
import {transferResidentClaims} from '../../../packages/game-domain/src/resident-store.ts';
import {updateNpcPopulation} from '../../../packages/game-domain/src/npc-population.ts';
import {saveDungeonInput} from '../../../packages/game-domain/src/dungeon-admissions.ts';
import {goldRaidContents,enterGoldRaid,leaveGoldRaid} from '../../../packages/game-domain/src/rules/gold-raid.js';
import {npcRaidEligible} from '../../../packages/game-domain/src/rules/npc-progression.js';
import {combatRole} from '../../../packages/game-domain/src/rules/combat-roles.js';
import {owned} from '../../../packages/game-domain/src/context.ts';
import {recordDungeonInput} from './dungeon-input.ts';
import {runtimeVersion} from './version.ts';

export const publicRaidTransferId=(accountId:string,input:SimulationInput)=>'public-raid:'+createHash('sha256').update(JSON.stringify([accountId,input])).digest('hex');
export function publicRaidBoundary(accountId:string,input:SimulationInput):TransferBoundary<InstanceCheckpoint>{
 return async(tx,{sources,destinations,transferId})=>{
  await owned(tx,accountId,input.actorId);
  if(sources.length!==1||destinations.length!==1||input.command.kind!=='action'||transferId!==publicRaidTransferId(accountId,input))throw new Error('Invalid public raid boundary');
  const source=sources[0].checkpoint,cp=structuredClone(source),s=cp.state;
  if(source.controllers.length!==1||s.id!==input.actorId)throw new Error('请先离开当前队伍副本');
  const action=input.command.action;
  if(action.type==='enterDungeon'){
   const raidId=goldRaidContents[action.contentId as keyof typeof goldRaidContents];if(!raidId)throw new Error('Unknown raid');
   const candidates=await updateNpcPopulation(tx,s.wallAt,{level:60,minimumLevel:60,raidId});
   const available=candidates.filter(p=>npcRaidEligible(p,raidId,s.wallAt));
   const residents=Object.entries({tank:8,healer:16,dps:48}).flatMap(([role,count])=>available.filter(p=>{
    const actual=combatRole(p.unit);return (actual==='tank'||actual==='healer'?actual:'dps')===role;
   }).slice(0,count));
   if(residents.length<39)throw new Error('公共 NPC 暂无足够的空闲满级队员，请稍后再试');
   s.npcFriendIds=(await tx.list('social_links')).filter(l=>l.kind==='friend'&&l.status==='accepted'&&l.people.includes(s.id)).flatMap(l=>l.people.filter((id:string)=>id!==s.id));
   s.npcWorld={publicPool:true,residents,selection:[],autoLoot:false};
   enterGoldRaid(s,raidId);
  }else if(action.type==='goldLeave'){
   leaveGoldRaid(s);delete s.npcWorld;delete s.npcGuests;delete s.npcFriendIds;
  }else throw new Error('Invalid raid action');
  cp.instanceId=destinations[0].id;cp.ownerEpoch=destinations[0].epoch;
  cp.controllers=cp.controllers.map(c=>({...c,generation:c.generation+1}));
  for(const row of cp.recentInputs){row.input.instanceId=cp.instanceId;row.input.controllerGeneration=cp.controllers.find(c=>c.actorId===row.input.actorId)!.generation;}
  const receipt=recordDungeonInput(source,cp,accountId,input);await saveDungeonInput(tx,accountId,input,receipt);
  const admission:CharacterAdmission={instanceId:cp.instanceId,state:s,controllers:cp.controllers,presence:cp.presence!};
  const residency:Residency={id:cp.instanceId,characterId:s.id,accountId,...runtimeVersion,participants:[{accountId,characterId:s.id}],encodedAdmission:JSON.stringify(admission)};
  await transferResidentClaims(tx,transferId,sources.map(s=>s.owner),[residency]);return [cp];
 };
}
