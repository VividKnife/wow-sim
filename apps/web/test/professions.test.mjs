import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view,stats} from '../lib/game/engine.js';
import {addItem,countItem} from '../lib/game/character.js';
import {startCombat,combatTick} from '../lib/game/combat.js';
import {items} from '../lib/game/catalog.js';
import {recipes,marketIds} from '../lib/game/profession-data.js';
const fresh=()=>{const s=createGame('工匠',71,0);s.money=100000;s.level=20;return s;};
const action=(s,a)=>act(s,a,s.wallAt);
const learn=(s,id)=>action(s,{type:'learnProfession',id});

test('new characters initialize professions and storage',()=>{
 const s=fresh();const v=view(s);assert.ok(v.professions.length>=12);assert.deepEqual(s.bank,[]);assert.deepEqual(s.professions,{});
});
test('learn professions and craft with atomic material purchase',()=>{
 let s=learn(fresh(),'alchemy');const quote=view(s).recipes.find(r=>r.id==='spell-2330');assert.ok(quote.missingCost>0);
 const before=s.money;s=action(s,{type:'craft',id:'spell-2330',count:2,buyMissing:true});assert.equal(countItem(s,118),2);assert.ok(s.money<before);assert.ok(s.professions.alchemy.skill>1);
 const poor={...s,money:0};const snapshot=JSON.stringify(poor);assert.throws(()=>action(poor,{type:'craft',id:'spell-2330',count:20,buyMissing:true}));assert.equal(JSON.stringify(poor),snapshot);
 for(const count of [0,-1,1.5,NaN,101])assert.throws(()=>action(s,{type:'craft',id:'spell-2330',count,buyMissing:true}));
});
test('bank transfers preserve instance identity, enchantments and locks',()=>{
 let s=fresh();s.location='stormwind';addItem(s,35);const item=s.bag.find(i=>i.id===35);item.enchant='health';item.locked=true;
 s=action(s,{type:'bankDeposit',uid:item.uid,count:1});assert.deepEqual(s.bank.find(i=>i.uid===item.uid),item);
 s=action(s,{type:'bankWithdraw',uid:item.uid,count:1});assert.deepEqual(s.bag.find(i=>i.uid===item.uid),item);assert.equal(s.bank.length,0);
 s.location='northwood';assert.throws(()=>action(s,{type:'bankDeposit',uid:item.uid,count:1}),/银行/);
});
test('auction purchases and NPC settlements are priced and credited once',()=>{
 let s=fresh();const row=view(s).market.find(r=>r.id===2447);assert.ok(row.buy>row.sell);
 s=action(s,{type:'auctionBuy',id:2447,count:3});const item=s.bag.find(i=>i.id===2447),before=s.money;
 s=action(s,{type:'auctionSell',uid:item.uid});assert.equal(countItem(s,2447),0);assert.equal(s.money,before);assert.equal(s.auctions.length,1);
 s=advance(s,30000).state;assert.equal(s.money,before+Math.floor(row.sell*3*.95));assert.equal(s.auctions.length,0);const paid=s.money;s=advance(s,60000).state;assert.equal(s.money,paid);
});
test('regional nodes deplete and respawn; gathering respects skills and location',()=>{
 let s=learn(fresh(),'herbalism');s.location='northwood';const resource=view(s).resources.find(r=>r.profession==='herbalism');assert.ok(resource);
 s=action(s,{type:'gatherResource',id:resource.id});s=advance(s,3000).state;assert.ok(countItem(s,resource.item)>0);assert.ok(view(s).resources.find(r=>r.id===resource.id).readyAt>s.clock);
 assert.throws(()=>action(s,{type:'gatherResource',id:resource.id}));s=advance(s,303000).state;assert.ok(view(s).resources.find(r=>r.id===resource.id).available);
 s.location='stormwind';assert.equal(view(s).resources.length,0);
});
test('skinning rewards killed beasts once, never humanoids',()=>{
 let s=learn(fresh(),'skinning');startCombat(s,[299]);s.combat.enemies[0].hp=0;combatTick(s);assert.ok(countItem(s,2318)>0);const skins=countItem(s,2318);if(s.combat)combatTick(s);assert.equal(countItem(s,2318),skins);
 startCombat(s,[6]);s.combat.enemies[0].hp=0;combatTick(s);assert.equal(countItem(s,2318),skins);
});
test('enchant scrolls affect equipped stats and replace rather than stack',()=>{
 let s=fresh();const scroll=view(s).market.find(r=>r.enchant==='7420');assert.ok(scroll);
 s=action(s,{type:'auctionBuy',id:scroll.id,count:2});const uid=s.equipment[5].uid,base=stats(s).maxHp;
 s=action(s,{type:'applyEnchant',id:scroll.id,uid});assert.equal(stats(s).maxHp,base+5);
 s=action(s,{type:'applyEnchant',id:scroll.id,uid});assert.equal(stats(s).maxHp,base+5);assert.equal(countItem(s,scroll.id),0);
});
test('one-click disenchant protects locked and equipped items',()=>{
 let s=learn(fresh(),'enchanting');addItem(s,5207);addItem(s,5207);const locked=s.bag.find(i=>i.id===5207);locked.locked=true;const equipped=JSON.stringify(s.equipment);
 s=action(s,{type:'disenchantAll'});assert.equal(countItem(s,5207),1);assert.ok(s.bag.some(i=>i.uid===locked.uid));assert.ok([10940,10938,10939,10978].some(id=>countItem(s,id)>0));assert.equal(JSON.stringify(s.equipment),equipped);
});
test('potion strategy consumes real inventory and obeys shared cooldown',()=>{
 let s=fresh();addItem(s,118,3);addItem(s,2455,3);
 s=action(s,{type:'strategy',rules:s.rules,potions:{enabled:true,health:50,mana:30,healthItem:118,manaItem:2455}});
 s.hp=10;s.mana=0;startCombat(s,[299]);combatTick(s);assert.equal(countItem(s,118),2);assert.equal(countItem(s,2455),3);assert.ok(s.hp>10);
 s.hp=10;combatTick(s);assert.equal(countItem(s,118),2);
 assert.throws(()=>action(s,{type:'strategy',rules:s.rules,potions:{enabled:true,health:101,mana:30,healthItem:118,manaItem:2455}}));
});
test('every profession recipe and market item is fully defined',()=>{
 for(const id of marketIds)assert.ok(items[id],`missing item ${id}`);
 for(const r of recipes){let s=learn(fresh(),r.profession);s.level=60;s.money=1000000000;s.professions[r.profession]={skill:300,cap:300,specialization:r.specialization};s=action(s,{type:'craft',id:r.id,count:1,buyMissing:true});assert.ok(countItem(s,r.item)>=r.output,r.id);}
});
test('organizing stacks preserves quantities, locks and enchantments',()=>{
 let s=fresh();addItem(s,2447,20);addItem(s,2447,10);s.bag.find(i=>i.id===2447).count=7;
 addItem(s,35);addItem(s,35);const robes=s.bag.filter(i=>i.id===35);robes[0].enchant='health';robes[1].locked=true;
 s=action(s,{type:'sortBag'});assert.equal(countItem(s,2447),17);assert.equal(s.bag.filter(i=>i.id===2447).length,1);assert.equal(s.bag.find(i=>i.uid===robes[0].uid).enchant,'health');assert.ok(s.bag.find(i=>i.uid===robes[1].uid).locked);
});
test('full bags reject purchases and crafting without spending or losing inputs',()=>{
 let s=learn(fresh(),'alchemy');while(s.bag.length<16)addItem(s,35);const before=JSON.stringify(s);
 assert.throws(()=>action(s,{type:'auctionBuy',id:2447,count:1}),/空间/);assert.equal(JSON.stringify(s),before);
 assert.throws(()=>action(s,{type:'craft',id:'spell-2330',count:1,buyMissing:true}),/空间/);assert.equal(JSON.stringify(s),before);
});
test('bank split, full withdrawal and bulk deposit are atomic',()=>{
 let s=fresh();s.location='stormwind';addItem(s,2447,12);const uid=s.bag.find(i=>i.id===2447).uid;
 s=action(s,{type:'bankDeposit',uid,count:5});assert.equal(countItem(s,2447),7);assert.equal(s.bank[0].count,5);assert.notEqual(s.bank[0].uid,uid);
 while(s.bag.length<16)addItem(s,35);s.bag.find(i=>i.id===2447).locked=true;const snapshot=JSON.stringify(s);assert.throws(()=>action(s,{type:'bankWithdraw',uid:s.bank[0].uid,count:5}),/空间/);assert.equal(JSON.stringify(s),snapshot);
});
test('cancelled auctions return exact items and never later pay out',()=>{
 let s=fresh();addItem(s,35);const i=s.bag.find(i=>i.id===35);i.enchant='mana';s=action(s,{type:'auctionSell',uid:i.uid});s=action(s,{type:'auctionCancel',id:i.uid});assert.deepEqual(s.bag.find(x=>x.uid===i.uid),i);const money=s.money;s=advance(s,60000).state;assert.equal(s.money,money);
});
test('auto gathering is equivalent when offline time is chunked',()=>{
 let s=learn(fresh(),'herbalism');s.location='northwood';s=action(s,{type:'gatherAll'});const one=advance(s,10000).state;let chunks=s;for(let t=1000;t<=10000;t+=1000)chunks=advance(chunks,t).state;assert.deepEqual(chunks,one);assert.equal(one.activity.type,'idle');assert.ok(countItem(one,2447)>0&&countItem(one,765)>0);
});
test('locked materials are not consumed or used to reduce the purchase quote',()=>{
 let s=learn(fresh(),'alchemy');addItem(s,2447,5);s.bag.find(i=>i.id===2447).locked=true;const q=view(s).recipes.find(r=>r.id==='spell-2330');assert.equal(q.materials.find(m=>m.id===2447).have,0);s=action(s,{type:'craft',id:q.id,count:1,buyMissing:true});assert.equal(countItem(s,2447),5);
});
test('skinning overflow is retained in pending loot',()=>{
 let s=learn(fresh(),'skinning');while(s.bag.length<16)addItem(s,35);startCombat(s,[299]);s.combat.enemies[0].hp=0;combatTick(s);assert.ok(s.pending.some(i=>i.id===2318));
});
test('profession progression has level gates and regional skill gates',()=>{
 let s=learn(fresh(),'mining');assert.throws(()=>action(s,{type:'upgradeProfession',id:'mining'}));s.professions.mining.skill=50;s=action(s,{type:'upgradeProfession',id:'mining'});assert.equal(s.professions.mining.cap,150);s.location='jansen';const tin=view(s).resources.find(r=>r.item===2771);assert.ok(tin&&!tin.available);assert.throws(()=>action(s,{type:'gatherResource',id:tin.id}));
});
test('wrong-slot enchants and protected market sales cannot destroy items',()=>{
 let s=fresh();s=action(s,{type:'auctionBuy',id:907420,count:1});const before=JSON.stringify(s);assert.throws(()=>action(s,{type:'applyEnchant',id:907420,uid:s.equipment[16].uid}));assert.equal(JSON.stringify(s),before);
 addItem(s,35);const item=s.bag.find(i=>i.id===35);item.locked=true;assert.throws(()=>action(s,{type:'auctionSell',uid:item.uid}));item.locked=false;item.bound=true;assert.throws(()=>action(s,{type:'auctionSell',uid:item.uid}));
});
test('a larger bag replaces the smallest equipped bag without losing it',()=>{
 let s=fresh();for(let n=0;n<4;n++){addItem(s,4496);s=action(s,{type:'equipBag',uid:s.bag.find(i=>i.id===4496).uid});}const old=s.bags[0];addItem(s,4498);s=action(s,{type:'equipBag',uid:s.bag.find(i=>i.id===4498).uid});assert.equal(s.bags.length,4);assert.ok(s.bags.some(i=>i.id===4498));assert.deepEqual(s.bag.find(i=>i.uid===old.uid),old);assert.equal(view(s).bagCapacity,42);
});
test('auction history still includes sold item names after inventory empties',()=>{
 let s=fresh();addItem(s,5207);s=action(s,{type:'auctionSell',uid:s.bag.find(i=>i.id===5207).uid});s=advance(s,30000).state;assert.ok(view(s).items[5207]);
});
