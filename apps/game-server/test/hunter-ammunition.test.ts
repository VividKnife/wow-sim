import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {runtimeVersion} from '../../simulation-host/src/version.ts';
import {SimulationDirectory} from '../../simulation-host/src/directory.ts';
import {createSimulationServer} from '../../simulation-host/src/server.ts';
import {SimulationClient} from '../src/simulation-client.ts';
import {ResidentGameService} from '../src/resident-game-service.ts';
import {createGameServer} from '../src/server.ts';
import {accounts,issueSession,appOrigin} from './session-fixture.ts';
import {restockHunterAmmo} from '../../web/lib/ammo-restock.js';
import type {Rules} from '../../../packages/game-domain/src/model.ts';

test('the frontend ammo flow reaches authenticated HTTP using ordinary shop requests',async t=>{
 const store=new MemoryStore(),domain=new GameService(store,{contentVersion:runtimeVersion.contentHash,seed:()=>283});
 const account=await domain.createAccount('account-a',{name:'服务器猎人',classId:3,raceId:2},'create');
 const actorId=account.account.primaryCharacterId;
 await store.transaction(async tx=>{
  const character=await tx.get<any>('characters',actorId);
  character.rules.location='northshire';character.rules.ammunition={};
  character.rules.ammoRestockPrompt={memberId:actorId,trigger:'town',visit:0,handled:[]};
  await tx.put('characters',character);
  await tx.put('wallets',{id:actorId,characterId:actorId,accountId:'account-a',balance:1000});
 });
 const characters=new ResidentCharacters(store,{version:runtimeVersion});
 const directory=new SimulationDirectory(new SimulationRepository(store,Date.now,characters.commit),{characters,workers:1});
 const token=randomBytes(32).toString('base64url');
 const simulation=createSimulationServer(directory,{token});simulation.server.listen(0,'127.0.0.1');await once(simulation.server,'listening');
 t.after(()=>simulation.close());
 const client=new SimulationClient({url:`http://127.0.0.1:${(simulation.server.address() as any).port}`,token});
 const game=createGameServer({service:new ResidentGameService(domain,client),accounts,appOrigin});
 game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());
 const url=`http://127.0.0.1:${(game.server.address() as any).port}/api/game`;
 const headers={origin:appOrigin,cookie:`wow_session=${await issueSession({sub:'account-a'})}`,'content-type':'application/json'};
 let current=await (await fetch(url,{headers})).json() as Rules,sequence=0;
 const actions:Rules[]=[];
 const send=async(action:Rules)=>{
  const {instanceId,controllerGeneration,clientSequence}=current.execution;
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({...action,characterId:actorId,
   requestId:`ammo-request-${++sequence}`,execution:{instanceId,controllerGeneration,clientSequence:clientSequence+1}})});
  const result=await response.json() as Rules;
  assert.equal(response.status,200,JSON.stringify(result));
  current=result;actions.push(action);return true;
 };
 await restockHunterAmmo({getSnapshot:()=>current.snapshot,send,actorId,memberId:actorId,
  visit:current.snapshot.view.ammoPrompt.visit,target:400});
 await send({type:'ammoSettings',memberId:actorId,enabled:true,target:400});
 assert.deepEqual(actions.map(a=>a.type),['buy','loadAmmo','buy','loadAmmo','ammoSettings']);
 assert.equal(current.snapshot.player.money,980);
 assert.equal(current.snapshot.view.ammo[0].count,400);
 assert.equal(current.snapshot.view.ammoPrompt,null);
 assert.equal(current.snapshot.player.ammoPolicy.enabled,true);
});
