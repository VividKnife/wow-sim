import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,advanceOwned} from '../../../packages/game-domain/src/rules/engine.js';
import {makeItem,countItem} from '../../../packages/game-domain/src/rules/character.js';
import {ensureNpcWorld} from '../../../packages/game-domain/src/rules/npc-world.js';
import {enterDungeon,dungeonRoute,dungeonAdvanceReason,advanceDungeon} from '../../../packages/game-domain/src/rules/dungeon.js';
import {dungeonView,recoveryView} from '../../../packages/game-domain/src/rules/dungeon-view.js';
import {startRecovery,resurrectionFor} from '../../../packages/game-domain/src/rules/recovery.js';
import {participantPresentationState} from '../../../packages/game-domain/src/resident-participants.ts';
import {ResidentInstance} from '../src/instance.ts';
import {SimulationHost} from '../src/host.ts';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import type {RuleAction} from '../../../packages/protocol/src/rule-action.ts';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';

function fixture(){
 const hero=(id:string):Rules=>{const s:Rules=createGame(id,283,0,{characterId:id});s.level=24;s.location='deadmines';s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;return s;};
 const state=hero('alice'),leader=hero('bob');state.party=[leader];ensureNpcWorld(state,3);
 state.party.push(...state.npcWorld.residents.slice(0,3).map((p:Rules)=>structuredClone(p.unit)));
 state.sharedParty={leaderId:leader.id,participantIds:[state.id,leader.id]};enterDungeon(state);
 const controllers=[state,leader].map(c=>({actorId:c.id,accountId:c.id,generation:1,canPause:false}));
 const admission={instanceId:'shared-progress',ownerEpoch:1,state,controllers};let sequence=0;
 const input=(actorId:string,action:RuleAction):SimulationInput=>({instanceId:admission.instanceId,actorId,controllerGeneration:1,clientSequence:++sequence,requestId:'progress-'+sequence,command:{kind:'action',action}});
 return {state,leader,admission,input};
}

test('the actual leader starts and pauses the shared route; root role does not confer leadership or clock pause',async()=>{
 const {state,admission,input}=fixture(),host=new SimulationHost();
 try{
  assert.equal(dungeonView(state).canNext,false);assert.equal(dungeonView(participantPresentationState(state,'bob')).canNext,true);
  await host.admit(admission,{realtime:false});const before=await host.checkpoint(admission.instanceId);
  assert.equal((await host.input('alice',input('alice',{type:'dungeonNext'}))).status,'rejected');
  assert.deepEqual((await host.checkpoint(admission.instanceId)).state,before.state);
  const start=input('bob',{type:'dungeonNext'});assert.equal((await host.input('bob',start)).status,'applied');
  const started=await host.checkpoint(admission.instanceId);assert.ok(started.state.combat);assert.equal(started.state.dungeon.autoAdvance,true);
  await host.remove(admission.instanceId);await host.restore(JSON.parse(JSON.stringify(started)),2,{realtime:false});
  assert.equal((await host.input('bob',start)).status,'applied');
  assert.equal((await host.input('bob',input('bob',{type:'combatCommand',order:'pause',encounterId:started.state.combat.id}))).status,'rejected');
  assert.equal((await host.input('bob',input('bob',{type:'dungeonPause'}))).status,'applied');
  const paused=await host.checkpoint(admission.instanceId);assert.equal(paused.state.dungeon.autoAdvance,false);assert.ok(paused.state.combat);
  assert.equal(paused.state.combat.id,started.state.combat.id,'route pause does not abandon or restart combat');
 }finally{await host.close();}
});

test('automatic recovery uses each humans settings and inventory; NPC provisions never come out of the root backpack',()=>{
 const {state,leader}=fixture(),npc=state.party[1];
 for(const c of [state,leader,npc]){c.hp=1;c.mana=0;c.bag=[makeItem(state,117,2),makeItem(state,159,2)];}
 state.settings.health=1;state.hp=stats(state).maxHp*.2;state.mana=stats(state).maxMana;
 leader.settings.health=100;leader.settings.mana=100;
 const rootBag=structuredClone(state.bag);startRecovery(state);
 assert.deepEqual(state.bag,rootBag);assert.equal(state.rest,null);
 assert.equal(countItem(leader,117),1);assert.equal(countItem(leader,159),1);
 assert.equal(leader.totals.food,1);assert.equal(leader.totals.water,1);
 assert.equal(countItem(npc,117),1);assert.ok(npc.rest);
 const single=structuredClone(state),chunked=structuredClone(state);advanceOwned(single,6000,{maxTicks:1000});
 for(let t=100;t<=6000;t+=100)advanceOwned(chunked,t,{maxTicks:1000});
 assert.deepEqual(chunked,single,'recovery remains deterministic across scheduler budgets');
});

test('a members rest and auto pickup operate only on their own human assets',()=>{
 const {state,leader,admission,input}=fixture();
 for(const c of [state,leader]){c.hp=1;c.mana=0;}
 leader.pending=[makeItem(state,2589,2)];const rootBag=structuredClone(state.bag);
 const runtime=new ResidentInstance(admission);
 assert.equal(runtime.input('bob',input('bob',{type:'rest'})).status,'applied');
 let checkpoint=runtime.checkpoint();assert.deepEqual(checkpoint.state.bag,rootBag);assert.equal(checkpoint.state.rest,null);
 assert.equal(runtime.input('bob',input('bob',{type:'settings',autoLoot:true})).status,'applied');runtime.advance(100);
 checkpoint=runtime.checkpoint();assert.equal(checkpoint.state.settings.autoLoot,false);assert.equal(checkpoint.state.party[0].pending.length,0);
 assert.equal(countItem(checkpoint.state.party[0],2589),2);assert.deepEqual(checkpoint.state.bag,rootBag);
});

test('pending loot and full inventories from any human stop route advancement',()=>{
 const {state,leader}=fixture();leader.pending=[makeItem(state,2589)];
 assert.match(dungeonAdvanceReason(state),/bob/);state.dungeon.autoAdvance=true;advanceDungeon(state,true);
 assert.equal(state.combat,null);assert.equal(state.dungeon.autoAdvance,false);
 leader.pending=[];leader.bag=Array.from({length:16},()=>makeItem(state,25));
 assert.match(dungeonAdvanceReason(state),/bob/);
});

test('gunpowder and the cannon use the actual leaders inventory and retried inputs cannot consume it twice',()=>{
 const {state,leader,admission,input}=fixture();const route=dungeonRoute(state);
 state.dungeon.cursor=route.findIndex((e:Rules)=>e.id==='dm-gunpowder');state.dungeon.cleared['dm-cannon-approach']=true;
 for(const mob of Object.values(state.dungeon.spawns) as Rules[])if(mob)state.dungeon.defeated[mob.sourceGuid]=true;
 const runtime=new ResidentInstance(admission),rootBag=structuredClone(state.bag);
 const take=input('bob',{type:'dungeonInteract'});assert.equal(runtime.input('bob',take).status,'applied');assert.equal(runtime.input('bob',take).status,'applied');
 let checkpoint=runtime.checkpoint();assert.deepEqual(checkpoint.state.bag,rootBag);assert.equal(countItem(checkpoint.state.party[0],5397),1);
 assert.equal(dungeonRoute(checkpoint.state)[checkpoint.state.dungeon.cursor].id,'dm-cannon');
 const fire=input('bob',{type:'dungeonInteract'});assert.equal(runtime.input('bob',fire).status,'applied');assert.equal(runtime.input('bob',fire).status,'applied');
 checkpoint=runtime.checkpoint();assert.equal(countItem(checkpoint.state.party[0],5397),0);assert.equal(checkpoint.state.activity.type,'dungeonCannon');
 const restored=ResidentInstance.restore(checkpoint,2);restored.advance(500,10);
 assert.equal(restored.checkpoint().state.dungeon.interactions['dm-cannon'],true);
 assert.equal(restored.input('bob',fire).status,'applied');assert.equal(countItem(restored.checkpoint().state.party[0],5397),0);
});

test('a teammate can request a human resurrection with real casting cost and checkpoint-safe completion',()=>{
 const {state,leader,admission,input}=fixture();state.classId=5;state.learned.push(2006);state.mana=stats(state).maxMana;
 for(const c of state.party.slice(1))c.learned=[];
 const dead=state.party[1];dead.hp=0;
 const option=resurrectionFor(state,dead.id)!;assert.equal(option.caster.id,state.id);
 assert.equal(recoveryView(participantPresentationState(state,leader.id)).fallen[0].canResurrect,true);
 const runtime=new ResidentInstance(admission),request=input('bob',{type:'resurrect',target:dead.id});
 assert.equal(runtime.input('bob',request).status,'applied');
 const casting=runtime.checkpoint(),end=casting.state.activity.endsAt;
 assert.equal(casting.state.activity.caster,state.id);assert.equal(end,option.info.castMs);
 assert.equal(casting.state.mana,state.mana,'mana is committed at successful cast completion');
 const restored=ResidentInstance.restore(JSON.parse(JSON.stringify(casting)),2);
 restored.advance(end-100,1000);assert.equal(restored.checkpoint().state.party[1].hp,0);
 restored.advance(end,1000);const finished=restored.checkpoint();
 assert.ok(finished.state.party[1].hp>0);assert.equal(finished.state.mana,state.mana-option.info.mana);
 assert.equal(finished.state.cast,null);
 assert.equal(restored.input('bob',request).status,'applied');assert.deepEqual(restored.checkpoint().state,finished.state);
});

for(const [classId,spell]of [[2,7328],[5,2006],[7,2008]])test(`automatic dungeon rescue uses a human class ${classId} and resumes after recovery`,()=>{
 const {state,leader}=fixture();state.classId=classId;state.raceId=classId===7?2:1;state.learned=[spell];state.mana=0;state.settings.autoWater=false;
 for(const c of state.party)c.learned=[];
 leader.hp=0;state.dungeon.autoAdvance=true;
 advanceDungeon(state);assert.equal(state.activity.type,'idle');assert.equal(state.dungeon.autoAdvance,true);
 state.mana=stats(state).maxMana;advanceDungeon(state);
 assert.equal(state.activity.type,'resurrect');assert.equal(state.activity.caster,state.id);assert.equal(state.activity.target,leader.id);
 const end=state.activity.endsAt;advanceOwned(state,end,{maxTicks:1000});assert.ok(leader.hp>0);
 for(const c of [state,...state.party]){c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;c.rest=null;}
 advanceDungeon(state);assert.ok(state.combat,'route continues after the human leader is revived');
});

test('resurrection chooses a ready and funded teammate instead of waiting on the first healer',()=>{
 const {state,leader}=fixture();state.classId=5;state.learned=[2006];state.mana=0;
 leader.classId=2;leader.learned=[7328];leader.mana=stats(leader).maxMana;
 for(const c of state.party.slice(1))c.learned=[];
 const dead=state.party[1];dead.hp=0;
 assert.equal(resurrectionFor(state,dead.id)!.caster.id,leader.id);
 state.mana=stats(state).maxMana;state.cooldowns[2006]=10000;
 assert.equal(resurrectionFor(state,dead.id)!.caster.id,leader.id);
 leader.cast={spell:7328};assert.equal(resurrectionFor(state,dead.id)!.caster.id,state.id);
 assert.equal(recoveryView(state).fallen[0].canResurrect,false,'cooldown is reflected in the UI');
});
