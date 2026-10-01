import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {residentPartyFixture} from '../../../packages/game-domain/test/support/resident-party.ts';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import {makeItem} from '../../../packages/game-domain/src/rules/character.js';
import {runtimeVersion} from '../../simulation-host/src/version.ts';
import {SimulationDirectory} from '../../simulation-host/src/directory.ts';
import {createSimulationServer} from '../../simulation-host/src/server.ts';
import {SimulationClient} from '../src/simulation-client.ts';
import {ResidentGameService} from '../src/resident-game-service.ts';
import {createGameServer} from '../src/server.ts';
import {accounts,issueSession,appOrigin} from './session-fixture.ts';

test('two authenticated accounts read and command their own characters through one resident worker and recover the same shared room', {timeout:60000},async()=>{
  const store=residentStore(new MemoryStore());let reward!:Rules;
  const {admission,ids}=await residentPartyFixture(store,Date.now(),state=>{
    reward=makeItem(state,5201);
    state.groupLoot={pending:[{id:reward.uid,item:reward,deadline:null,members:[state,...state.party].map((actor:Rules,index:number)=>({
      id:actor.id,name:index?'bob':'alice',npc:false,eligible:true,need:false,choice:null,roll:index?100:1,tie:0
    }))}],history:[]};
  });
  const characters=new ResidentCharacters(store,{version:runtimeVersion});
  const repository=new SimulationRepository(store,Date.now,characters.commit);
  const directory=new SimulationDirectory(repository,{characters}),token=randomBytes(32).toString('base64url');
  const host=createSimulationServer(directory,{token});
  host.server.listen(0,'127.0.0.1');await once(host.server,'listening');
  const ha=host.server.address();assert.ok(ha&&typeof ha==='object');
  const client=new SimulationClient({url:`http://127.0.0.1:${ha.port}`,token});
  const service=new ResidentGameService(new GameService(store,{contentVersion:'test'}),client);
  const gateway=createGameServer({service,accounts,appOrigin});
  gateway.server.listen(0,'127.0.0.1');await once(gateway.server,'listening');
  const ga=gateway.server.address();assert.ok(ga&&typeof ga==='object');
  const url=`http://127.0.0.1:${ga.port}/api/game`;
  const headers=Object.fromEntries(await Promise.all(['alice','bob'].map(async id=>[id,{
    Origin:appOrigin,Cookie:`wow_session=${await issueSession({sub:id})}`,'content-type':'application/json'
  }])));
  const read=async(id:string)=>{const response=await fetch(url,{headers:headers[id]});assert.equal(response.status,200);return response.json();};
  const command=(id:string,current:any,action:any)=>fetch(url,{method:'POST',headers:headers[id],body:JSON.stringify({
    ...action,characterId:current.snapshot.player.id,requestId:crypto.randomUUID(),execution:{
      instanceId:current.execution.instanceId,controllerGeneration:current.execution.controllerGeneration,clientSequence:current.execution.clientSequence+1
    }})});
  try{
    const [a,b]=await Promise.all([read('alice'),read('bob')]);
    assert.equal(a.execution.instanceId,admission.instanceId);assert.equal(b.execution.instanceId,admission.instanceId);
    assert.equal((await client.inspect()).instances,1);
    assert.equal(a.snapshot.player.id,ids[0]);assert.equal(b.snapshot.player.id,ids[1]);
    assert.equal(a.snapshot.player.money,1111);assert.equal(b.snapshot.player.money,2222);
    assert.equal(JSON.stringify(b).includes('PRIVATE-ALICE'),false);
    assert.equal((await fetch(url+'?characterId='+ids[0],{headers:headers.bob})).status,403);
    const changed=await command('bob',b,{type:'settings',health:37,mana:41});assert.equal(changed.status,200);
    const updated=await changed.json();
    assert.equal(updated.snapshot.player.settings.health,37);
    const unaffected=await read('alice');assert.equal(unaffected.snapshot.player.settings.health,a.snapshot.player.settings.health);
    const denied=await command('alice',unaffected,{type:'strategy',target:ids[1],rules:[]});
    assert.equal(denied.status,409);
    const leftVote=await command('alice',await read('alice'),{type:'groupLoot',id:reward.uid,choice:'greed'});
    assert.equal(leftVote.status,200);const leftVoted=await leftVote.json();
    assert.equal(leftVoted.snapshot.view.groupLoot.pending[0].choice,'greed');
    const rightWaiting=await read('bob');
    assert.equal(rightWaiting.snapshot.view.groupLoot.pending[0].choice,null);
    assert.equal(rightWaiting.snapshot.view.groupLoot.pending[0].waiting,1);
    assert.equal(rightWaiting.snapshot.view.groupLoot.pending[0].members.some((m:any)=>'roll' in m||'tie' in m),false);
    const rightVote=await command('bob',rightWaiting,{type:'groupLoot',id:reward.uid,choice:'greed'});
    assert.equal(rightVote.status,200);const won=await rightVote.json();
    assert.equal(won.snapshot.view.groupLoot.pending.length,0);
    assert.equal(won.snapshot.player.pending.some((item:any)=>item.uid===reward.uid),true);
    const picked=await command('bob',won,{type:'loot',uids:[reward.uid]});assert.equal(picked.status,200);
    const pickedState=await picked.json();assert.equal(pickedState.snapshot.player.bag.some((i:any)=>i.uid===reward.uid),true);
    assert.equal((await read('alice')).snapshot.player.bag.some((i:any)=>i.uid===reward.uid),false);
    await client.checkpoint(admission.instanceId);
    const before=await repository.load<any>(admission.instanceId);
    assert.equal(before!.checkpoint.state.party[0].settings.health,37);
    await directory.remove(admission.instanceId);
    const resumed=await read('bob');
    assert.equal(resumed.execution.instanceId,admission.instanceId);
    assert.ok(resumed.execution.ownerEpoch>b.execution.ownerEpoch);
    assert.equal(resumed.snapshot.player.settings.health,37);
    assert.equal(resumed.snapshot.player.money,2222);
    assert.equal(resumed.snapshot.player.bag.filter((item:any)=>item.uid===reward.uid).length,1);
    assert.equal(resumed.snapshot.view.groupLoot.history[0].winner,'bob');
    assert.equal((await store.read(tx=>tx.get('items',reward.uid)))!.ownerCharacterId,ids[1]);
    assert.equal((await client.inspect()).instances,1);
    assert.equal(JSON.stringify(resumed).includes('PRIVATE-ALICE'),false);
  }finally{
    await gateway.close();await host.close();await directory.close();await store.close();
  }
});
