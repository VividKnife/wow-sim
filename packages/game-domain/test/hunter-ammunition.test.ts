import test from 'node:test';
import assert from 'node:assert/strict';
import {act,advance,createGame,view} from '../src/rules/engine.js';
import {ammoCount,consumeHunterAmmo,selectedAmmo,provisionAmmo} from '../src/rules/ammunition.js';
import {handleTownSupplies,supplyOptions} from '../src/rules/town-supplies.js';
import {addItem} from '../src/rules/character.js';
import {items,table,classItemInventory} from '../src/rules/catalog.js';
import {projectCombatObservation} from '../src/rules/combat-observation.js';

test('shots consume real bag rounds and stop shooting when empty',()=>{
 let state:any=createGame('Archer',12345,0,{classId:3,raceId:2});
 state.location='northwood';provisionAmmo(state,{2512:2});
 state=act(state,{type:'hunt',id:6},0);state=advance(state,10000).state;
 assert.equal(ammoCount(state),0);assert.ok(!state.bag.some((item:any)=>item.id===2512));
 const shots=state.logs.filter((row:any)=>row.text.includes('自动射击')).length;assert.ok(shots>0);
 state=advance(state,20000).state;
 assert.equal(state.logs.filter((row:any)=>row.text.includes('自动射击')).length,shots);
});

test('hunters default to enabled matching ammo; arrival only records a client visit',()=>{
 for(const raceId of [2,3]){
  let s:any=createGame('Hunter',123,0,{classId:3,raceId});
  assert.deepEqual(s.townSupplies,[{key:raceId===2?'arrows':'bullets',enabled:true,target:400}]);
  s.location='northwood';s.money=1000;s.level=30;
  s=act(s,{type:'travel',to:'northshire'},0);s=advance(s,s.activity.endsAt).state;
  assert.equal(s.townSupplyVisit,1);assert.equal(s.money,1000);assert.equal(ammoCount(s),200);
  const local=view(s).townSupplies.entries[0];assert.equal(local.itemId,raceId===2?2512:2516);
  s.location='stormwind';assert.equal(view(s).townSupplies.entries[0].itemId,raceId===2?3030:3033);
  handleTownSupplies(s);assert.equal(s.money,1000);
 }
});

test('selection keeps stacks in the bag and rejects wrong type, level, ownership and locked ammo',()=>{
 let s:any=createGame('Gunner',123,0,{classId:3,raceId:3});
 provisionAmmo(s,{});addItem(s,2516,100,false);addItem(s,2512,100,false);addItem(s,3033,200,false);
 const shot=s.bag.find((i:any)=>i.id===2516);
 for(const id of [2512,3033])assert.throws(()=>act(s,{type:'selectAmmo',uid:s.bag.find((i:any)=>i.id===id).uid},0));
 shot.locked=true;assert.throws(()=>act(s,{type:'selectAmmo',uid:shot.uid},0));assert.equal(ammoCount(s),0);shot.locked=false;
 shot.ownerId='other';assert.throws(()=>act(s,{type:'selectAmmo',uid:shot.uid},0));delete shot.ownerId;
 s=act(s,{type:'selectAmmo',uid:shot.uid},0);assert.equal(ammoCount(s),100);
 assert.ok(s.bag.some((i:any)=>i.uid===shot.uid));assert.equal(consumeHunterAmmo(s)?.entry,2516);assert.equal(ammoCount(s),99);
 s.level=30;assert.equal(selectedAmmo(s)?.entry,2516);s.bag=s.bag.filter((i:any)=>i.id!==2516);assert.equal(selectedAmmo(s)?.entry,3033);
});

test('supply catalog is vendor-only and prioritizes class reagents, food and mana needs',()=>{
 const vendors=new Set([...table('npc_vendor').map((row:any)=>row.item),...classItemInventory.filter((item:any)=>item.sources.some((source:any)=>['npc_vendor','npc_vendor_template'].includes(source.table))).map((item:any)=>item.itemId)]);
 const mage:any=createGame('Mage',123,0);mage.level=60;
 const options=supplyOptions(mage);
 assert.ok(options.some((row:any)=>row.category==='职业施法材料'));
 assert.equal(options[0].category,'职业施法材料');
 assert.ok(options.findIndex((row:any)=>row.category==='饮水')<options.findIndex((row:any)=>row.category==='食物'));
 assert.deepEqual(options.filter((row:any)=>row.category==='弹药').map((row:any)=>row.key).sort(),['arrows','bullets']);
 for(const option of options)assert.ok(vendors.has(option.itemId),String(option.itemId));
 assert.ok(!options.some((row:any)=>row.key==='item:6948'));
 const warrior=createGame('Warrior',123,0,{classId:1});assert.equal(supplyOptions(warrior)[0].category,'食物');
});

test('settings validate vendor IDs, unique keys and quantities without spending money',()=>{
 let s:any=createGame('Mage',123,0);s.money=1000;
 s=act(s,{type:'townSupplySettings',entries:[{key:'item:159',enabled:true,target:20}]},0);
 assert.deepEqual(s.townSupplies,[{key:'item:159',enabled:true,target:20}]);assert.equal(s.money,1000);
 for(const target of [0,10001,1.5,NaN])assert.throws(()=>act(s,{type:'townSupplySettings',entries:[{key:'arrows',enabled:true,target}]},0));
 for(const key of ['item:6948','item:99999999','item:2512'])assert.throws(()=>act(s,{type:'townSupplySettings',entries:[{key,enabled:true,target:1}]},0));
 assert.throws(()=>act(s,{type:'townSupplySettings',entries:[s.townSupplies[0],s.townSupplies[0]]},0));
});

test('combat observations expose usable ammo counts without leaking bags',()=>{
 let s:any=createGame('Archer',12345,0,{classId:3,raceId:2});s.location='northwood';
 s=act(s,{type:'hunt',id:6},0);s=advance(s,100).state;
 const observation:any=projectCombatObservation(s);assert.ok(observation);assert.equal(observation.bag,undefined);assert.equal(ammoCount(observation),ammoCount(s));
});

test('bulk junk cleanup preserves real ammunition stacks',()=>{
 let s:any=createGame('Archer',123,0,{classId:3,raceId:2});addItem(s,7073,1,false);
 s=act(s,{type:'discardJunk'},0);assert.equal(ammoCount(s),200);assert.ok(!s.bag.some((item:any)=>item.id===7073));
});

test('party members can select their own ammo while out of combat in a dungeon',()=>{
 const leader:any=createGame('Leader',123,0),member:any=createGame('Archer',124,0,{classId:3,raceId:2,characterId:'archer'});
 leader.party=[member];leader.dungeon={id:'deadmines'};
 const stack=member.bag.find((item:any)=>item.id===2512);
 const result:any=act(leader,{type:'selectAmmo',uid:stack.uid},0,{actorId:member.id});
 assert.equal(result.party[0].selectedAmmoId,2512);assert.equal(ammoCount(result.party[0]),200);
 assert.throws(()=>act(leader,{type:'selectAmmo',uid:stack.uid},0));
});
