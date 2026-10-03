import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {addItem,makeItem} from '../../../packages/game-domain/src/rules/character.js';
import {provisionAmmo,ammoCount,selectedAmmo} from '../../../packages/game-domain/src/rules/ammunition.js';
import {restockTownSupplies,townSupplyRunKey} from '../lib/town-supplies.js';
function fixture({classId=3,raceId=2}={}){
 let player=createGame('Supply',123,0,{classId,raceId});player.location='northshire';player.money=100000;provisionAmmo(player,{});
 const actions=[],failures=[];
 const getSnapshot=()=>({player,view:view(player)});
 const send=async action=>{actions.push(action);try{player=act(player,action,player.wallAt);return true;}catch(error){failures.push(error);return false;}};
 const run=()=>restockTownSupplies({getSnapshot,send,runKey:townSupplyRunKey(getSnapshot())});
 return{get player(){return player;},set player(value){player=value;},actions,failures,getSnapshot,send,run};
}
test('ordinary purchases preserve bag ammo and repeated runs do not duplicate charges',async()=>{
 const f=fixture();await f.run();assert.equal(ammoCount(f.player),400);assert.equal(f.player.money,99980);
 assert.deepEqual(f.actions.map(row=>row.type),['buy','selectAmmo','buy','selectAmmo']);
 await f.run();assert.equal(f.actions.length,4);assert.equal(f.player.bag.filter(i=>i.id===2512).length,2);
});
test('current level and local vendor determine the highest ammo tier, without counting lower tiers',async()=>{
 const f=fixture();f.player.level=30;f.player.location='stormwind';provisionAmmo(f.player,{2512:400});
 await f.run();assert.equal(selectedAmmo(f.player).entry,3030);assert.equal(ammoCount(f.player),800);
 assert.deepEqual(f.actions.filter(row=>row.type==='buy').map(row=>row.id),[3030,3030]);
});
test('food and water use the same client purchase flow for non-hunters',async()=>{
 const f=fixture({classId:8,raceId:1});f.player.townSupplies=[{key:'item:159',enabled:true,target:7},{key:'item:4540',enabled:true,target:3}];
 await f.run();for(const id of [159,4540])assert.ok(f.player.bag.filter(row=>row.id===id).reduce((n,row)=>n+row.count,0)>=f.player.townSupplies.find(row=>row.key===`item:${id}`).target);
 assert.ok(f.actions.every(row=>row.type==='buy'));
});
test('low funds, disabled entries and full bags do not cause retry storms or partial charges',async()=>{
 const poor=fixture();poor.player.money=15;await poor.run();assert.equal(ammoCount(poor.player),200);assert.equal(poor.player.money,5);
 const disabled=fixture();disabled.player.townSupplies[0].enabled=false;await disabled.run();assert.equal(disabled.actions.length,0);
 const full=fixture();full.player.bags=[];full.player.bag=Array.from({length:16},()=>makeItem(full.player,117,20));const before=structuredClone(full.player.bag);await full.run();
 assert.equal(full.actions.length,1);assert.equal(full.failures.length,1);assert.equal(full.player.money,100000);assert.deepEqual(full.player.bag,before);
});
test('partial stacks can be refilled without a free slot',async()=>{
 const f=fixture();f.player.bags=[];f.player.bag=Array.from({length:14},()=>makeItem(f.player,117,20));addItem(f.player,2512,200,false);addItem(f.player,2512,1,false);f.player.townSupplies[0].target=200;
 await f.run();assert.equal(f.actions.length,0);
 // Water packs fit an existing stack even though every slot is occupied.
 f.player.bag[14]=makeItem(f.player,159,1);f.player.townSupplies=[{key:'item:159',enabled:true,target:5}];await f.run();assert.equal(f.failures.length,0);assert.equal(f.player.bag.length,16);
});
test('accepted purchases interrupted before selection resume without buying again',async()=>{
 const f=fixture();let cancelled=false;
 await restockTownSupplies({getSnapshot:f.getSnapshot,runKey:townSupplyRunKey(f.getSnapshot()),isCancelled:()=>cancelled,send:async action=>{const result=await f.send(action);cancelled=true;return result;}});
 assert.equal(ammoCount(f.player),200);await f.run();assert.equal(ammoCount(f.player),400);assert.equal(f.player.money,99980);
});
test('switching character, departing town or changing settings stops the next request',async()=>{
 for(const change of [s=>{s.id='another';},s=>{s.activity={type:'travel'};},s=>{s.townSupplies=[];}]){
  const f=fixture();await restockTownSupplies({getSnapshot:f.getSnapshot,runKey:townSupplyRunKey(f.getSnapshot()),send:async action=>{const result=await f.send(action);change(f.player);return result;}});assert.equal(f.actions.length,1);
 }
});
test('large targets respect pack counts and capacity without losing rounds',async()=>{
 const f=fixture();f.player.bags=Array.from({length:4},()=>makeItem(f.player,14046));f.player.townSupplies[0].target=10000;
 await f.run();assert.equal(ammoCount(f.player),10000);assert.equal(f.player.money,99500);assert.equal(f.failures.length,0);
});
test('unique vendor items stop at their ownership limit without charging again',async()=>{
 const f=fixture();f.player.location='stormwind';f.player.townSupplies=[{key:'item:1941',enabled:true,target:20}];
 await f.run();assert.equal(f.actions.length,1);assert.equal(f.failures.length,0);assert.equal(f.player.bag.filter(row=>row.id===1941).reduce((n,row)=>n+row.count,0),1);
});
test('saving unchanged settings starts a fresh client run for an explicit retry',async()=>{
 const f=fixture(),before=townSupplyRunKey(f.getSnapshot());
 await f.send({type:'townSupplySettings',entries:f.player.townSupplies});
 assert.notEqual(townSupplyRunKey(f.getSnapshot()),before);assert.equal(f.player.money,100000);
 await f.run();assert.equal(ammoCount(f.player),400);
});
