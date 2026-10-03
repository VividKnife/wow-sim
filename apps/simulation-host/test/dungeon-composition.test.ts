import {npcFixture} from '../../../packages/game-domain/test/support/npc-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {residentPartyFixture} from '../../../packages/game-domain/test/support/resident-party.ts';
import {npcAward} from '../../../packages/game-domain/src/rules/npc-world.js';
import {rebaseSimulation} from '../../../packages/game-domain/src/simulation-clock.ts';
import {addPeriodicEffect,simulationEventRuntime,preparePeriodicEffects} from '../../../packages/game-domain/src/rules/simulation-events.js';
import {addEnemyAura} from '../../../packages/game-domain/src/rules/enemy-aura-events.js';
import {tickClassEffects} from '../../../packages/game-domain/src/rules/class-mechanics.js';
import {stats,gainXp} from '../../../packages/game-domain/src/rules/character.js';
import {applyExperienceBuff} from '../../../packages/game-domain/src/rules/experience.js';
import {xpTable} from '../../../packages/game-domain/src/rules/catalog.js';
import {advanceOwned} from '../../../packages/game-domain/src/rules/engine.js';
import {ResidentInstance,type InstanceCheckpoint} from '../src/instance.ts';
import {composeDungeonCheckpoint} from '../src/dungeon-composition.ts';
import type {Rules} from '../../../packages/game-domain/src/model.ts';

async function fixture(){
  const {admission,ids}=await residentPartyFixture(new MemoryStore(),1000);
  const states=[admission.state,admission.state.party[0]];
  for(const [i,s]of states.entries()){
    s.party=[];s.level=20;s.location='deadmines';s.hp=stats(s).maxHp-100;s.mana=stats(s).maxMana;
    npcFixture(s,i*100);
    s.party=s.npcWorld.residents.slice(0,i?1:2).map((p:Rules)=>structuredClone(p.unit));
    s.npcWorld.selection=s.party.map((p:Rules)=>p.id);
    rebaseSimulation(s,10000+i*12345);
    addPeriodicEffect(s,s,'hots',{spell:139,name:'Renew',caster:s.id,amount:10,next:s.clock+1000,interval:1000,until:s.clock+3000});
    addEnemyAura(s,s,{spell:16403,type:3,amount:1,interval:1000,next:s.clock+1000,until:s.clock+3000,caster:s.id,positive:false});
    s.attackEventIds={main:1};s.powerEventId=1;
  }
  const runtimes=states.map((state,i)=>new ResidentInstance({instanceId:'personal:'+i,ownerEpoch:1,state,
    controllers:[admission.controllers[i]],presence:{offlineLimitMs:7200000,accounts:[[admission.controllers[i].accountId,1000]]}}));
  for(const [i,runtime]of runtimes.entries())runtime.input(i?'bob':'alice',{instanceId:runtime.instanceId,actorId:ids[i],controllerGeneration:1,
    clientSequence:1,requestId:'same-request-per-account',command:{kind:'action',action:{type:'settings',health:50,mana:50}}});
  return {sources:runtimes.map(r=>r.checkpoint()),ids};
}
const options=(sources:InstanceCheckpoint[])=>({instanceId:'shared:composed',ownerEpoch:1,primaryActorId:sources[0].state.id,roster:{groupId:'test:party',leaderId:sources[0].state.id,dungeonId:'deadmines',members:sources.flatMap(s=>[s.state,...s.state.party].map((c:Rules)=>({id:c.id,npc:!!c.npcPlayer}))) }});

for(const rate of [0,1,2,3])test(`dungeon NPCs receive server XP rate ${rate} and retain it after restore`,async()=>{
  const {sources}=await fixture();
  for(const source of sources){
    applyExperienceBuff(source.state,rate);
    source.state.serverBuffs.push({id:'human-only',gm:true,xpMultiplier:5});
    for(const npc of source.state.party)delete npc.serverBuffs;
  }
  const checkpoint=composeDungeonCheckpoint(sources,options(sources));
  const state=ResidentInstance.restore(JSON.parse(JSON.stringify(checkpoint)),2).checkpoint().state;
  for(const npc of state.party.filter((c:Rules)=>c.npcPlayer)){
    assert.equal(npc.serverBuffs.find((b:Rules)=>b.id==='server-experience')?.xpMultiplier??1,rate);
    assert.ok(!npc.serverBuffs.some((b:Rules)=>b.id==='human-only'));
    const level=npc.level,threshold=xpTable[level].xp_for_next_level;
    npc.xp=threshold-15;
    gainXp(state,npc,10);
    assert.equal(npc.level,level+(rate>=2?1:0));
    assert.equal(npc.xp,rate>=2?10*rate-15:threshold-15+10*rate);
  }
});

test('two personal clocks compose into five seats without losing identities, effects, private assets or input deduplication',async()=>{
  const {sources,ids}=await fixture(),before=structuredClone(sources);
  assert.equal(sources[0].state.hots[0].periodicEventId,sources[1].state.hots[0].periodicEventId);
  const checkpoint=composeDungeonCheckpoint(sources,options(sources)),state=checkpoint.state;
  assert.deepEqual(sources,before);assert.equal(state.party.length,4);assert.equal(state.dungeon.id,'deadmines');
  assert.equal(state.party.filter((c:Rules)=>!c.npcPlayer).length,1);
  assert.doesNotThrow(()=>simulationEventRuntime(state));
  const human=[state,state.party.find((c:Rules)=>c.id===ids[1])];
  assert.notEqual(human[0].hots[0].periodicEventId,human[1].hots[0].periodicEventId);
  assert.notEqual(human[0].auras[0].enemyAuraEventId,human[1].auras[0].enemyAuraEventId);
  for(const [i,actor]of human.entries()){
    assert.equal(actor.hots[0].next-state.clock,1000);assert.equal(actor.hots[0].until-state.clock,3000);
    for(const key of ['bag','bank','money','itemSequence','quests','completed','strategyProfiles'])assert.deepEqual(actor[key],sources[i].state[key],key);
    if(i)assert.equal(actor.rngState,sources[i].state.rngState);
    assert.equal(actor.attackEventIds,undefined);assert.equal(actor.powerEventId,undefined);
    assert.deepEqual(actor.dungeonEntries,[1000]);
    for(const npc of state.party.filter((c:Rules)=>c.npcPlayer&&actor.npcWorld.residents.some((p:Rules)=>p.id===c.id)))
      assert.equal(actor.npcWorld.residents.find((p:Rules)=>p.id===npc.id).runs,1);
  }
  assert.ok(checkpoint.controllers.every(c=>c.generation===2&&!c.canPause));
  const runtime=ResidentInstance.restore(checkpoint,2);
  for(const row of checkpoint.recentInputs)assert.deepEqual(runtime.input(row.accountId,row.input),row.receipt);
  assert.throws(()=>runtime.input('bob',{...checkpoint.recentInputs[1].input,controllerGeneration:1}),/fenced/);
  const restored=JSON.parse(JSON.stringify(state));
  for(const s of [state,restored])advanceOwned(s,s.wallAt+3100);
  assert.deepEqual(state,restored);
  for(const id of ids)assert.equal(state.logs.filter((l:Rules)=>l.kind==='heal'&&l.actorId===id).length,3);
  const npc=state.party.find((c:Rules)=>c.npcPlayer&&human[1].npcWorld.residents.some((p:Rules)=>p.id===c.id));
  const record=human[1].npcWorld.residents.find((p:Rules)=>p.id===npc.id),wallet=record.wallet;
  assert.doesNotThrow(()=>npcAward(state,npc,{id:159,count:1},false));assert.ok(record.wallet>=wallet);
});

test('already-dispatched healing remains ready exactly once through composition',async()=>{
  const {sources}=await fixture();
  for(const source of sources){source.state.clock+=1000;source.state.nextTick=source.state.clock+100;source.state.nextRegen=source.state.clock+2000;preparePeriodicEffects(source.state);}
  const {state}=composeDungeonCheckpoint(sources,options(sources));
  const humans=[state,...state.party.filter((c:Rules)=>!c.npcPlayer)],hp=humans.map(s=>s.hp);
  tickClassEffects(state,[state,...state.party],{});tickClassEffects(state,[state,...state.party],{});
  assert.deepEqual(humans.map(s=>s.hp),hp.map(n=>n+10));
  assert.ok(humans.every(s=>s.hots[0].next===state.clock+1000));
});

test('invalid or unfinished sources cannot partially modify a source or admit the wrong party',async()=>{
  const {sources}=await fixture();
  const cases=[
    (s:InstanceCheckpoint[])=>{s[1].state.wallAt++;},
    (s:InstanceCheckpoint[])=>{s[1].state.location='goldshire';},
    (s:InstanceCheckpoint[])=>{s[1].state.dungeonEntries=[1000,1000,1000,1000,1000];},
    (s:InstanceCheckpoint[])=>{s[1].state.dungeonSaves={deadmines:{}};},
    (s:InstanceCheckpoint[])=>{s[1].state.party[0].id=s[0].state.id;},
    (s:InstanceCheckpoint[])=>{s[1].inputSequence++;},
    (s:InstanceCheckpoint[])=>{s[1].state.activity={type:'travel'};},
    (s:InstanceCheckpoint[])=>{s[1].state.simulationEvents.queue.events[0].subjectId=999;},
  ];
  for(const mutate of cases){const input=structuredClone(sources);mutate(input);const before=structuredClone(input);assert.throws(()=>composeDungeonCheckpoint(input,options(input)));assert.deepEqual(input,before);}
  assert.deepEqual(composeDungeonCheckpoint([...sources].reverse(),options(sources)),composeDungeonCheckpoint(sources,options(sources)));
});
