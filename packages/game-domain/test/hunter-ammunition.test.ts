import test from 'node:test';
import assert from 'node:assert/strict';
import {act,advance,createGame,view} from '../src/rules/engine.js';
import {ammoCount,consumeHunterAmmo,handleTownAmmo,resolveAmmoPrompt} from '../src/rules/ammunition.js';
import {addItem} from '../src/rules/character.js';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Character,Rules} from '../src/model.ts';

test('hunter shots consume matching ammunition and stop using the bow when it is empty',()=>{
 let state=createGame('Archer',12345,0,{classId:3,raceId:2});
 state.location='northwood';
 state.ammunition={2512:2};
 state=act(state,{type:'hunt',id:6},0);
 state=advance(state,10000).state;
 assert.equal(ammoCount(state),0);
 assert.ok((state.logs as any[]).some(row=>row.text.includes('自动射击')));
 const shots=(state.logs as any[]).filter(row=>row.text.includes('自动射击')).length;
 state=advance(state,20000).state;
 assert.equal(ammoCount(state),0);
 assert.equal((state.logs as any[]).filter(row=>row.text.includes('自动射击')).length,shots);
});

test('returning to town prompts below 400 and auto-buys the highest level matching ammunition',()=>{
 let state:any=createGame('Archer',12345,0,{classId:3,raceId:2});
 state.level=30;state.location='northwood';state.money=1000;state.ammunition={2512:399};
 state=act(state,{type:'travel',to:'northshire'},0);
 state=advance(state,state.activity.endsAt).state;
 assert.equal(view(state).ammoPrompt.memberId,state.id);
 resolveAmmoPrompt(state,{memberId:state.id,enabled:true,target:400});
 assert.deepEqual(state.ammoPolicy,{enabled:true,target:400});
 assert.equal(state.ammunition[3030],200);
 assert.equal(ammoCount(state),599);
 assert.equal(state.money,700);
 state.ammunition={3030:1};state.money=1000;
 handleTownAmmo(state,'town');
 assert.equal(state.ammunition[3030],401);
 assert.equal(state.money,400);
 assert.equal(view(state).ammoPrompt,null);
});



test('declining each hunter prompt ends the queue until the next town visit',()=>{
 const state:any=createGame('Leader',12345,0,{classId:3,raceId:2});
 const companion:any=createGame('Friend',12346,0,{classId:3,raceId:2});
 companion.id='friend';state.party=[companion];
 handleTownAmmo(state);
 assert.equal(state.ammoRestockPrompt.memberId,state.id);
 resolveAmmoPrompt(state,{memberId:state.id,enabled:false,target:400});
 assert.equal(state.ammoRestockPrompt.memberId,companion.id);
 resolveAmmoPrompt(state,{memberId:companion.id,enabled:false,target:400});
 assert.equal(state.ammoRestockPrompt,undefined);
 handleTownAmmo(state);
 assert.equal(state.ammoRestockPrompt.memberId,state.id);
});

test('shop ammunition can be loaded and consumed without duplicating its bag stack',()=>{
 let state:any=createGame('Archer',12345,0,{classId:3,raceId:2});
 state.ammunition={};state.money=1000;
 state=act(state,{type:'buy',id:2512,count:1},0);
 const stack=state.bag.find((item:any)=>item.id===2512);
 assert.equal(view(state).ammo[0].loadable[0].uid,stack.uid);
 state=act(state,{type:'loadAmmo',memberId:state.id,uid:stack.uid},0);
 assert.equal(ammoCount(state),200);
 assert.ok(!state.bag.some((item:any)=>item.uid===stack.uid));
 assert.equal(consumeHunterAmmo(state)?.entry,2512);
 assert.equal(ammoCount(state),199);
 assert.throws(()=>act(state,{type:'loadAmmo',memberId:state.id,uid:stack.uid},0));
});

test('crafted or transferred stacks use the same loading path, with type, level and lock validation',()=>{
 let state:any=createGame('Gunner',12345,0,{classId:3,raceId:3});
 state.ammunition={};
 // Crafted Light Shot uses the same bag item format as vendor and transferred items.
 addItem(state,2516,100,false);addItem(state,2512,100,false);addItem(state,3033,200,false);
 const shot=state.bag.find((item:any)=>item.id===2516);
 for(const id of [2512,3033])assert.throws(()=>act(state,{type:'loadAmmo',memberId:state.id,uid:state.bag.find((item:any)=>item.id===id).uid},0));
 shot.locked=true;
 assert.throws(()=>act(state,{type:'loadAmmo',memberId:state.id,uid:shot.uid},0));
 shot.locked=false;
 state=act(state,{type:'loadAmmo',memberId:state.id,uid:shot.uid},0);
 assert.equal(consumeHunterAmmo(state)?.entry,2516);
 assert.equal(ammoCount(state),99);
});

test('saved settings can change quantity and disable purchases without immediately spending money',()=>{
 let state:any=createGame('Archer',12345,0,{classId:3,raceId:2});
 state.money=1000;
 state=act(state,{type:'ammoSettings',memberId:state.id,enabled:true,target:800},0);
 assert.equal(state.money,1000);
 handleTownAmmo(state);assert.equal(ammoCount(state),800);
 state=act(state,{type:'ammoSettings',memberId:state.id,enabled:false,target:1200},0);
 state.ammunition={};const balance=state.money;
 handleTownAmmo(state);
 assert.equal(state.money,balance);
 assert.deepEqual(state.ammoPolicy,{enabled:false,target:1200});
 for(const target of [0,10001,1.5])assert.throws(()=>act(state,{type:'ammoSettings',memberId:state.id,enabled:true,target},0));
});
