import test from 'node:test';
import assert from 'node:assert/strict';
import {ResidentInstance} from '../src/instance.ts';
import {SimulationHost} from '../src/host.ts';
import {createGame, stats} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import type {Controller, SimulationCommand, SimulationInput} from '../../../packages/protocol/src/simulation.ts';
import {validateRuleAction,type RuleAction} from '../../../packages/protocol/src/rule-action.ts';

function fixture(shared = true, canPause = true) {
  const hero = (id:string,classId:number):Rules => {
    const c:Rules=createGame(id,283,0,{characterId:id,classId,raceId:1});
    c.level=20;c.rules=[];c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;return c;
  };
  const state=hero('captain',8),member=hero('healer',5),bot=hero('bot',1);
  member.learned.push(2050);state.party=[member,bot];
  startCombat(state,[636],true);delete state.combat.pull;
  for(const c of [state,...state.party])Object.assign(c,{position:0,positionY:0,nextAction:0,nextSwing:999999});
  Object.assign(state.combat.enemies[0],{position:1,positionY:0,hp:100000,maxHp:100000,stunUntil:999999});
  const controllers:Controller[]=[
    {actorId:state.id,accountId:'alice',generation:1,canPause},
    {actorId:member.id,accountId:shared?'bob':'alice',generation:1,canPause:false}
  ];
  const admission={instanceId:'controls',ownerEpoch:1,state,controllers};
  const runtime=new ResidentInstance(admission);
  let sequence=0;
  const input=(actorId:string,command:SimulationCommand):SimulationInput=>({
    instanceId:'controls',actorId,controllerGeneration:1,clientSequence:++sequence,requestId:'request-'+sequence,command
  });
  const send=(actorId:string,action:RuleAction)=>runtime.input(controllers.find(c=>c.actorId===actorId)!.accountId,input(actorId,{kind:'action',action}));
  return {runtime,state,controllers,admission,input,send};
}

test('a second human changes only their own recovery settings and strategy, never the leader inventory or clock',()=>{
  const {runtime,state,send}=fixture();
  const original=runtime.checkpoint().state;
  assert.equal(send('healer',{type:'settings',health:37,mana:42}).status,'applied');
  assert.equal(send('healer',{type:'strategy',rules:[]}).status,'applied');
  const after=runtime.checkpoint().state;
  assert.deepEqual(after.settings,original.settings);
  assert.equal(after.party[0].settings.health,37);
  assert.equal(after.party[0].settings.mana,42);
  assert.deepEqual(after.party[0].rules,[]);
  assert.equal(send('healer',{type:'settings',autoLoot:true}).status,'applied');
  after.party[0].settings.autoLoot=true;
  for(const action of [
    {type:'strategy',target:state.id,rules:[]},
    {type:'rest'}, {type:'sell',uid:'someone-elses-item'},
    {type:'combatCommand',order:'holdFire',encounterId:state.combat.id,enabled:true}
  ])assert.equal(send('healer',action).status,'rejected',action.type);
  assert.deepEqual(runtime.checkpoint().state,after,'rejections leave all rule state and RNG unchanged');
});

test('manual healing uses the sender even when the leader is dead; a friendly recipient is not a controller grant',()=>{
  const {state,admission,input}=fixture();
  state.hp=0;state.party[1].hp=1;
  const runtime=new ResidentInstance({...admission,state});
  const receipt=runtime.input('bob',input('healer',{kind:'action',action:{type:'cast',id:2050,target:'bot'}}));
  assert.equal(receipt.status,'applied',receipt.reason);
  const next=runtime.checkpoint().state;
  assert.equal(next.party[0].cast.spell,2050);
  assert.equal(next.party[0].cast.target,'bot');
  assert.equal(next.cast,null);
  assert.equal(next.hp,0);
});

test('member selectors cannot hijack a human through cast, movement, strategy, or implicit team orders',()=>{
  const {runtime,state,send}=fixture();
  const before=runtime.checkpoint().state;
  const encounterId=state.combat.id;
  for(const action of [
    {type:'combatCommand',order:'cast',memberId:'healer',spellId:2050,targetId:'captain',encounterId},
    {type:'combatCommand',order:'stopCast',memberId:'healer',encounterId},
    {type:'combatCommand',order:'mode',mode:'aoe',memberId:'healer',encounterId},
    {type:'combatCommand',order:'moveTo',memberIds:['bot','healer'],destination:{x:0,y:1},encounterId},
    {type:'combatCommand',order:'cancelMove',memberIds:['healer'],encounterId},
    {type:'combatCommand',order:'holdFire',enabled:true,encounterId},
    {type:'combatCommand',order:'clearAll',encounterId},
    {type:'combatCommand',order:'mode',mode:'auto',encounterId},
    {type:'strategy',target:'healer',rules:[]}, {type:'equip',target:'healer',uid:'item'},
  ])assert.equal(send('captain',action).status,'rejected',JSON.stringify(action));
  assert.deepEqual(runtime.checkpoint().state,before);
  assert.equal(send('captain',{type:'combatCommand',order:'stopCast',memberId:'bot',encounterId}).status,'applied');
  assert.equal(send('healer',{type:'combatCommand',order:'stopCast',memberId:'healer',encounterId}).status,'applied');
  assert.equal(send('healer',{type:'combatCommand',order:'stopCast',memberId:'bot',encounterId}).status,'rejected');
});

test('all clock aliases honor pause policy; shared clocks cannot be paused by granting the leader canPause',()=>{
  for(const shared of [true,false]){
    const {runtime,state,send,input}=fixture(shared,false);
    const before=runtime.checkpoint().state;
    for(const order of ['prepare','takeover','pause','resume']){
      const receipt=send('captain',{type:'combatCommand',order,encounterId:state.combat.id,enabled:true});
      assert.equal(receipt.status,'rejected');assert.match(receipt.reason!,/Pause/);
    }
    assert.equal(runtime.input('alice',input('captain',{kind:'pause',encounterId:state.combat.id})).status,'rejected');
    assert.deepEqual(runtime.checkpoint().state,before);
  }
  const shared=fixture(true,true);
  assert.equal(shared.send('captain',{type:'combatCommand',order:'takeover',encounterId:shared.state.combat.id}).status,'rejected');
  const personal=fixture(false,true);
  assert.equal(personal.send('captain',{type:'combatCommand',order:'pause',encounterId:personal.state.combat.id}).status,'applied');
  assert.equal(personal.runtime.checkpoint().state.combat.command.paused,true);
});

test('pet protocol reaches the actual sender pet; private inventory operations are still rejected',()=>{
  const {state,admission,input}=fixture();
  state.pet={id:'captain-pet',hp:100,mode:'aggressive'};
  state.party[0].pet={id:'healer-pet',hp:100,mode:'aggressive'};
  const runtime=new ResidentInstance({...admission,state});
  for(const action of [
    {type:'petCommand',command:'passive'},
    {type:'petCommand',command:'attack',targetId:state.combat.enemies[0].id},
  ]){
    validateRuleAction(action);
    const result=runtime.input('bob',input('healer',{kind:'action',action}));
    assert.equal(result.status,'applied',result.reason);
  }
  const after=runtime.checkpoint().state;
  assert.equal(after.pet.mode,'aggressive');assert.equal(after.party[0].pet.mode,'attack');
  assert.equal(after.party[0].pet.targetId,state.combat.enemies[0].id);
  for(const command of ['feed','train','abandon']){
    const result=runtime.input('bob',input('healer',{kind:'action',action:{type:'petCommand',command}}));
    assert.equal(result.status,'rejected');
  }
  assert.deepEqual(runtime.checkpoint().state,after);
  assert.throws(()=>validateRuleAction({type:'petCommand',command:'attack',ownerId:'captain'}),/fields/);
});

test('member input survives a real worker checkpoint and keeps authorization, ordering and retry identity',async()=>{
  const {state,admission,input}=fixture();
  const host=new SimulationHost();
  try{
    await host.admit(admission,{realtime:false});
    const own=input('healer',{kind:'action',action:{type:'settings',health:31,mana:44}});
    const forged=input('captain',{kind:'action',action:{type:'combatCommand',order:'stopCast',memberId:'healer',encounterId:state.combat.id}});
    const first=await host.input('bob',own);
    assert.equal(first.status,'applied');
    assert.equal((await host.input('alice',forged)).status,'rejected');
    const checkpoint=await host.checkpoint('controls');
    await host.remove('controls');await host.restore(JSON.parse(JSON.stringify(checkpoint)),2,{realtime:false});
    assert.deepEqual(await host.input('bob',own),first);
    const restored=await host.checkpoint('controls');
    assert.deepEqual(restored.state,checkpoint.state);
    assert.equal(restored.appliedInputSequence,2);
    assert.equal((await host.presentation('controls','bob','healer','full')).snapshot?.player.id,'healer');
  }finally{await host.close();}
});

test('queued hostile input is reauthorized after checkpoint restoration before touching rule state',()=>{
  const {runtime,state,input}=fixture();
  const attack=input('captain',{kind:'action',action:{type:'combatCommand',order:'stopCast',memberId:'healer',encounterId:state.combat.id}});
  assert.equal(runtime.input('alice',attack,500).status,'queued');
  const restored=ResidentInstance.restore(runtime.checkpoint(),2);
  restored.advance(500);
  const checkpoint=restored.checkpoint();
  assert.equal(checkpoint.recentInputs[0].receipt.status,'rejected');
  assert.match(checkpoint.recentInputs[0].receipt.reason!,/Member control/);
  assert.equal(checkpoint.appliedInputSequence,1);
});

test('untyped controller permissions cannot turn truthy JSON into authority',()=>{
  const {admission}=fixture(false);
  assert.throws(()=>new ResidentInstance({...admission,controllers:[{...admission.controllers[0],canPause:'false' as unknown as boolean}]}),/controller/);
});
