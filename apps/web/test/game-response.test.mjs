import test from 'node:test';
import assert from 'node:assert/strict';
import {readGameResponse,responseMatchesSelection,mergeGameResponse,syncErrorMessage} from '../lib/game-response.js';
import {buildGameResponse} from '../../../packages/game-domain/src/rules/server-response.js';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';

test('successful responses preserve the frozen protocol envelope',async()=>{
 const payload=buildGameResponse(createGame('协议',37,0),3);
 assert.equal(Object.isFrozen(payload),true);
 assert.equal(payload.protocolVersion,1);
 assert.match(payload.contentVersion,/^[a-f0-9]{64}$/);
 assert.deepEqual(await readGameResponse(Response.json(payload)),payload);
 const empty=buildGameResponse(null,0);
 assert.deepEqual(await readGameResponse(Response.json(empty)),empty);
});
test('response metadata is projected through explicit public fields',()=>{
 const payload=buildGameResponse(createGame('元数据',41,0),4,{
  account:{id:'account',primaryCharacterId:'hero',partyId:'party',revision:4,createdAt:1,secret:'hidden'},
  roster:[{id:'hero',characterId:'hero',name:'元数据',classId:8,raceId:1,level:1,kind:'hero',professions:{},rules:{secret:true}}],
  activities:[{id:'activity',actorId:'hero',type:'craft',status:'running',location:'northshire',startedAt:1,settledUntil:2,nextEventAt:3,contentVersion:'v',error:'none',rngState:123,engineActivity:{type:'craft'},command:{id:'secret'}}],
  instance:{id:'instance',leaderId:'hero',contentId:'deadmines',status:'running',capacity:5,roster:[{characterId:'hero',accountId:'account',controller:'player',secret:true}],sequence:2,epoch:99,rngState:88},
 });
 assert.deepEqual(payload.account,{id:'account',primaryCharacterId:'hero',partyId:'party',revision:4});
 assert.equal(payload.instance.leaderId,'hero');
 assert.deepEqual(payload.activities,[{id:'activity',actorId:'hero',type:'craft',status:'running',location:'northshire',startedAt:1,settledUntil:2,nextEventAt:3,contentVersion:'v',error:'none'}]);
 assert.equal(JSON.stringify(payload).includes('rngState'),false);
 assert.equal(JSON.stringify(payload).includes('engineActivity'),false);
 assert.equal(JSON.stringify(payload).includes('epoch'),false);
});
test('HTML and empty server failures produce a useful reconnect message',async()=>{
 for(const body of ['<!DOCTYPE html><h1>Worker unavailable</h1>',''])await assert.rejects(readGameResponse(new Response(body,{status:503})),e=>e.status===503&&/服务.*重试/.test(e.message)&&!e.message.includes('<'));
});
test('action errors and sign-in requirements retain their meaning',async()=>{
 await assert.rejects(readGameResponse(Response.json({error:'背包空间不足'},{status:400})),/背包空间不足/);
 await assert.rejects(readGameResponse(Response.json({error:'请先登录'},{status:401})),e=>e.status===401&&e.message==='请先登录');
});
test('sync notices distinguish expired rules, database contention, timeouts and server failures',async()=>{
 for(const [status,code,message,pattern] of [[409,'CONTENT_VERSION','此活动规则已过期，请使用脱离卡死',/规则已过期/],[503,'DATABASE_BUSY','private details',/状态正在更新/],[502,'UPSTREAM','private details',/502/]]){
  const error=await readGameResponse(Response.json({error:message,code},{status})).catch(e=>e);
  assert.equal(error.code,code);assert.match(syncErrorMessage(error),pattern);
  if(status>=500)assert.ok(!syncErrorMessage(error).includes('private details'));
 }
 assert.match(syncErrorMessage(new DOMException('aborted','AbortError')),/超时/);
 assert.match(syncErrorMessage({status:401}),/重新登录/);
 assert.equal(syncErrorMessage(null),'');
});

test('invalid success payloads cannot replace a valid saved-game view',async()=>{
 for(const value of [null,[],{}, {protocolVersion:1,contentVersion:'abc',snapshot:null,revision:'3'},{protocolVersion:2,contentVersion:'abc',snapshot:null,revision:3},{protocolVersion:1,contentVersion:'',snapshot:null,revision:3},{protocolVersion:1,contentVersion:'abc',revision:3}])await assert.rejects(readGameResponse(Response.json(value)),/存档响应.*重试/);
});
test('actor selection rejects late responses even when account revisions match',()=>{
 const hero=buildGameResponse({...createGame('主角',43,0),id:'hero'},8);
 const alt=buildGameResponse({...createGame('副角',47,0),id:'alt'},8);
 assert.equal(responseMatchesSelection(hero,'hero',7),true);
 assert.equal(responseMatchesSelection(hero,'alt',-1),false);
 assert.equal(responseMatchesSelection(alt,'alt',8),true);
 assert.equal(responseMatchesSelection(alt,'alt',9),false);
});

test('owner recovery needs a full baseline and fences delayed responses from the old owner',()=>{
 const base=buildGameResponse({...createGame('恢复角色',43,0),id:'hero'},80);
 const frame=(epoch,sequence,scope='full')=>({...base,scope,revision:sequence,execution:{pendingInputs:0,receipts:[],instanceId:'room',ownerEpoch:epoch,streamSequence:sequence,actorId:'hero',controllerGeneration:1,clientSequence:4}});
 const old=frame(1,80),recovered=frame(2,1),partial=frame(2,2,'combat');
 assert.equal(responseMatchesSelection(recovered,'hero',80,old),true,'new owner restarts its public sequence');
 assert.equal(responseMatchesSelection(partial,'hero',80,old),false,'partial state cannot establish a new owner');
 assert.equal(mergeGameResponse(old,partial),null);
 assert.equal(responseMatchesSelection(frame(1,999),'hero',1,recovered),false,'large old sequence does not override fencing');
 assert.equal(responseMatchesSelection(frame(2,0),'hero',1,recovered),false);
 assert.equal(responseMatchesSelection(partial,'hero',1,recovered),true);
 assert.equal(mergeGameResponse(recovered,partial).execution.ownerEpoch,2);
 assert.equal(responseMatchesSelection({...recovered,execution:{...recovered.execution,instanceId:'other'}},'hero',1,recovered),false);
});

test('a dungeon transfer replaces the baseline without accepting late personal-room frames',()=>{
 const base=buildGameResponse({...createGame('入场角色',51,0),id:'hero'},90);
 const personal={...base,scope:'full',execution:{instanceId:'personal',ownerEpoch:8,streamSequence:90,actorId:'hero',controllerGeneration:1,clientSequence:4,pendingInputs:0,receipts:[]}};
 const dungeon={...personal,revision:1,execution:{...personal.execution,instanceId:'dungeon',ownerEpoch:2,streamSequence:1,controllerGeneration:2}};
 assert.equal(responseMatchesSelection(dungeon,'hero',90,personal),true);
 assert.equal(mergeGameResponse(personal,dungeon),dungeon);
 assert.equal(responseMatchesSelection({...dungeon,scope:'combat'},'hero',90,personal),false);
 assert.equal(responseMatchesSelection({...personal,revision:999,execution:{...personal.execution,streamSequence:999}},'hero',1,dungeon),false);
 assert.equal(responseMatchesSelection({...dungeon,execution:{...dungeon.execution,instanceId:'foreign'}},'hero',1,dungeon),false);
 const later={...dungeon,execution:{...dungeon.execution,instanceId:'joined',controllerGeneration:3}};
 assert.equal(responseMatchesSelection(later,'hero',1,dungeon),true);
 assert.equal(responseMatchesSelection(dungeon,'hero',1,later),false);
});
