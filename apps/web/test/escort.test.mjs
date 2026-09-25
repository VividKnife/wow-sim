import {recruitForTest} from './support/party-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {stats,killXp} from '../../../packages/game-domain/src/rules/character.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {creatureVisual} from '../lib/creature-visuals.js';

function ready(){let s=createGame('护送测试',283,0);s.level=20;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.location='sentinel';s.quests[155]={kills:{},event:false,acceptedAt:0,expiresAt:0};for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},0);return s;}

test('escort requires the active quest at Sentinel Hill and cannot be replaced by ordinary travel',()=>{
 let s=ready();s.location='moonbrook';assert.throws(()=>act(s,{type:'escortStart'},0));s.location='sentinel';
 s=act(s,{type:'escortStart'},0);assert.equal(s.escort.npc.hp,329);assert.equal(s.escort.npc.level,15);assert.ok(creatureVisual(s.escort.npc).model?.src);
 assert.throws(()=>act(s,{type:'travel',to:'moonbrook'},0),/护送/);assert.equal(s.quests[155].event,false);
});

test('escort follows all waypoints, fights with a protectable NPC, and only then grants event credit',()=>{
 let s=act(ready(),{type:'escortStart'},0),fights=0;
 for(let i=0;s.escort&&i<2000;i++){
  if(s.combat){fights++;assert.ok(s.combat.participantIds.includes('escort-467'));for(const e of s.combat.enemies)e.hp=0;}
  s=advance(s,s.wallAt+1000).state;
 }
 assert.ok(fights>0);assert.equal(s.escort,undefined);assert.equal(s.location,'moonbrook');assert.equal(s.quests[155].event,true);assert.equal(s.completed[155],undefined);
 assert.equal(s.escortLast.outcome,'arrived');
});

test('NPC death fails escort without granting credit and permits a fresh attempt from Sentinel Hill',()=>{
 let s=act(ready(),{type:'escortStart'},0);s.escort.npc.hp=0;
 s=advance(s,100).state;assert.equal(s.escort,undefined);assert.equal(s.quests[155].event,false);assert.equal(s.escortLast.outcome,'failed');
 s.location='sentinel';s=act(s,{type:'escortStart'},s.wallAt);assert.equal(s.escort.npc.hp,329);
});

test('cancelled escort cannot later award completion and split advances preserve movement',()=>{
 const s=act(ready(),{type:'escortStart'},0),whole=advance(s,1000).state;
 let split=s;for(let i=100;i<=1000;i+=100)split=advance(split,i).state;assert.deepEqual(split,whole);
 let stopped=act(whole,{type:'escortCancel'},whole.wallAt);stopped=advance(stopped,stopped.wallAt+300000).state;
 assert.equal(stopped.quests[155].event,false);assert.equal(stopped.escort,undefined);
});

test('priest heals an injured escort during real combat and the escort deals melee damage',()=>{
 let s=act(ready(),{type:'escortStart'},0);
 s.activity={type:'idle'};startCombat(s,[589]);s.escort.npc.hp=80;
 // Keep the encounter alive long enough to observe escort movement and its swing, independent of recruited gear.
 for(const enemy of s.combat.enemies)enemy.hp=enemy.maxHp=3000;
 let healed=false,attacked=false;
 for(let i=0;s.combat&&i<300;i++){
  s=advance(s,s.wallAt+100).state;
  healed||=s.logs.some(l=>l.kind==='heal'&&l.targetId==='escort-467'&&l.amount>0);
  attacked||=s.logs.some(l=>l.kind==='damage'&&l.actorId==='escort-467'&&l.amount>0);
 }
 assert.equal(healed,true);assert.equal(attacked,true);
});

test('escort death or cancellation during combat retains the actor until combat ends without awarding credit',()=>{
 for(const cause of ['death','cancel']){
  let s=act(ready(),{type:'escortStart'},0);s.activity={type:'idle'};startCombat(s,[589]);
  if(cause==='death')s.escort.npc.hp=0;else s=act(s,{type:'escortCancel'},s.wallAt);
  s=advance(s,s.wallAt+100).state;assert.ok(s.combat);assert.ok(s.escort);assert.equal(s.quests[155].event,false);
  for(const e of s.combat.enemies)e.hp=0;s=advance(s,s.wallAt+100).state;
  assert.equal(s.escort,undefined);assert.equal(s.escortLast.outcome,'failed');assert.equal(s.quests[155].event,false);
  assert.ok(s.lastCombat.actorsSnapshot.some(c=>c.id==='escort-467'&&c.escortNpc));
  assert.ok(creatureVisual(s.lastCombat.actorsSnapshot.find(c=>c.id==='escort-467')).model?.src);
 }
});

test('escort does not take a share of party experience or receive player levels',()=>{
 let s=ready();s.level=18;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 s=act(s,{type:'escortStart'},0);s.activity={type:'idle'};startCombat(s,[589]);
 const foe=s.combat.enemies[0],before=s.xp,total=[s,...s.party].reduce((sum,c)=>sum+c.level,0);
 const expected=Math.floor(killXp(s.level,foe.level,!!foe.rank)*1.4*s.level/total);
 foe.hp=0;s=advance(s,s.wallAt+100).state;
 assert.equal(s.xp-before,expected);assert.equal(s.escort.npc.level,15);assert.equal(s.escort.npc.xp,undefined);
});
