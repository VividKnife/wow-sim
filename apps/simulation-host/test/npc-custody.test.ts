import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {DungeonAdmissions} from '../../../packages/game-domain/src/dungeon-admissions.ts';
import {SocialService} from '../../../packages/game-domain/src/social.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {context,persistCharacter} from '../../../packages/game-domain/src/context.ts';
import type {Character,Rules} from '../../../packages/game-domain/src/model.ts';
import {SimulationDirectory} from '../src/directory.ts';
import {runtimeVersion} from '../src/version.ts';
import {combatRole} from '../../../packages/game-domain/src/rules/combat-roles.js';
import {loadNpcResident,persistNpcResident,type NpcCharacter} from '../../../packages/game-domain/src/npc-characters.ts';
import {newResident} from '../../../packages/game-domain/src/rules/npc-world.js';

async function fixture(level=20){
 const store=residentStore(new MemoryStore()),game=new GameService(store,{contentVersion:'public-pool',seed:()=>283});
 const ids:string[]=[];
 for(const account of ['alice','bob']){
  const save=await game.createAccount(account,{name:account,classId:8,raceId:1},'create');ids.push(save.state.id);
  await store.transaction(async tx=>{const row=(await tx.get<Character>('characters',save.state.id))!,s=await context(tx,row,Date.now(),false);s.level=level;s.completed[7848]=1;s.location='deadmines';await persistCharacter(tx,row,s,s.wallAt,'fixture:'+account);});
 }
 const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit),directory=new SimulationDirectory(repository,{characters,dungeons:new DungeonAdmissions(store)});
 const checkpoint=async(instanceId:string):Promise<any>=>{await directory.checkpoint(instanceId);return store.read(async tx=>JSON.parse((await tx.get('simulation_checkpoints',instanceId))!.encodedCheckpoint));};
 let wall=Date.now();const social=new SocialService(store,()=>wall);
 const input=async(account:string,action:Rules,sequence:number)=>{
  const id=ids[account==='alice'?0:1],route=await directory.openCharacter(account,id),cp=await checkpoint(route.instanceId);
  return {instanceId:route.instanceId,actorId:id,controllerGeneration:cp.controllers.find((c:Rules)=>c.actorId===id)!.generation,clientSequence:sequence,requestId:crypto.randomUUID(),command:{kind:'action' as const,action:action as {type:string}}};
 };
 return {store,game,ids,directory,social,input,checkpoint,advance:()=>{wall+=9000;}};
}
test('cold public NPCs enter a human dungeon exclusively, return on last departure, and can serve another player', {timeout:60000},async()=>{
 const f=await fixture(),{store,ids,directory,social,input,checkpoint}=f;
 try{
  await social.supply('alice',ids[0]);const publicRows=await store.read(tx=>tx.list<NpcCharacter>('npc_characters'));
  const members=['tank','healer','dps','dps'].map(role=>{const row=publicRows.find(r=>(['tank','healer'].includes(combatRole(r.rules))?combatRole(r.rules):'dps')===role)!;publicRows.splice(publicRows.indexOf(row),1);return row.id;});
  const cmd=(a:string,body:Rules)=>social.command(a,ids[a==='alice'?0:1],{requestId:crypto.randomUUID(),...body});
  await cmd('alice',{type:'role',role:'dps'});
  for(const id of members)await cmd('alice',{type:'npcInvite',targetId:id});
  await cmd('alice',{type:'queue',dungeonId:'deadmines'});f.advance();const proposal=(await social.snapshot('alice',ids[0])).proposal!;
  await cmd('alice',{type:'proposal',proposalId:proposal.id,accept:true});
  const request=await input('alice',{type:'enterDungeon',contentId:'deadmines'},1),entered=await directory.enterDungeon('alice',request);
  const cp=await checkpoint(entered.instanceId);assert.equal(cp.state.party.length,4);assert.equal(cp.state.npcGuests.length,4);assert.equal(cp.state.npcWorld,undefined);
  for(const id of members){const claim=await store.read(tx=>tx.get('simulation_characters',id));assert.equal(claim!.instanceId,entered.instanceId);assert.equal(claim!.accountId,null);}
  await assert.rejects(cmd('bob',{type:'npcInvite',targetId:members[0]}),/队伍|副本|战斗/);
  const repeat=await directory.enterDungeon('alice',request);assert.equal(repeat.instanceId,entered.instanceId);
  const before=await store.read(async tx=>loadNpcResident(tx,(await tx.get<NpcCharacter>('npc_characters',members[0]))!));
  const left=await directory.leaveDungeon('alice',await input('alice',{type:'leaveDungeon'},2));
  assert.equal((await checkpoint(left.instanceId)).state.party.length,0);
  for(const id of members)assert.equal(await store.read(tx=>tx.get('simulation_characters',id)),null);
  await cmd('alice',{type:'leave'});await cmd('bob',{type:'npcInvite',targetId:members[0]});
  const after=await store.read(async tx=>loadNpcResident(tx,(await tx.get<NpcCharacter>('npc_characters',members[0]))!));assert.deepEqual(after.unit.equipment,before.unit.equipment);assert.equal(after.wallet,before.wallet);
 }finally{await directory.close();await store.close();}
});
test('gold raid reserves public max-level assets, settles and releases them without changing identity', {timeout:60000},async()=>{
 const f=await fixture(60),{store,ids,directory,input,checkpoint}=f;
 try{
  // An older DPS-heavy public population must not crowd tanks/healers out of recruitment.
  await store.transaction(async tx=>{for(let i=0;i<75;i++){const p=newResident({id:'realm',raceId:1,level:60,clock:0,wallAt:Date.now(),location:'stormwind'},6+9*i);await persistNpcResident(tx,p,`old-mage:${i}`);}});
  const arrived=await directory.enterDungeon('alice',await input('alice',{type:'enterDungeon',contentId:'molten-core-gold'},1));
  const cp=await checkpoint(arrived.instanceId);assert.equal(cp.state.npcWorld.publicPool,true);assert.equal(cp.state.npcWorld.residents.length,72);
  assert.equal(cp.state.npcWorld.residents.filter((p:Rules)=>combatRole(p.unit)==='tank').length,8);
  assert.equal(cp.state.npcWorld.residents.filter((p:Rules)=>combatRole(p.unit)==='healer').length,16);
  const idsNpc=cp.state.npcWorld.residents.map((p:Rules)=>p.id);assert.equal((await store.read(tx=>tx.list('simulation_characters',{instanceId:arrived.instanceId}))).length,73);
  await directory.input('alice',await input('alice',{type:'goldSettle'},2));
  const left=await directory.enterDungeon('alice',await input('alice',{type:'goldLeave'},3));
  const after=await checkpoint(left.instanceId);assert.equal(after.state.npcWorld,undefined);
  for(const id of idsNpc)assert.equal(await store.read(tx=>tx.get('simulation_characters',id)),null);
  assert.equal((await store.read(tx=>tx.list('npc_characters'))).length,99);
 }finally{await directory.close();await store.close();}
});
