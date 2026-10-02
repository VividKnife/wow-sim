import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes,randomUUID} from 'node:crypto';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {DungeonAdmissions} from '../../../packages/game-domain/src/dungeon-admissions.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {dungeonDefinitions} from '../../../packages/game-domain/src/rules/dungeon-registry.js';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import {SimulationDirectory} from '../../simulation-host/src/directory.ts';
import {runtimeVersion} from '../../simulation-host/src/version.ts';
import {createSimulationServer} from '../../simulation-host/src/server.ts';
import {SimulationClient} from '../src/simulation-client.ts';
import {ResidentGameService} from '../src/resident-game-service.ts';
import {createGameServer} from '../src/server.ts';
import {accounts,issueSession,appOrigin} from './session-fixture.ts';

for(const level of [20,60])test(`${level} boost creates one human, enters a public NPC dungeon, and preserves independent NPC assets`,{timeout:60000},async()=>{
 const store=residentStore(new MemoryStore()),domain=new GameService(store,{contentVersion:'boost-public-test',seed:()=>283});
 const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit);
 const directory=new SimulationDirectory(repository,{characters,dungeons:new DungeonAdmissions(store)}),token=randomBytes(32).toString('base64url');
 const host=createSimulationServer(directory,{token});host.server.listen(0,'127.0.0.1');await once(host.server,'listening');
 const ha=host.server.address();assert.ok(ha&&typeof ha==='object');
 const client=new SimulationClient({url:`http://127.0.0.1:${ha.port}`,token});
 const gateway=createGameServer({service:new ResidentGameService(domain,client),accounts,appOrigin});
 gateway.server.listen(0,'127.0.0.1');await once(gateway.server,'listening');
 const ga=gateway.server.address();assert.ok(ga&&typeof ga==='object');
 const base=`http://127.0.0.1:${ga.port}`,headers={Origin:appOrigin,'content-type':'application/json',Cookie:`wow_session=${await issueSession({sub:`boost-${level}`})}`};
 let saveId='';
 const request=async(path:string,body?:Rules,method=body?'POST':'GET')=>{
  const url=new URL(path,base);if(saveId)url.searchParams.set('saveId',saveId);
  const response=await fetch(url,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),data=await response.json();
  assert.equal(response.status,path==='/api/saves'&&method==='POST'?201:200,`${method} ${path} ${body?.type??''}: ${JSON.stringify(data)}`);return data;
 };
 const command=async(action:Rules)=>{
  const view=await request('/api/game');return request('/api/game',{...action,characterId:view.snapshot.player.id,requestId:randomUUID(),execution:{
   instanceId:view.execution.instanceId,controllerGeneration:view.execution.controllerGeneration,clientSequence:view.execution.clientSequence+1}});
 };
 try{
  const creation={name:`直升${level}`,classId:8,raceId:1,gender:'female',...(level===20?{boost:true}:{raidReady:true}),requestId:randomUUID()};
  saveId=(await request('/api/saves',creation)).id;
  assert.equal((await request('/api/saves',creation)).id,saveId,'creation retries must not duplicate assets');
  const account=(await store.read(tx=>tx.get('accounts',saveId)))!,actorId=account.primaryCharacterId;
  assert.equal((await store.read(tx=>tx.list('characters'))).length,1);
  assert.equal((await store.read(tx=>tx.list('npc_characters'))).length,0,'boost never creates private NPCs');
  // Isolate entry from the walking route; all level, equipment, skills and unlocks come from the real save API.
  const dungeonId=level===20?'deadmines':'scholomance';
  await store.transaction(async tx=>{const row=(await tx.get('characters',actorId))!;row.rules.location=dungeonDefinitions[dungeonId].entrance;await tx.put('characters',row);});
  const initial=await request('/api/game');assert.equal(initial.snapshot.player.level,level);assert.equal(initial.snapshot.player.gender,'female');
  assert.equal(initial.snapshot.player.money,level===20?500000:1000000);assert.equal(initial.roster.length,1);
  const social=(body?:Rules)=>request(`/api/game/social?characterId=${encodeURIComponent(actorId)}`,body?{...body,requestId:randomUUID()}:undefined);
  await command({type:'npcMatchSupply',dungeonId});
  const candidates=(await social()).npcs as Rules[];assert.ok(candidates.length>=10);
  assert.ok(candidates.every(p=>p.level>=level-1&&p.level<=Math.min(60,level+3)));
  const members=['tank','healer','dps','dps'].map(role=>{const i=candidates.findIndex(p=>p.role===role);assert.ok(i>=0);return candidates.splice(i,1)[0].id;});
  await social({type:'role',role:'dps'});
  for(const targetId of members)await social({type:'npcInvite',targetId});
  const proposal=(await social({type:'queue',dungeonId})).proposal;assert.ok(proposal);
  await social({type:'proposal',proposalId:proposal.id,accept:true});
  const entered=await command({type:'enterDungeon',contentId:dungeonId});
  assert.equal(entered.snapshot.player.level,level);assert.equal(entered.snapshot.view.instanceScene.memberCount,5);
  await client.checkpoint(entered.execution.instanceId);
  const state=(await repository.load<any>(entered.execution.instanceId))!.checkpoint.state;
  assert.equal(state.npcWorld,undefined);assert.equal(state.npcGuests.length,4);
  for(const id of members){const row=(await store.read(tx=>tx.get('npc_characters',id)))!;assert.equal(row.realm,'public');assert.equal(row.accountId,null);}
  await command({type:'leaveDungeon'});await social({type:'leave'});
  if(level===60){
   const raid=await command({type:'enterDungeon',contentId:'molten-core-gold'});
   await command({type:'goldPublish'});await command({type:'goldRecommend'});await command({type:'goldLaunch'});
   await client.checkpoint(raid.execution.instanceId);
   const raidState=(await repository.load<any>(raid.execution.instanceId))!.checkpoint.state;
   assert.equal(raidState.party.length,39);assert.equal(raidState.npcWorld.publicPool,true);
   assert.ok(raidState.party.every((p:Rules)=>p.npcPlayer&&p.level===60));
   await command({type:'goldSettle'});await command({type:'goldLeave'});
  }
  const publicCount=(await store.read(tx=>tx.list('npc_characters'))).length;
  await request('/api/saves',undefined,'DELETE');
  assert.equal((await store.read(tx=>tx.list('characters'))).length,0);
  assert.equal((await store.read(tx=>tx.list('npc_characters'))).length,publicCount,'deleting a boosted save preserves the shared population');
  assert.equal((await store.read(tx=>tx.list('simulation_characters'))).length,0);
 }finally{await gateway.close();await host.close();await store.close();}
});
