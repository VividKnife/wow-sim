import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {DungeonAdmissions} from '../../../packages/game-domain/src/dungeon-admissions.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {context,persistCharacter} from '../../../packages/game-domain/src/context.ts';
import {ensureNpcMatchSupply} from '../../../packages/game-domain/src/rules/npc-world.js';
import {combatRole} from '../../../packages/game-domain/src/rules/combat-roles.js';
import type {Character,Rules} from '../../../packages/game-domain/src/model.ts';
import {runtimeVersion} from '../../simulation-host/src/version.ts';
import {SimulationDirectory} from '../../simulation-host/src/directory.ts';
import {createSimulationServer} from '../../simulation-host/src/server.ts';
import {SimulationClient} from '../src/simulation-client.ts';
import {ResidentGameService} from '../src/resident-game-service.ts';
import {createGameServer} from '../src/server.ts';
import {accounts,issueSession,appOrigin} from './session-fixture.ts';

for(const order of ['leader-first','leader-later','outside','cross-owner'])test(`authenticated finder entry: ${order}`,{timeout:60000},async()=>{
 const store=residentStore(new MemoryStore()),domain=new GameService(store,{contentVersion:'test',seed:()=>283});
 const ids:string[]=[],npcIds:string[]=[],npcOwnerAccount=order==='cross-owner'?'bob':'alice';
 for(const accountId of ['alice','bob']){
  const made=await domain.createAccount(accountId,{name:accountId,classId:8,raceId:1},'create');ids.push(made.state.id);
  await store.transaction(async tx=>{
   const row=(await tx.get<Character>('characters',made.state.id))!,state=await context(tx,row,Date.now(),false);
   state.level=20;state.location=order==='outside'?'goldshire':'deadmines';
   if(accountId===npcOwnerAccount){
    ensureNpcMatchSupply(state);
    npcIds.push(...['tank','healer','dps'].map(role=>state.npcWorld.residents.find((p:Rules)=>{const r=combatRole(p.unit);return (r==='tank'||r==='healer'?r:'dps')===role;}).id));
   }
   // No NPC party is preinstalled: the owner must select the matched roster.
   assert.equal(state.party.length,0);
   await persistCharacter(tx,row,state,state.wallAt,'fixture:'+accountId);
  });
 }
 const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit);
 const directory=new SimulationDirectory(repository,{characters,dungeons:new DungeonAdmissions(store)}),token=randomBytes(32).toString('base64url');
 const originalEnter=directory.enterDungeon.bind(directory);
 directory.enterDungeon=async(...args)=>{try{return await originalEnter(...args);}catch(error){if(error instanceof AggregateError)console.error('Transfer causes:',error.errors);throw error;}};
 const host=createSimulationServer(directory,{token});host.server.listen(0,'127.0.0.1');await once(host.server,'listening');
 const ha=host.server.address();assert.ok(ha&&typeof ha==='object');
 const client=new SimulationClient({url:`http://127.0.0.1:${ha.port}`,token});
 const realEnter=client.enterDungeon.bind(client);let loseAcknowledgement=order==='leader-later';
 client.enterDungeon=async(...args)=>{
  const result=await realEnter(...args);
  if(loseAcknowledgement){loseAcknowledgement=false;throw Object.assign(new Error('Lost committed arrival acknowledgement'),{status:503});}
  return result;
 };
 const gateway=createGameServer({service:new ResidentGameService(domain,client),accounts,appOrigin});
 gateway.server.listen(0,'127.0.0.1');await once(gateway.server,'listening');
 const ga=gateway.server.address();assert.ok(ga&&typeof ga==='object');const url=`http://127.0.0.1:${ga.port}/api/game`;
 const headers=Object.fromEntries(await Promise.all(['alice','bob'].map(async accountId=>[accountId,{Origin:appOrigin,'content-type':'application/json',Cookie:`wow_session=${await issueSession({sub:accountId})}` }])));
 const request=async(account:string,path:string,body?:Rules)=>{
  const response=await fetch(url+path,{method:body?'POST':'GET',headers:headers[account],...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
 };
 const social=async(account:string,body?:Rules)=>{
  const result=await request(account,'/social?characterId='+ids[account==='alice'?0:1],body?{...body,requestId:crypto.randomUUID()}:undefined);
  assert.equal(result.status,200,JSON.stringify(result.body));return result.body;
 };
 const read=async(account:string)=>{const result=await request(account,'');assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
 const enterBody=(view:Rules)=>({type:'enterDungeon',contentId:'deadmines',characterId:view.snapshot.player.id,requestId:crypto.randomUUID(),execution:{
  instanceId:view.execution.instanceId,controllerGeneration:view.execution.controllerGeneration,clientSequence:view.execution.clientSequence+1}});
 try{
  const original={alice:await read('alice'),bob:await read('bob')};
  await social('alice',{type:'role',role:'dps'});await social('alice',{type:'partyInvite',targetId:ids[1]});
  const invitation=(await social('bob')).incoming[0];await social('bob',{type:'respond',inviteId:invitation.id,accept:true});
  await social('bob',{type:'role',role:'dps'});
  for(const targetId of npcIds)await social('alice',{type:'npcInvite',targetId});
  const proposal=(await social('alice',{type:'queue',dungeonId:'deadmines'})).proposal;
  await social('alice',{type:'proposal',proposalId:proposal.id,accept:true});await social('bob',{type:'proposal',proposalId:proposal.id,accept:true});
  assert.equal((await read('alice')).execution.instanceId,original.alice.execution.instanceId);
  assert.equal((await read('bob')).execution.instanceId,original.bob.execution.instanceId);
  if(order==='outside'){
   const failed=await request('alice','',enterBody(original.alice));assert.equal(failed.status,409);assert.match(failed.body.error,/入口/);
   assert.equal((await social('alice')).group.instanceId,undefined);
   assert.equal((await read('alice')).execution.instanceId,original.alice.execution.instanceId);
   assert.equal((await read('alice')).execution.clientSequence,original.alice.execution.clientSequence);
   return;
  }
  const first=order==='leader-first'||order==='cross-owner'?'alice':'bob',last=first==='alice'?'bob':'alice';
  const input=enterBody(original[first]);
  const forged={...input,requestId:crypto.randomUUID(),execution:{...input.execution,controllerGeneration:999}};
  assert.equal((await request(first,'',forged)).status,409);
  assert.equal((await social(first)).group.instanceId,undefined);
  let entered=await request(first,'',input);
  if(order==='leader-later'){assert.equal(entered.status,503);entered=await request(first,'',input);}
  assert.equal(entered.status,200,JSON.stringify(entered.body));
  assert.equal(entered.body.commandReceipt.durable,true);assert.equal(entered.body.commandReceipt.status,'applied');
  assert.notEqual(entered.body.execution.instanceId,original[first].execution.instanceId);
  assert.equal(entered.body.snapshot.view.instanceScene.memberCount,first==='alice'?4:1);
  const firstInstance=entered.body.execution.instanceId;
  const duplicate=await request(first,'',input);assert.equal(duplicate.status,200,JSON.stringify(duplicate.body));assert.equal(duplicate.body.execution.instanceId,firstInstance);
  const changed={...input,contentId:'wailingCaverns'};assert.equal((await request(first,'',changed)).status,409);
  if(order==='cross-owner'){
   const outside=await read('bob');
   assert.equal(outside.snapshot.player.dungeon,undefined);
   assert.equal(outside.snapshot.player.location,'deadmines');
   assert.equal(outside.snapshot.view.npcWorld.away.length,3);
   assert.notEqual(outside.execution.instanceId,original.bob.execution.instanceId);
   const personalBefore=await read('alice'),leave={...enterBody(personalBefore),type:'leaveDungeon',contentId:undefined};
   const result=await request('alice','',leave);assert.equal(result.status,200,JSON.stringify(result.body));
   const back=await request('alice','',enterBody(await read('alice')));assert.equal(back.status,200,JSON.stringify(back.body));
   assert.equal(back.body.snapshot.view.instanceScene.memberCount,4);
  }
  const arrived=await request(last,'',enterBody(await read(last)));assert.equal(arrived.status,200,JSON.stringify(arrived.body));
  const destination=arrived.body.execution.instanceId;
  assert.notEqual(destination,firstInstance);assert.equal(arrived.body.snapshot.view.instanceScene.memberCount,5);
  for(const accountId of ['alice','bob'])assert.equal((await read(accountId)).execution.instanceId,destination);
  const oldRetry=await request(first,'',input);assert.equal(oldRetry.status,200,JSON.stringify(oldRetry.body));assert.equal(oldRetry.body.execution.instanceId,destination);
  await client.checkpoint(destination);
  const saved=(await repository.load<any>(destination))!.checkpoint;
  assert.equal(saved.state.dungeon.runId,entered.body.snapshot.player.dungeon.runId);
  assert.equal(saved.recentInputs.filter((r:Rules)=>r.input.command.action.type==='enterDungeon').length,order==='cross-owner'?3:2);
  for(const npc of await store.read(tx=>tx.list('npc_characters')))assert.equal(npc.profile.runs,npcIds.includes(npc.id)?1:0);
  assert.equal((await client.inspect()).instances,1);
  await directory.remove(destination);
  for(const accountId of ['alice','bob']){
   const restored=await read(accountId);assert.equal(restored.execution.instanceId,destination);assert.equal(restored.snapshot.view.instanceScene.memberCount,5);
   assert.equal(restored.execution.receipts.find((r:Rules)=>r.requestId===input.requestId)?.durable,accountId===first?true:undefined);
  }
  // Both root promotion and member departure go through the authenticated
  // gateway. Repeated visits must not resolve to an earlier transfer receipt.
  const left=order==='leader-first'?'alice':'bob',stayed=left==='alice'?'bob':'alice';
  const leaveBody=(view:Rules)=>({...enterBody(view),type:'leaveDungeon',contentId:undefined});
  const beforeExit=await read(left),exitInput=leaveBody(beforeExit);
  const exited=await request(left,'',exitInput);
  assert.equal(exited.status,200,JSON.stringify(exited.body));
  assert.equal(exited.body.snapshot.player.dungeon,undefined);
  assert.equal(exited.body.commandReceipt.durable,true);
  assert.notEqual(exited.body.execution.instanceId,destination);
  const stillInside=await read(stayed);
  assert.equal(stillInside.snapshot.player.dungeon.runId,saved.state.dungeon.runId);
  assert.equal(stillInside.snapshot.view.instanceScene.memberCount,left===npcOwnerAccount?1:4);
  assert.notEqual(stillInside.execution.instanceId,exited.body.execution.instanceId);
  const exitRetry=await request(left,'',exitInput);
  assert.equal(exitRetry.status,200,JSON.stringify(exitRetry.body));
  assert.deepEqual(exitRetry.body.commandReceipt,exited.body.commandReceipt);
  const returned=await request(left,'',enterBody(await read(left)));
  assert.equal(returned.status,200,JSON.stringify(returned.body));
  assert.equal(returned.body.snapshot.view.instanceScene.memberCount,5);
  assert.equal(returned.body.snapshot.player.dungeon.runId,saved.state.dungeon.runId);
  // Everyone exits; the same matched party parks one shared run and can return
  // in either human order. Hidden encounter state never enters social payloads.
  for(const who of ['bob','alice']){
   const result=await request(who,'',leaveBody(await read(who)));
   assert.equal(result.status,200,JSON.stringify(result.body));
   assert.equal(result.body.snapshot.player.dungeonSaves?.deadmines,undefined);
  }
  const publicGroup=(await social('alice')).group;
  assert.equal(publicGroup.instanceId,undefined);assert.equal(publicGroup.entry.parked,undefined);
  const parked=await store.read(tx=>tx.get('social_groups',publicGroup.id));
  assert.equal(parked!.entry.parked.dungeon.runId,saved.state.dungeon.runId);
  for(const who of ['bob','alice']){
   const result=await request(who,'',enterBody(await read(who)));
   assert.equal(result.status,200,JSON.stringify(result.body));
   assert.equal(result.body.snapshot.player.dungeon.runId,saved.state.dungeon.runId);
  }
  assert.equal((await read('alice')).snapshot.view.instanceScene.memberCount,5);
  const finalRoom=(await read('alice')).execution.instanceId;await client.checkpoint(finalRoom);
  const finalState=(await repository.load<any>(finalRoom))!.checkpoint.state;
  for(const human of [finalState,...finalState.party].filter((a:Rules)=>!a.npcPlayer))assert.equal(human.dungeonEntries.length,1);
  for(const npc of await store.read(tx=>tx.list('npc_characters')))assert.equal(npc.profile.runs,npcIds.includes(npc.id)?1:0);
  assert.equal((await store.read(tx=>tx.get('social_groups',publicGroup.id)))!.entry.parked,undefined);
 }finally{await gateway.close();await host.close();await store.close();}
});
