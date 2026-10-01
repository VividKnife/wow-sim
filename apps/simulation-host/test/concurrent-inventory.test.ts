import test from 'node:test';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import assert from 'node:assert/strict';
import {createGame,stats,view} from '../../../packages/game-domain/src/rules/engine.js';
import {makeItem} from '../../../packages/game-domain/src/rules/character.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {ResidentInstance} from '../src/instance.ts';

function fixture(){
 const s:Rules=createGame('Alice',22,0,{characterId:'alice'}),b:Rules=createGame('Bob',23,0,{characterId:'bob'});
 for(const c of [s,b]){c.level=24;c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;}
 s.party=[b];s.sharedParty={leaderId:s.id,participantIds:[s.id,b.id]};
 b.bag=[makeItem(s,2589,2),makeItem(s,117,2),makeItem(s,2589,3),makeItem(s,2570)];
 let seq=0;
 return {s,b,run:()=>new ResidentInstance({instanceId:'inventory',ownerEpoch:1,state:s,controllers:[s,b].map(c=>({actorId:c.id,accountId:c.id,generation:1,canPause:false}))}),command:(action:any)=>({instanceId:'inventory',actorId:'bob',controllerGeneration:1,clientSequence:++seq,requestId:'item-'+seq,command:{kind:'action' as const,action}})};
}

test('a nonleader organizes and protects their bag during combat without altering battle or another humans assets',()=>{
 const {s,b,run,command}=fixture();startCombat(s,[299]);const runtime=run(),before=runtime.checkpoint().state;
 assert.equal(runtime.input('bob',command({type:'sortBag'})).status,'applied');
 const sorted=runtime.checkpoint().state;
 assert.equal(sorted.party[0].bag.filter((i:any)=>i.id===2589).length,1);
 assert.equal(sorted.party[0].bag.find((i:any)=>i.id===2589).count,5);
 assert.deepEqual(sorted.combat,before.combat);assert.deepEqual(sorted.activity,before.activity);assert.deepEqual(sorted.bag,before.bag);
 const uid=sorted.party[0].bag.find((i:any)=>i.id===117).uid;
 assert.equal(runtime.input('bob',command({type:'lockItem',uid})).status,'applied');
 assert.equal(runtime.input('bob',command({type:'discardItem',uid})).status,'rejected');
 assert.equal(runtime.input('bob',command({type:'lockItem',uid:s.bag[0].uid})).status,'rejected');
 assert.equal(runtime.input('bob',command({type:'lockItem',uid})).status,'applied');
 const discard=command({type:'discardItem',uid});assert.equal(runtime.input('bob',discard).status,'applied');
 const saved=runtime.checkpoint(),restored=ResidentInstance.restore(saved,2);
 assert.equal(restored.input('bob',discard).status,'applied');assert.deepEqual(restored.checkpoint().state,saved.state);
 assert.deepEqual(saved.state.combat,before.combat);
});

test('out-of-combat automatic recovery permits personal gear and talent changes without cancelling the route',()=>{
 const {s,b,run,command}=fixture();s.activity={type:'goldRecovery',endsAt:5000};
 s.goldRaid={active:true,autoAdvance:true};
 const talent=view(b).talents.find((t:any)=>t.canLearn);assert.ok(talent);
 const runtime=run(),before=runtime.checkpoint().state;
 const item=b.bag.find((i:any)=>i.id===2570);
 assert.equal(runtime.input('bob',command({type:'equip',uid:item.uid})).status,'applied');
 assert.equal(runtime.input('bob',command({type:'talent',id:talent.id})).status,'applied');
 const after=runtime.checkpoint().state;
 assert.ok(Object.values(after.party[0].equipment).some((i:any)=>i.uid===item.uid));
 assert.equal(after.party[0].talents[talent.id],1);assert.deepEqual(after.equipment,before.equipment);assert.deepEqual(after.talents,before.talents);
 assert.deepEqual(after.activity,before.activity);assert.equal(after.goldRaid.autoAdvance,true);
 assert.equal(runtime.input('bob',command({type:'talent',id:talent.id,target:'alice'})).status,'rejected');
});

test('active combat and personal casts still reject build changes, but not bag organization',()=>{
 const {s,b,run,command}=fixture(),talent=view(b).talents.find((t:any)=>t.canLearn);
 startCombat(s,[299]);const runtime=run();
 assert.equal(runtime.input('bob',command({type:'talent',id:talent.id})).status,'rejected');
 assert.equal(runtime.input('bob',command({type:'equip',uid:b.bag.at(-1).uid})).status,'rejected');
 s.combat=null;s.activity={type:'resurrect',caster:'bob'};b.cast={spell:2006,until:10000};const casting=run();
 assert.equal(casting.input('bob',command({type:'talent',id:talent.id})).status,'rejected');
 assert.equal(casting.input('bob',command({type:'sortBag'})).status,'applied');
});


test('automatic travel and dungeon advancement are not blanket personal build locks',()=>{
 for(const type of ['travel','dungeonTravel','goldTravel','hunt']){
  const {s,b,run,command}=fixture();s.activity={type,endsAt:5000};
  const talent=view(b).talents.find((t:any)=>t.canLearn),runtime=run();
  assert.equal(runtime.input('bob',command({type:'equip',uid:b.bag.at(-1).uid})).status,'applied',type);
  assert.equal(runtime.input('bob',command({type:'talent',id:talent.id})).status,'applied',type);
  assert.deepEqual(runtime.checkpoint().state.activity,s.activity);
  const response=runtime.presentation('bob','bob');
  assert.equal((response.snapshot!.view as any).buildChangeBlockedReason,'');
 }
});
