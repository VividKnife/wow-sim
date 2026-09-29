import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../src/rules/engine.js';
import {items,table} from '../src/rules/catalog.js';
import {addItem,countItem} from '../src/rules/character.js';
import {marketPrice,marketView,marketOffer,marketAvailability,marketEligible} from '../src/rules/market.js';
import {itemContentPhase} from '../src/rules/content-phase.js';
import {recipes} from '../src/rules/profession-data.js';
import {reserveMarket} from '../src/rules/market.js';
import {buyMarket} from '../src/rules/inventory.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';
import {rebaseSimulation} from '../src/context.ts';
import {GameService} from '../src/service.ts';
import {MemoryStore} from '../../persistence/src/memory.ts';
import type {Rules} from '../src/model.ts';
const fresh=()=>{const s:Rules=createGame('市场验收',283,0);s.level=60;s.money=100000000;s.location='stormwind';return s;};
const available=(s:Rules,id:number)=>marketAvailability(s.marketStock,s.clock,marketOffer(id)!);

test('historical anchors replace vendor multiples; every quote is integer and non-arbitrageable',()=>{
 assert.equal(marketPrice(13468)!.buy,500000);assert.equal(marketPrice(12363)!.buy,400000);assert.equal(marketPrice(2589)!.buy,100);
 const vendors=new Set(table('npc_vendor').map((r:Rules)=>r.item));
 for(const row of marketView()){
  assert.ok(Number.isSafeInteger(row.buy)&&Number.isSafeInteger(row.sell));assert.ok(row.buy>row.sell&&row.sell>=0);
  assert.ok(row.buy>items[row.id].SellPrice,`vendor liquidation ${row.id}`);
  if(vendors.has(row.id))assert.ok(row.sell<=Math.floor(items[row.id].BuyPrice/Math.max(1,items[row.id].BuyCount)*70/100),`vendor flip ${row.id}`);
  assert.ok(row.capacity>0&&row.restockMs>=300000);
 }
 assert.equal(marketPrice(2512)!.sell,0,'sub-copper ammunition cannot be rounded into a buyback exploit');
 assert.equal(marketPrice(21177)!.buy,165,'bundle price divided by BuyCount before markup');
});

test('catalog contains supported trade categories and class reagents, excludes bound and quest objects',()=>{
 for(const id of [2589,13468,12363,13926,14046,13444,13457,13510,17020,17026,17029,17030,17031,17032,21177,907420])assert.ok(marketOffer(id),String(id));
 for(const id of [6948,6265,6218,6339,11130,11145,16207,9149,12662,18240,17182])assert.equal(marketOffer(id),undefined,String(id));
 for(const row of marketView())assert.ok(marketEligible(items[row.id]));
 assert.equal(new Set(marketView().map(row=>row.category)).size,11);
});

test('stock is shared by repeated purchases, persists through reload, and restocks exactly at the boundary',()=>{
 let s=fresh();const offer=marketOffer(13468)!;
 s=act(s,{type:'auctionBuy',id:13468,count:offer.capacity},0);
 assert.equal(available(s,13468).available,0);assert.equal(countItem(s,13468),offer.capacity);
 const before=structuredClone(s);assert.throws(()=>buyMarket(s,13468,1),/库存不足/);assert.deepEqual(s,before);
 s=JSON.parse(JSON.stringify(s));s.clock=offer.restockMs-1;assert.equal(available(s,13468).available,0);
 s.clock++;assert.equal(available(s,13468).available,offer.capacity);
 buyMarket(s,13468,1);assert.equal(available(s,13468).available,offer.capacity-1);
 s.clock+=offer.restockMs*1000;assert.equal(available(s,13468).available,offer.capacity,'offline batches never exceed capacity');
 buyMarket(s,13468,1);assert.equal(available(s,13468).available,offer.capacity-1);
});

test('ordinary offline advance and client projection preserve live stock with rebased clocks',()=>{
 let s=fresh();s=act(s,{type:'auctionBuy',id:2589,count:100},0);
 assert.equal(available(s,2589).available,100);
 const projected=projectClientSnapshot(s,view(s));assert.deepEqual(projected.player.marketStock,s.marketStock);
 const shifted=rebaseSimulation(structuredClone(s),123400);assert.equal(available(shifted,2589).available,100);assert.equal(available(shifted,2589).restockAt-shifted.clock,300000);
 shifted.clock+=300000;buyMarket(shifted,2589,1);assert.equal(available(shifted,2589).restockAt-shifted.clock,300000,'rebase preserves the batch cadence');
 s=advance(s,300000).state;assert.equal(available(s,2589).available,200);
});

test('rejected count, funds, uniqueness and bag overflow never spend gold or deplete stock',()=>{
 for(const count of [0,-1,1.5,101,NaN]){const s=fresh(),before=structuredClone(s);assert.throws(()=>buyMarket(s,2589,count));assert.deepEqual(s,before);}
 const poor=fresh();poor.money=0;const poorBefore=structuredClone(poor);assert.throws(()=>buyMarket(poor,2589,1),/金币/);assert.deepEqual(poor,poorBefore);
 const full=fresh();full.bag=Array.from({length:16},(_,n)=>({uid:'filled'+n,id:35,count:1}));full.bags=[];const fullBefore=structuredClone(full);assert.throws(()=>buyMarket(full,2589,21),/空间/);assert.deepEqual(full,fullBefore);
 const unique=fresh();buyMarket(unique,4396,1);const uniqueBefore=structuredClone(unique);assert.throws(()=>buyMarket(unique,4396,1),/唯一/);assert.deepEqual(unique,uniqueBefore);
});

test('crafting auto-buy uses the same stock and refuses bound tools; upfront failures are atomic',()=>{
 let s=fresh();s.professions.alchemy={skill:300,cap:300};
 const before=structuredClone(s);assert.throws(()=>act(s,{type:'craft',id:'spell-17187',count:1,buyMissing:true},0),/绑定/);assert.deepEqual(s,before);
 s=act(s,{type:'craft',id:'spell-11459',count:1,buyMissing:true},0);
 s=act(s,{type:'craft',id:'spell-17187',count:1,buyMissing:true},0);
 assert.equal(available(s,12363).available,marketOffer(12363)!.capacity-1);
 assert.equal(countItem(s,9149),1);assert.equal(countItem(s,12360),1);
});

test('listing quotes lock gross and net, cancellation restores identity and settlement pays once',()=>{
 let s=fresh();addItem(s,13468,1);const item=s.bag.find((i:Rules)=>i.id===13468),initial=s.money;
 s=act(s,{type:'auctionSell',uid:item.uid},0);assert.equal(s.auctions[0].gross,400000);assert.equal(s.auctions[0].net,380000);
 s=advance(s,30000).state;assert.equal(s.money,initial+380000);assert.equal(s.marketHistory.length,1);
 s=advance(s,60000).state;assert.equal(s.money,initial+380000);
 assert.equal(available(s,13468).available,5,'buyback does not mint immediate fresh stock');
});

test('durable crafting reservations and direct purchases share payer stock across service restarts',async()=>{
 const store=new MemoryStore();let now=1000;const options={contentVersion:'auction-market-test',now:()=>now,seed:()=>283};
 let service=new GameService(store,options);
 const account=await service.createAccount('auction-market',{name:'持久化市场',classId:8,raceId:1},'create');
 const hero=account.account.primaryCharacterId;
 await store.transaction(tx=>tx.put('wallets',{id:hero,characterId:hero,accountId:'auction-market',balance:1000000}));
 await service.command('auction-market',{type:'learnProfession',id:'firstaid',requestId:'learn'});
 await service.command('auction-market',{type:'craft',id:'spell-3275',count:2,buyMissing:true,requestId:'craft'});
 let snapshot=await service.snapshot('auction-market');assert.equal(available(snapshot.state,2589).available,198);
 service=new GameService(store,options);now+=3000;await service.work();
 snapshot=await service.command('auction-market',{type:'auctionBuy',id:2589,count:1,requestId:'buy'});assert.equal(available(snapshot.state,2589).available,197);
 service=new GameService(store,options);snapshot=await service.snapshot('auction-market');assert.equal(available(snapshot.state,2589).available,197);
 now+=300000;snapshot=await service.snapshot('auction-market');
 assert.equal(marketAvailability(snapshot.state.marketStock,snapshot.state.marketClock,marketOffer(2589)!).available,200,'idle snapshot shows replenishment without needing another transaction');
});

test('phase release gates products, recipes, materials and synthetic enchants on the server',()=>{
 const expected=new Map([[22385,5],[22388,5],[19682,4],[19726,4],[19169,3],[18562,3],[20749,5],[20725,5],[925080,5],[22682,6],[22652,6]]);
 for(const [id,phase] of expected){
  assert.equal(itemContentPhase(id),phase,String(id));
  assert.equal(marketOffer(id),undefined,String(id));
  assert.ok(!marketView(phase-1).some(row=>row.id===id));
  assert.ok(marketView(phase).some(row=>row.id===id),`unlocks ${id} at P${phase}`);
  const s=fresh(),before=structuredClone(s);
  assert.throws(()=>buyMarket(s,id,1),new RegExp(`P${phase}`));assert.deepEqual(s,before);
 }
 // Early low IDs and late high IDs are not a proxy for release phases.
 for(const id of [12640,18510,21099,21340,21177,13468])assert.ok(marketOffer(id),`P1 available ${id}`);
 for(const recipe of recipes)for(const id of recipe.recipeItems){
  assert.ok(itemContentPhase(id)>=itemContentPhase(recipe.item),`recipe ${id} precedes product ${recipe.item}`);
 }
 for(let phase=1;phase<6;phase++)assert.ok(marketView(phase).length<marketView(phase+1).length);
});

test('future goods cannot be sold or supplied through profession auto-buy',()=>{
 const s=fresh();addItem(s,22385,1);const item=s.bag.find((i:Rules)=>i.id===22385)!;
 assert.equal(view(s).inventoryActions[item.uid].tradable,false);
 const before=structuredClone(s);
 assert.throws(()=>act(s,{type:'auctionSell',uid:item.uid},0));assert.deepEqual(s,before);
 assert.throws(()=>reserveMarket(s,[{id:2589,count:1},{id:20725,count:1}]),/P5/);assert.deepEqual(s,before);
});

test('auction categories distinguish armor slots, professions, herbs and enchant slots',()=>{
 const row=(id:number)=>marketView(6).find(row=>row.id===id)!;
 assert.equal(row(22385).subcategory,'板甲');assert.equal(row(22385).slot,'腿部');
 assert.equal(row(22388).subcategory,'锻造');assert.equal(row(13468).subcategory,'草药');
 assert.equal(row(13463).subcategory,'草药');assert.equal(row(2589).subcategory,'布料');
 assert.equal(row(920014).subcategory,'背部');assert.equal(row(920034).subcategory,'武器');
 assert.equal(row(8928).subcategory,'盗贼毒药');
 for(const r of marketView())assert.ok(r.subcategory,`missing child category ${r.id}`);
});
