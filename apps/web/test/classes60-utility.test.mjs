import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../../../packages/game-domain/src/rules/engine.js';
import {stats,addItem,spellInfo,newCharacter} from '../../../packages/game-domain/src/rules/character.js';
import {spells,talents,items} from '../../../packages/game-domain/src/rules/catalog.js';
import {travelRoute} from '../../../packages/game-domain/src/rules/mounts.js';
const game=(classId,raceId)=>{const s=createGame('职业满级',615,0,{classId,raceId});s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.money=10000000;return s;};
test('class mounts use learned spells and accelerate travel without purchased horse riding',()=>{
 for(const [cls,race,id]of [[2,1,13819],[2,1,23214],[9,2,5784],[9,2,23161]]){let s=game(cls,race);s.learned.push(id);const normal=travelRoute(s,'goldshire').duration;s=act(s,{type:'cast',id},0);assert.equal(s.activity.type,'mount');s=advance(s,s.activity.endsAt).state;assert.equal(s.mounted,id);assert.ok(travelRoute(s,'goldshire').duration<normal);assert.equal(s.riding.horse,undefined);assert.ok(view(s).mounts.collection.find(m=>m.id===id).owned);}
});
test('healthstones consume source item, heal and enforce category cooldown across ranks',()=>{
 let s=game(9,1);addItem(s,9421);addItem(s,5512);s.hp=1;s=act(s,{type:'useItem',uid:s.bag.find(i=>i.id===9421).uid},0);assert.equal(s.hp,1201);assert.equal(s.bag.some(i=>i.id===9421),false);assert.throws(()=>act(s,{type:'useItem',uid:s.bag.find(i=>i.id===5512).uid},0),/冷却/);
});
test('soulstone survives serialization and revives with source rank health and mana',()=>{
 let s=game(9,1);addItem(s,16896);s=act(s,{type:'useItem',uid:s.bag.find(i=>i.id===16896).uid},0);s.hp=0;s.mana=0;s.activity={type:'dead'};s=act(JSON.parse(JSON.stringify(s)),{type:'soulstoneRevive'},0);assert.equal(s.hp,Math.min(stats(s).maxHp,Math.abs(spells[20761].EffectBasePoints1+1)));assert.equal(s.mana,Math.min(stats(s).maxMana,spells[20761].EffectMiscValue1));assert.equal(s.soulstone,null);assert.equal(s.activity.type,'idle');assert.throws(()=>act(s,{type:'soulstoneRevive'},0),/尚未死亡/);
});
test('active Kings aura increases stats once and expires',()=>{
 let s=game(2,1);const base=stats(s);s.auras=[{spell:20217,effect:1,type:137,misc:-1,amount:10,until:10000}];assert.equal(stats(s).str,Math.floor(base.str*1.1));s.time=10000;assert.equal(stats(s).str,base.str);
});
test('Shaman learned Parry grants the baseline avoidance chance',()=>{
 const s=game(7,2);const talent=Object.values(talents).find(t=>t.name==='Two-Handed Axes and Maces');assert.ok(talent);s.learned.push(18848);assert.ok(stats(s).parry>=.05);
});

test('summoning ritual requires two assistants and moves only a living distant party target',()=>{
 let s=game(9,1);s.learned.push(698);addItem(s,6265);s.party=['first','second','target'].map((id,n)=>({...newCharacter(id,5,60,1),id,hp:100,mana:100,position:n===2?60:0,positionY:0}));
 assert.throws(()=>act({...s,party:s.party.slice(1)},{type:'cast',id:698,target:'target'},0),/两名/);
 s=act(s,{type:'cast',id:698,target:'target'},0);assert.equal(s.party[2].position,60);s=advance(s,s.activity.endsAt).state;assert.equal(s.party[2].position,0);assert.equal(s.party[2].location,s.location);assert.equal(s.bag.some(i=>i.id===6265),false);
});
test('public hunter taming retains real beast identity through dismissal and recall',()=>{
 let s=game(3,2);s.location='northshire';s.learned.push(1515,883,2641);s.rules=[];s=act(s,{type:'cast',id:1515,target:'npc:299'},0);assert.ok(s.cast?.channel);s=advance(s,25000).state;assert.equal(s.hunterPet?.entry,299);assert.equal(s.pet?.entry,299);s.activity={type:'idle'};s.combat=null;s=act(s,{type:'cast',id:2641},s.wallAt);s=advance(s,s.wallAt+6000).state;assert.equal(s.pet,null);s=advance(s,s.wallAt+2000).state;s=act(s,{type:'cast',id:883},s.wallAt);s=advance(s,s.wallAt+5000).state;assert.equal(s.pet.entry,299);
});
test('new mage characters begin with source starting proficiencies and retain them on sync',()=>{
 const s=createGame('新法师',283,0,{classId:8,raceId:1});const restored=advance(s,0).state;
 assert.ok(s.learned.includes(227));assert.ok(!s.learned.includes(197));
 assert.deepEqual(restored.learned,s.learned);assert.deepEqual(restored.equipment,s.equipment);
});

test('public taming rejects busy and global-cooldown states before starting an encounter',()=>{
 const s=game(3,2);s.location='northshire';s.learned.push(1515);s.activity={type:'travel',endsAt:50000};
 assert.throws(()=>act(s,{type:'cast',id:1515,target:'npc:299'},0),/当前活动/);
 s.activity={type:'idle'};s.globalCooldowns={133:1500};
 assert.throws(()=>act(s,{type:'cast',id:1515,target:'npc:299'},0),/冷却/);
 assert.equal(s.combat,null);
});
