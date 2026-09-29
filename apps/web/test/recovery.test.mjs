import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {addItem,newCharacter} from '../../../packages/game-domain/src/rules/character.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {finishCombat} from '../../../packages/game-domain/src/rules/combat-metrics.js';
import {healthRegen,startRecovery} from '../../../packages/game-domain/src/rules/recovery.js';

for(const disabled of [false,true])test(`hunting waits for natural recovery and continues without supplies (disabled=${disabled})`,()=>{
 let s=createGame('自然恢复',42,0);s.hp=1;s.mana=0;s.lastManaUse=0;
 if(disabled){s.settings.autoFood=false;s.settings.autoWater=false;}else s.bag=[];
 s=act(s,{type:'hunt',id:299},0);
 const waiting=advance(s,2000).state;
 assert.equal(waiting.activity.type,'hunt');assert.equal(waiting.combat,null);
 assert.ok(waiting.hp>1);assert.equal(waiting.mana,0);
 const recovered=advance(waiting,6000).state;assert.ok(recovered.mana>0);
 let resumed=recovered;for(let t=6100;t<=120000&&!resumed.combat;t+=100)resumed=advance(resumed,t).state;
 assert.ok(resumed.combat,'automatically pulls once health and mana recover');
 assert.equal(resumed.totals.food,0);assert.equal(resumed.totals.water,0);
});

test('hunting continues after looting a kill without food or water',()=>{
 let s=createGame('连续狩猎',42,0);s.bag=[];
 s=act(s,{type:'hunt',id:299},0);
 for(let t=100;t<=180000&&s.totals.kills<2;t+=100){s=advance(s,t).state;if(!s.combat&&s.pending.length)s=act(s,{type:'loot'},s.wallAt);}
 assert.ok(s.totals.kills>=2);assert.equal(s.totals.food,0);assert.equal(s.totals.water,0);
});

for(const id of [117,159])test(`available supply ${id} is used even when the other resource has no supply`,()=>{
 const s=createGame('部分补给',42,0);s.hp=1;s.mana=0;s.bag=[];addItem(s,id);
 s.activity={type:'hunt',target:299};assert.equal(startRecovery(s),true);
 assert.equal(s.activity.type,'hunt');assert.ok(s.rest);
 assert.equal(s.totals.food,id===117?1:0);assert.equal(s.totals.water,id===159?1:0);
});

test('spring water uses its 18-second duration and MP5 during the five-second rule',()=>{
 let s=createGame('饮水',42,0);s.mana=0;s.lastManaUse=0;s=act(s,{type:'rest'},0);
 assert.equal(s.rest.waterUntil,18000);assert.equal(advance(s,2000).state.mana,16);
 const after=advance(s,18000).state;assert.equal(after.rest,null);
});
test('different food and drink durations expire independently; recovery is chunk invariant',()=>{
 let s=createGame('恢复',42,0);s.level=20;s.hp=1;s.mana=0;s.bag=[];addItem(s,117);addItem(s,2288);s=act(s,{type:'rest'},0);
 assert.equal(s.rest.foodUntil,18000);assert.equal(s.rest.waterUntil,21000);
 const at18=advance(s,18000).state;assert.ok(at18.rest);assert.equal(at18.rest.until,21000);
 const whole=advance(s,21000).state;let chunk=s;for(let t=700;t<=21000;t+=700)chunk=advance(chunk,t).state;
 assert.deepEqual(chunk,whole);assert.equal(whole.rest,null);assert.ok(whole.mana<stats(s).maxMana);
});
test('food heals on its aura timer, not on every global regeneration tick',()=>{
 let s=createGame('进食',42,0);s.level=20;s.hp=1;s.mana=stats(s).maxMana;s=act(s,{type:'rest'},0);
 let noFood=structuredClone(s);noFood.rest.food=0; // Still sitting; isolate the food aura from natural regeneration.
 assert.equal(advance(s,2000).state.hp,advance(noFood,2000).state.hp);
 assert.equal(advance(s,5000).state.hp-advance(noFood,5000).state.hp,17);
});

test('each class uses its pinned spirit health formula and sitting multiplier',()=>{
 // Golden level-18 human, no equipment: base stats include the +5% Human Spirit racial.
 for(const [classId,spirit,standing,sitting] of [[1,27,22,34],[4,28,21,31],[5,49,17,26],[8,47,12,18]]){
  const c=newCharacter('精神恢复',classId,18);assert.equal(stats(c).spi,spirit);
  assert.equal(healthRegen(c),standing);assert.equal(healthRegen(c,true),sitting);
 }
});

function undeadRecovery(){
 const s=createGame('食尸恢复',42,0,{raceId:5,classId:8});s.hp=1;s.mana=0;s.position=0;s.positionY=0;
 s.recentCorpses=[{hp:0,creatureType:7,position:3,positionY:0,location:s.location,dungeonRun:null,until:120000}];
 return s;
}
test('automatic recovery prioritizes Cannibalize, commits cooldown and waits for its channel',()=>{
 const s=undeadRecovery(),food=s.totals.food;assert.equal(startRecovery(s),true);
 assert.ok(s.cannibalize);assert.equal(s.rest,undefined);assert.equal(s.totals.food,food);assert.equal(s.totals.water,0);
 assert.equal(s.cooldowns[20577],120000);
 const before=s.hp,after=advance(s,2000).state;assert.ok(after.hp>=before+Math.round(stats(s).maxHp*.07));
 assert.equal(startRecovery(after),true);assert.equal(after.totals.food,food);
 const finished=advance(after,10000).state;assert.equal(finished.cannibalize,null);
 startRecovery(finished);assert.ok(finished.rest,'remaining resources use ordinary supplies during cooldown');
});
for(const reason of ['beast','far','expired','elsewhere','disabled','cooldown','other race'])test(`automatic Cannibalize rejects ${reason} and falls back to normal recovery`,()=>{
 const s=undeadRecovery(),corpse=s.recentCorpses[0];
 if(reason==='beast')corpse.creatureType=1;if(reason==='far')corpse.position=6;
 if(reason==='expired')corpse.until=0;if(reason==='elsewhere')corpse.location='elsewhere';
 if(reason==='disabled')s.settings.autoFood=false;if(reason==='cooldown')s.cooldowns[20577]=120000;if(reason==='other race')s.raceId=1;
 assert.equal(startRecovery(s),true);assert.ok(!s.cannibalize);assert.ok(s.rest);
});
test('movement interrupts automatic Cannibalize before the next healing tick',()=>{
 const s=undeadRecovery();startRecovery(s);s.position=1;
 const after=advance(s,100).state;assert.equal(after.cannibalize,null);assert.equal(after.hp,1);
});

test('a completed encounter supplies nearby corpses for automatic recovery',()=>{
 const s=undeadRecovery();delete s.recentCorpses;startCombat(s,[299]);
 const enemy=s.combat.enemies[0];enemy.hp=0;enemy.creatureType=6;enemy.position=s.position;enemy.positionY=s.positionY;
 finishCombat(s);assert.equal(s.combat,null);assert.equal(s.recentCorpses.length,1);
 assert.equal(startRecovery(s),true);assert.ok(s.cannibalize);
});
