import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../lib/game/engine.js';
import {newCharacter,stats} from '../lib/game/character.js';
import {talents,items,creatures} from '../lib/game/catalog.js';
import {classUtilityUse,beginClassUtility} from '../lib/game/class-utility.js';
import {classItemUse,useClassItem} from '../lib/game/class-items.js';
import {buyMount} from '../lib/game/mounts.js';
import {observationUse,executeObservation} from '../lib/game/class-observation.js';
import {spells} from '../lib/game/catalog.js';
const make=(classId,raceId=1)=>{const s=createGame('review',91,0,{classId,raceId});s.level=60;s.money=1e8;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;return s;};
test('talent reset removes Moonkin form, its armor and its granted spell',()=>{
 let s=make(11,4);const t=Object.values(talents).find(t=>t.classId===11&&t.name==='Moonkin Form');s.talents[t.id]=1;s.learned.push(t.ranks[0]);s.form='moonkin';const armor=stats(s).armor;
 s=act(s,{type:'resetTalents'},0);assert.ok(!s.form);assert.ok(!s.learned.includes(t.ranks[0]));assert.ok(stats(s).armor<armor);
});
test('talent reset returns now-ineligible two-handed shaman weapon without duplication',()=>{
 let s=make(7,2);const t=Object.values(talents).find(t=>t.classId===7&&t.name==='Two-Handed Axes and Maces');s.talents[t.id]=1;s.learned.push(t.ranks[0],16269);
 const w=Object.values(items).find(i=>i.class===2&&i.subclass===1&&i.InventoryType===17&&i.RequiredLevel<=60);s.equipment[16]={id:w.entry,uid:'twohand',count:1,durability:w.MaxDurability};
 s=act(s,{type:'resetTalents'},0);assert.ok(!s.equipment[16]);assert.ok(!s.learned.includes(16269));assert.equal([...s.bag,...s.pending].filter(i=>i.uid==='twohand').length,1);
});
test('a banked unique Healthstone prevents another creation before consuming resources',()=>{
 const s=make(9);s.learned.push(6201);s.bank=[{id:5512,uid:'stored',count:1}];s.bag=[{id:6265,uid:'shard',count:1}];const before=JSON.stringify(s);
 assert.equal(classUtilityUse(s,6201).canUse,false);assert.throws(()=>beginClassUtility(s,6201),/唯一/);assert.equal(JSON.stringify(s),before);
});
test('Arcane Intellect and Innervate apply to the selected ally only',()=>{
 for(const [cid,race,id,key]of [[8,1,1459,'buffs'],[11,4,29166,'innervateUntil']]){
  let s=make(cid,race);const a=newCharacter('ally',5,60,1);a.id='ally';a.hp=100;a.mana=0;s.party=[a];s.learned.push(id);s=act(s,{type:'cast',id,target:'ally'},0);
  if(key==='buffs'){assert.ok(s.party[0].buffs.int);assert.ok(!s.buffs.int);}else{assert.ok(s.party[0][key]>0);assert.ok(!s[key]);}
 }
});
test('foreign poison and locked weapons cannot be modified or consume an item',()=>{
 const s=make(4),i={id:6947,uid:'poison',count:1,ownerId:'other'};s.bag=[i];assert.equal(classItemUse(s,i).canUse,false);assert.throws(()=>useClassItem(s,i),/其他/);assert.equal(i.count,1);
 delete i.ownerId;s.equipment[16].locked=true;assert.equal(classItemUse(s,i).canUse,false);assert.throws(()=>useClassItem(s,i),/锁定/);assert.equal(i.count,1);assert.ok(!s.weaponEnchant);
});
test('a class mount spell cannot be bought as an ordinary horse',()=>{
 const s=make(8);s.riding={horse:true};s.location='logging';const money=s.money;assert.throws(()=>buyMount(s,13819));assert.equal(s.money,money);assert.ok(!s.mounts.includes(13819));
});
test('aquatic form, Prowl and Slice and Dice reject absent prerequisites',()=>{
 for(const [cid,race,id]of [[11,4,1066],[11,4,5215],[4,1,5171]]){const s=make(cid,race);s.learned.push(id);assert.equal(classUtilityUse(s,id).canUse,false);const mana=s.mana;assert.throws(()=>beginClassUtility(s,id));assert.equal(s.mana,mana);}
});
test('protected lockboxes and insufficient lock skill cannot be opened',()=>{
 const s=make(4),item=Object.values(items).find(i=>i.entry===4636);assert.ok(item);s.bag=[{id:item.entry,uid:'box',count:1,locked:true}];s.lockpicking=300;
 assert.equal(observationUse(s,spells[1804],'box').canUse,false);assert.throws(()=>executeObservation(s,spells[1804],'box'));assert.equal(s.bag[0].count,1);
 s.bag[0].locked=false;s.lockpicking=1;assert.equal(observationUse(s,spells[1804],'box').canUse,false);
});

test('Pick Pocket rejects corpses and awards loot at most once per living enemy',()=>{
 const s=make(4),raw=Object.values(creatures).find(c=>c.CreatureType===7&&c.PickpocketLootId),target={id:'victim',entry:raw.Entry,hp:0,level:5,position:0,positionY:0};s.stealthed=true;s.position=0;s.positionY=0;s.combat={enemies:[target]};
 assert.equal(observationUse(s,spells[921],target.id).canUse,false);assert.throws(()=>executeObservation(s,spells[921],target.id));
 target.hp=100;assert.equal(observationUse(s,spells[921],target.id).canUse,true);executeObservation(s,spells[921],target.id);assert.equal(target.picked,true);const bag=JSON.stringify(s.bag),money=s.money;
 assert.throws(()=>executeObservation(s,spells[921],target.id));assert.equal(s.money,money);assert.equal(JSON.stringify(s.bag),bag);
});

test('ritual completion revalidates living helpers and preserves reagent after failed assistance',()=>{
 let s=make(9);s.learned.push(698);s.bag=[{id:6265,uid:'shard',count:1}];s.party=['helper1','helper2','remote'].map((id,n)=>({...newCharacter(id,5,60,1),id,hp:100,position:n===2?60:0,positionY:0}));
 s=act(s,{type:'cast',id:698,target:'remote'},0);assert.equal(s.bag[0].count,1);s.party[0].hp=0;s=advance(s,s.activity.endsAt).state;
 assert.equal(s.party[2].position,60);assert.equal(s.bag.find(i=>i.id===6265).count,1);assert.equal(s.activity.type,'idle');
});
