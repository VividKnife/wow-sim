import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {queueCombatLoot} from '../../../packages/game-domain/src/rules/loot.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {enterDungeon} from '../../../packages/game-domain/src/rules/dungeon.js';
import {queueGroupLoot,resolveGroupLoot,tickGroupLoot,groupLootView} from '../../../packages/game-domain/src/rules/group-loot.js';
import {equipmentUpgrade,canReceiveEquipment} from '../../../packages/game-domain/src/rules/npc-equipment.js';
import {items} from '../../../packages/game-domain/src/rules/catalog.js';
import {ResidentInstance} from '../src/instance.ts';
import {SimulationHost} from '../src/host.ts';
import {validateRuleAction,type RuleAction} from '../../../packages/protocol/src/rule-action.ts';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';

function fixture(){
 const actors:Rules[]=Array.from({length:5},(_,i)=>{
  const actor:Rules=createGame('human-'+i,283+i,0,{characterId:'human-'+i,classId:8,raceId:1});
  actor.level=20;actor.location='deadmines';actor.equipment={};actor.hp=stats(actor).maxHp;actor.mana=stats(actor).maxMana;return actor;
 });
 const state=actors[0];state.party=actors.slice(1);enterDungeon(state);
 state.sharedParty={leaderId:actors[1].id,participantIds:actors.map(c=>c.id)};
 const controllers=actors.map((c,i)=>({actorId:c.id,accountId:'account-'+i,generation:1,canPause:false}));
 assert.equal(queueGroupLoot(state,5201,1),true,'a human-only party also uses group loot');
 const loot=state.groupLoot.pending[0];for(const [i,m]of loot.members.entries())m.roll=i===2?100:1;
 let sequence=0;
 const input=(i:number,action:RuleAction):SimulationInput=>({instanceId:'shared-loot',actorId:actors[i].id,controllerGeneration:1,
  clientSequence:++sequence,requestId:'vote-'+sequence,command:{kind:'action',action}});
 return {state,actors,loot,controllers,input,admission:{instanceId:'shared-loot',state,controllers,ownerEpoch:1}};
}

test('every human votes independently; the leader cannot vote for members and human need awards never auto-equip',()=>{
 const {state,actors,loot}=fixture(),rng=state.rngState;
 assert.equal(groupLootView(state).pending[0].waiting,5);
 assert.equal(equipmentUpgrade(actors[2],items[5201]).need,true);
 resolveGroupLoot(state,loot.id,'greed');
 assert.equal(state.groupLoot.pending.length,1);
 assert.equal(groupLootView(state).pending[0].choice,'greed');
 assert.equal(groupLootView(state).pending[0].canGreed,false);
 resolveGroupLoot(state,loot.id,'greed'); // Same vote is harmless while waiting.
 assert.throws(()=>resolveGroupLoot(state,loot.id,'need'),/已经选择/);
 assert.throws(()=>resolveGroupLoot(state,loot.id,'greed','outsider'),/名单/);
 assert.throws(()=>validateRuleAction({type:'groupLoot',id:loot.id,choice:'pass',actorId:actors[2].id}),/fields/);
 resolveGroupLoot(state,loot.id,'pass',actors[1].id);
 resolveGroupLoot(state,loot.id,'need',actors[2].id);
 resolveGroupLoot(state,loot.id,'pass',actors[3].id);
 assert.equal(state.groupLoot.pending.length,1);
 resolveGroupLoot(state,loot.id,'pass',actors[4].id);
 assert.equal(state.groupLoot.pending.length,0);
 assert.equal(actors[2].pending[0].uid,loot.item.uid);
 assert.deepEqual(actors[2].equipment,{});
 assert.equal(state.groupLoot.history[0].winner,actors[2].name);
 assert.equal(actors.flatMap(c=>c.pending).filter((i:Rules)=>i.uid===loot.item.uid).length,1);
 assert.equal(state.rngState,rng,'voting and retries never reroll');
 assert.throws(()=>resolveGroupLoot(state,loot.id,'need',actors[2].id),/已经分配/);
});

test('automatic preferences and timeout apply separately per human during combat',()=>{
 const {state,actors}=fixture();
 state.groupLoot.pending=[];state.combat={id:'battle',dungeon:true};queueGroupLoot(state,5201,1);const loot=state.groupLoot.pending[0];
 actors[0].npcWorld={autoLoot:true};
 assert.equal(loot.deadline,60000);
 state.clock=1000;tickGroupLoot(state);
 assert.equal(loot.members[0].choice,'need');
 assert.ok(loot.members.slice(1).every((m:Rules)=>m.choice===null));
 resolveGroupLoot(state,loot.id,'pass',actors[1].id);
 state.clock=59999;tickGroupLoot(state);assert.equal(state.groupLoot.pending.length,1);
 state.clock=60000;tickGroupLoot(state);assert.equal(state.groupLoot.pending.length,0);
 assert.deepEqual(state.groupLoot.history[0].votes.map((m:Rules)=>m.choice),['need','pass','greed','greed','greed']);
 assert.equal(state.groupLoot.history[0].winner,actors[0].name,'need priority beats a higher greed roll');
});

test('shared party members can vote and receive rolled equipment during room combat',()=>{
 const {admission,actors,input,loot}=fixture();
 startCombat(admission.state,[636],true);
 const runtime=new ResidentInstance(admission);
 for(let i=0;i<actors.length;i++){
  const receipt=runtime.input('account-'+i,input(i,{type:'groupLoot',id:loot.id,choice:i===2?'need':'pass'}));
  assert.equal(receipt.status,'applied',receipt.reason);
 }
 const state=runtime.checkpoint().state;
 assert.ok(state.combat);
 assert.equal(state.groupLoot.pending.length,0);
 assert.equal(state.party[1].pending[0].uid,loot.item.uid);
 assert.equal(state.groupLoot.history[0].winner,actors[2].name);
});

test('shared loot votes survive a real worker recovery; private receipt/projection and pickup use the sender',async()=>{
 const {admission,actors,loot,input}=fixture(),host=new SimulationHost();
 try{
  await host.admit(admission,{realtime:false});
  const first=input(0,{type:'groupLoot',id:loot.id,choice:'pass'});
  assert.equal((await host.input('account-0',first)).status,'applied');
  const saved=await host.checkpoint(admission.instanceId);
  await host.remove(admission.instanceId);await host.restore(JSON.parse(JSON.stringify(saved)),2,{realtime:false});
  assert.equal((await host.input('account-0',first)).status,'applied');
  const a=await host.presentation(admission.instanceId,'account-0',actors[0].id,'full');
  const b=await host.presentation(admission.instanceId,'account-2',actors[2].id,'full');
  const av=a.snapshot!.view.groupLoot as Rules,bv=b.snapshot!.view.groupLoot as Rules;
  assert.equal(av.pending[0].choice,'pass');assert.equal(bv.pending[0].choice,null);
  assert.equal(bv.pending[0].waiting,4);
  assert.equal(bv.pending[0].canNeed,true);
  assert.ok(bv.pending[0].members.every((m:Rules)=>!Object.hasOwn(m,'roll')&&!Object.hasOwn(m,'tie')));
  for(const i of [1,2,3,4]){
   const receipt=await host.input('account-'+i,input(i,{type:'groupLoot',id:loot.id,choice:i===2?'need':'pass'}));
   assert.equal(receipt.status,'applied',receipt.reason);
  }
  const won=await host.checkpoint(admission.instanceId),winner=won.state.party[1];
  assert.equal(winner.pending[0].uid,loot.item.uid);
  const leaderBag=structuredClone(won.state.bag);
  assert.equal((await host.input('account-0',input(0,{type:'loot',uids:[loot.item.uid]}))).status,'applied');
  assert.equal((await host.checkpoint(admission.instanceId)).state.party[1].pending[0].uid,loot.item.uid,'another human cannot collect this asset');
  const pickup=input(2,{type:'loot',uids:[loot.item.uid]});
  assert.equal((await host.input('account-2',pickup)).status,'applied');
  assert.equal((await host.input('account-2',pickup)).status,'applied');
  const after=await host.checkpoint(admission.instanceId);
  assert.deepEqual(after.state.bag,leaderBag);assert.equal(after.state.party[1].pending.length,0);
  assert.equal(after.state.party[1].bag.filter((i:Rules)=>i.uid===loot.item.uid).length,1);
  const privateView=await host.presentation(admission.instanceId,'account-0',actors[0].id,'full');
  assert.equal((privateView.snapshot!.view.groupLoot as Rules).history[0].winner,actors[2].name);
  assert.equal((privateView.snapshot!.player as Rules).bag.some((i:Rules)=>i.uid===loot.item.uid),false);
 }finally{await host.close();}
});

test('member pickup remains blocked during a room combat even though the member has no private combat object',()=>{
 const {admission,actors,input,loot}=fixture();
 startCombat(admission.state,[636],true);
 const runtime=new ResidentInstance(admission),before=runtime.checkpoint().state;
 const receipt=runtime.input('account-2',input(2,{type:'loot',uids:[loot.item.uid]}));
 assert.equal(receipt.status,'rejected');assert.match(receipt.reason!,/结束战斗/);
 assert.deepEqual(runtime.checkpoint().state,before);
 assert.equal(actors[2].pending.length,0);
});


test('only two drops are active; queued loot receives a fresh deadline on promotion and survives restore',()=>{
 const {state,actors,loot}=fixture();queueGroupLoot(state,5201,3);
 assert.equal(groupLootView(state).pending.length,2);assert.equal(groupLootView(state).queued,2);
 assert.deepEqual(state.groupLoot.pending.map((l:Rules)=>l.deadline),[60000,60000,null,null]);
 const queued=state.groupLoot.pending[2];
 assert.throws(()=>resolveGroupLoot(state,queued.id,'greed'),/排队/);
 state.clock=59000;
 for(const actor of actors)resolveGroupLoot(state,loot.id,'pass',actor.id);
 assert.equal(state.groupLoot.pending[1].id,queued.id);assert.equal(queued.deadline,119000);
 const restored=JSON.parse(JSON.stringify(state));restored.clock=60000;tickGroupLoot(restored);
 assert.equal(restored.groupLoot.pending[0].id,queued.id);
 assert.equal(restored.groupLoot.pending[0].deadline,119000);
 assert.equal(restored.groupLoot.pending[1].deadline,120000);
 assert.equal(groupLootView(restored).queued,0);
});

test('white and gray dungeon drops are allocated round-robin without consuming roll RNG or creating votes',()=>{
 const {state,actors}=fixture();state.groupLoot.pending=[];state.combat={id:'ordinary-loot',dungeon:true};
 const rng=state.rngState;queueCombatLoot(state,2770,3);queueCombatLoot(state,7073,2);
 assert.equal(items[2770].Quality,1);assert.equal(items[7073].Quality,0);
 assert.equal(actors[0].pending[0].id,2770);assert.equal(actors[0].pending[0].count,3);
 assert.equal(actors[1].pending[0].id,7073);assert.equal(actors[1].pending[0].count,2);
 assert.notEqual(actors[0].pending[0].uid,actors[1].pending[0].uid);
 assert.equal(state.groupLoot.pending.length,0);assert.equal(state.rngState,rng);
 const restored=JSON.parse(JSON.stringify(state));queueCombatLoot(restored,2770,1);
 assert.equal(restored.party[1].pending[0].id,2770,'round-robin continues after restore');
});

test('automatic allocation counts auctioned unique items and terminates when everyone owns the limit',()=>{
 const {state,actors}=fixture();state.groupLoot.pending=[];state.combat={id:'unique-loot',dungeon:true};
 const id=918,data=items[id];assert.equal(data.maxcount,1);assert.equal(data.Quality,1);
 const rng=state.rngState;
 actors[0].auctions=[{item:{id,count:1,uid:'auctioned-unique'}}];
 assert.equal(canReceiveEquipment(actors[0],data),false,'listed items remain owned until sold');
 queueCombatLoot(state,id,1);
 assert.equal(actors[0].pending.length,0);
 assert.equal(actors[1].pending[0].id,id,'allocation skips the owner of the listed item');
 for(const actor of actors.slice(2))actor.bank=[{id,count:1,uid:'bank-unique-'+actor.id}];
 const before=JSON.stringify(state);
 queueCombatLoot(state,id,3);
 assert.equal(JSON.stringify(state),before,'no zero-count items or cursor churn when nobody can receive');
 assert.equal(state.rngState,rng);
});
