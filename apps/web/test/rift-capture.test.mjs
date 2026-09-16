import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,questProgress} from '../lib/game/engine.js';
import {countItem} from '../lib/game/character.js';
import {abilities,monsterIdsAt} from '../lib/game/catalog.js';
function finish(s){return advance(s,s.wallAt+s.activity.endsAt-s.clock).state;}
function command(s,action){return act(s,action,s.wallAt);}
function prepared(){let s=createGame('封印学徒',8,0);s.level=20;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.learned=[...new Set(abilities.filter(a=>a.requiredLevel<=20).map(a=>a.spellId))];s.location='magetower';s=command(s,{type:'accept',id:1920});for(const id of [105174,105175])s=finish(command(s,{type:'gather',id}));s=finish(command(s,{type:'travel',to:'bluerecluse'}));return s;}
function manifest(s){s=finish(command(s,{type:'useQuestItem',id:7308}));for(let n=0;n<1000&&s.combat?.enemies[0].capturePhase!=='weakened'&&s.hp>0;n++)s=advance(s,s.wallAt+100).state;assert.ok(s.hp>0,'prepared mage must survive the encounter');assert.equal(s.combat?.enemies[0].capturePhase,'weakened');return s;}
test('rift spawns require the quest tools and survive lethal damage for capture, without kill rewards',()=>{
 let s=prepared();assert.ok(!monsterIdsAt('bluerecluse').includes(6492));assert.throws(()=>command(s,{type:'useQuestItem',id:7247}),/裂隙/);
 s=manifest(s);assert.ok(s.combat.enemies[0].hp>0);assert.equal(s.totals.kills,0);assert.equal(countItem(s,7292),0);
 s=finish(command(s,{type:'useQuestItem',id:7247}));assert.equal(s.bag.find(i=>i.id===7247).charges,9);assert.equal(countItem(s,7292),0);
 s=advance(s,s.wallAt+2500).state;assert.equal(s.combat,null);s=finish(command(s,{type:'gather',id:103574}));assert.equal(countItem(s,7292),1);assert.equal(s.totals.kills,0);
 assert.throws(()=>command(s,{type:'gather',id:103574}));assert.equal(questProgress(s,1920).complete,false);
});
test('an uncaptured weakened spawn disappears without quest credit or kill loot',()=>{
 let s=manifest(prepared());const xp=s.xp;s=advance(s,s.wallAt+30000).state;assert.equal(s.combat,null);assert.equal(s.xp,xp);assert.equal(s.totals.kills,0);assert.equal(countItem(s,7292),0);assert.throws(()=>command(s,{type:'useQuestItem',id:7247}));
});
test('capture expiry is identical across reconnect-sized time steps and rejects late captures',()=>{
 const initial=manifest(prepared()),end=initial.wallAt+30000;let chunks=structuredClone(initial);
 while(chunks.wallAt<end)chunks=advance(chunks,Math.min(end,chunks.wallAt+173)).state;
 assert.deepEqual(chunks,advance(initial,end).state);
 const before=advance(initial,initial.wallAt+initial.combat.enemies[0].captureUntil-initial.clock-1).state;
 const cast=command(before,{type:'useQuestItem',id:7247}),after=finish(cast);
 assert.equal(after.combat,null);assert.equal(after.questObjects?.length||0,0);assert.equal(after.bag.find(i=>i.id===7247).charges??10,10);
});
test('three real captures and pickups satisfy the original tool and coffer requirements',()=>{
 let s=prepared();s=finish(command(s,{type:'conjure',water:true}));s=advance(s,s.wallAt+60000).state;s=finish(command(s,{type:'conjure',water:false}));s=advance(s,s.wallAt+60000).state;
 for(let n=0;n<3;n++){
  s=manifest(s);s=finish(command(s,{type:'useQuestItem',id:7247}));s=advance(s,s.wallAt+2500).state;s=finish(command(s,{type:'gather',id:103574}));
  if(n<2){s=command(s,{type:'rest'});s=advance(s,s.wallAt+60000).state;}
 }
 assert.equal(countItem(s,7292),3);assert.equal(s.bag.find(i=>i.id===7247).charges,7);assert.equal(questProgress(s,1920).complete,true);
 s=finish(command(s,{type:'travel',to:'magetower'}));s=command(s,{type:'turnin',id:1920});
 for(const id of [7292,7247,7308])assert.equal(countItem(s,id),0);assert.equal(s.completed[1920],1);assert.equal(s.totals.kills,0);
 s=command(s,{type:'accept',id:1921});assert.ok(s.quests[1921]);
});
