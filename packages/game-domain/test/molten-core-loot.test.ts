import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import source from '../../game-data/data/molten-core-loot.json' with {type:'json'};
import {items,itemSets,icon} from '../src/rules/catalog.js';
import {makeItem,canEquip} from '../src/rules/character.js';
import {itemDetails} from '../src/rules/item-details.js';
import {rollClassicLoot,rollRaidLoot,raidLoot,canReceiveRaidLoot} from '../src/rules/raid-rewards.js';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {advance} from '../src/rules/engine.js';
import {enterGoldRaid,goldRaidAction,goldAuctionStep} from '../src/rules/gold-raid.js';

test('MC sources contain original tier slots, chest quests and legendary components, never crafted legendaries',()=>{
 assert.ok(raidLoot.lucifron.includes(16800));assert.ok(!raidLoot.magmadar.includes(16800));
 assert.ok(raidLoot.magmadar.includes(16796));assert.ok(raidLoot.garr.includes(16795));assert.ok(raidLoot.golemagg.includes(16798));
 assert.ok(raidLoot.majordomo.includes(18646)&&raidLoot.majordomo.includes(18703));
 assert.deepEqual(source.bossSources.majordomo,{table:'gameobject_loot_template',entry:16719});
 assert.ok(raidLoot.garr.includes(18564)&&!raidLoot.garr.includes(18563));
 assert.ok(raidLoot['baron-geddon'].includes(18563));
 assert.ok(raidLoot.ragnaros.includes(17204)&&raidLoot.ragnaros.includes(16915));
 for(const ids of Object.values(raidLoot))assert.ok(ids.every(id=>items[id]&&id<990000&&![17182,19019].includes(id)));
 assert.equal(items[991005],undefined);assert.equal(items[992001],undefined);
 const trash=source.tables.reference_loot_template.filter(r=>r.entry===34012).map(r=>r.item);
 assert.ok(trash.includes(16802)&&trash.includes(16799));
});

test('original class masks, durability, binding, localized set pieces and bonuses are exposed',()=>{
 const boots=items[16800],details=itemDetails(16800),s=createMoltenCoreDemo().state;
 assert.equal(boots.AllowableClass,128);assert.equal(boots.armor,70);assert.equal(boots.ItemLevel,66);
 assert.ok(canEquip(s,boots));assert.ok(!canEquip({...s,classId:9},boots));
 assert.deepEqual(details.allowedClasses,['法师']);assert.equal(details.set.name,'奥术师');
 assert.equal(details.set.pieces.length,8);assert.deepEqual(details.set.bonuses.map((b:any)=>b.count),[3,5,8]);
 assert.match(details.effects.map((e:any)=>e.text).join(' '),/11/);
 assert.equal(makeItem(s,16800).bound,true);assert.equal(makeItem(s,16802).bound,false);
 assert.ok(canReceiveRaidLoot({...s,classId:3},items[18703]));assert.ok(!canReceiveRaidLoot(s,items[18703]));
 for(const set of Object.values(itemSets))for(const id of set.pieces)assert.ok(items[id]);
 for(const item of source.tables.item_template.filter((i:any)=>i.Quality>=4))assert.ok(existsSync(new URL('../../../apps/web/public'+icon('items',item.entry),import.meta.url)),String(item.entry));
});

test('reference groups are independent, select only the requested group and preserve multiplicity',()=>{
 const row=(item:number,chance:number,groupid=0,mincountOrRef=1,maxcount=1)=>({item,ChanceOrQuestChance:chance,groupid,mincountOrRef,maxcount});
 const refs={10:[row(100,0,1),row(101,0,2)],20:[row(200,0,1)]};
 assert.deepEqual(rollClassicLoot([row(10,100,1,-10,2),row(20,100,1,-20)],refs,()=>.5).map(r=>r.itemId),[100,100,200]);
 assert.deepEqual(rollClassicLoot([row(1,20,1),row(2,0,1)],{},()=>.5).map(r=>r.itemId),[2]);
 assert.deepEqual(rollClassicLoot([row(1,20,1)],{},()=>.5),[]);
 assert.equal(rollClassicLoot([row(1,100,0,2,6)],{},()=>.999)[0].count,6);
});

test('repeated real rolls retain boss counts, chest alternatives and low legendary chances',()=>{
 const s={rngState:12345,quests:{},completed:{}};let eyes=0,bindings=0,leaves=0;
 for(let n=0;n<1500;n++){
  const luci=rollRaidLoot(s,'lucifron');
  assert.equal(luci.filter((d:any)=>items[d.itemId].Quality===4&&items[d.itemId].InventoryType>0).length,2);
  assert.equal(luci.filter((d:any)=>d.itemId===16665).length,1);
  assert.ok(luci.every((d:any)=>!d.quest));
  const domo=rollRaidLoot(s,'majordomo');assert.equal(domo.length,3);
  assert.equal(domo.filter((d:any)=>[18646,18703].includes(d.itemId)).length,1);leaves+=domo.some((d:any)=>d.itemId===18703)?1:0;
  const rag=rollRaidLoot(s,'ragnaros');assert.equal(rag.filter((d:any)=>items[d.itemId].itemset>=210&&items[d.itemId].itemset<=218).length,2);
  eyes+=rag.some((d:any)=>d.itemId===17204)?1:0;
  bindings+=rollRaidLoot(s,'garr').some((d:any)=>d.itemId===18564)?1:0;
 }
 assert.ok(eyes>20&&eyes<80);assert.ok(bindings>25&&bindings<100);assert.ok(leaves>650&&leaves<850);
});

test('gold sends all actual drops to auction once without smart loot replacement',()=>{
 let s=createMoltenCoreDemo().state;s.party=[];enterGoldRaid(s);
 for(const type of ['goldPublish','goldRecommend','goldLaunch'])goldRaidAction(s,{type});
 s.goldRaid.clearedPacks=['mc-gate','mc-bridge','mc-imps','mc-hounds-1'];s.goldRaid.locationId='mc-hounds-1';
 goldRaidAction(s,{type:'goldStart',bossId:'lucifron'});s.combat.enemies.forEach((e:any)=>e.hp=0);
 s=advance(s,s.wallAt+100).state;
 const lots=[s.goldRaid.auction,...s.goldRaid.lots];
 assert.equal(lots.filter((i:any)=>items[i.itemId].Quality===4&&items[i.itemId].InventoryType).length,2);
 assert.ok(lots.some((i:any)=>i.itemId===16665));assert.equal(s.pending.length,0);
});

test('auction delivers material stacks to NPC storage and retains original BoE binding for players',()=>{
 const s=createMoltenCoreDemo().state;s.party=s.party.slice(0,4);s.growthPolicy='player';enterGoldRaid(s);
 for(const type of ['goldPublish','goldRecommend','goldLaunch'])goldRaidAction(s,{type});
 const npc=s.party.find((c:any)=>c.goldNpc),before=structuredClone(npc.equipment);
 const lot=(itemId:number,count:number,leader:string)=>({id:'material-test',bossId:'garr',itemId,count,leader,price:100000,limits:{},bids:[],quiet:2,round:0,step:50000});
 s.goldRaid.auction=lot(17010,3,npc.id);goldAuctionStep(s);
 assert.deepEqual(npc.equipment,before);assert.equal(npc.raidCollection[0].id,17010);assert.equal(npc.raidCollection[0].count,3);
 s.goldRaid.auction=lot(16802,1,'player');goldAuctionStep(s);
 assert.equal(s.pending.at(-1).id,16802);assert.equal(s.pending.at(-1).bound,false);
});
