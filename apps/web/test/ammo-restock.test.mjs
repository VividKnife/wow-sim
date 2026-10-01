import test from 'node:test';
import assert from 'node:assert/strict';
import {restockHunterAmmo} from '../lib/ammo-restock.js';
import {act,createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {handleTownAmmo,ammoCount} from '../../../packages/game-domain/src/rules/ammunition.js';
import {addItem,bagCapacity} from '../../../packages/game-domain/src/rules/character.js';
import {validateRuleAction} from '../../../packages/protocol/src/rule-action.ts';

function fixture(){
 let state=createGame('Archer',123,0,{classId:3,raceId:2});
 state.location='northshire';state.ammunition={};state.money=10000;
 handleTownAmmo(state);
 const actions=[];
 const getSnapshot=()=>({player:state,view:view(state)});
 const send=async action=>{validateRuleAction(action);actions.push(action);state=act(state,action,state.wallAt);return true;};
 const refill=(target=400,overrides={})=>restockHunterAmmo({getSnapshot,send,actorId:state.id,memberId:state.id,visit:state.ammoRestockPrompt.visit,target,...overrides});
 return {get state(){return state;},getSnapshot,send,actions,refill};
}

test('large targets use valid ordinary shop quantities and automatically load every purchase',async()=>{
 const f=fixture();await f.refill(10000);
 assert.equal(ammoCount(f.state),10000);assert.equal(f.state.money,9500);
 assert.ok(f.actions.some(a=>a.type==='buy'));
 assert.ok(f.actions.every(a=>a.type==='loadAmmo'||a.type==='buy'&&a.count>=1&&a.count<=20));
 assert.ok(!f.state.bag.some(item=>item.id===2512));
});

test('insufficient funds buy only affordable whole packs and a full bag never submits an invalid purchase',async()=>{
 const poor=fixture();poor.state.money=15;await poor.refill();
 assert.equal(ammoCount(poor.state),200);assert.equal(poor.state.money,5);
 const full=fixture();
 const free=bagCapacity(full.state)-full.state.bag.length;
 assert.ok(addItem(full.state,2504,free,false));
 assert.equal(full.state.bag.length,bagCapacity(full.state));
 await assert.rejects(full.refill(),/背包空间不足/);assert.deepEqual(full.actions,[]);
});

test('failed loading leaves purchased ammunition available for retry instead of buying it again',async()=>{
 const f=fixture();
 await assert.rejects(f.refill(400,{send:async action=>action.type==='loadAmmo'?false:f.send(action)}),/装填未完成/);
 assert.equal(f.state.money,9990);assert.equal(ammoCount(f.state),0);
 await f.refill();
 assert.equal(f.state.money,9980);assert.equal(ammoCount(f.state),400);
});

test('local stock determines the ammo tier and unavailable merchants do not receive buy requests',async()=>{
 const f=fixture();f.state.level=30;await f.refill();
 assert.ok(f.actions.filter(a=>a.type==='buy').every(a=>a.id===2512));
 const absent=fixture();
 const getSnapshot=()=>{const snapshot=absent.getSnapshot();snapshot.view.shop=[];return snapshot;};
 await assert.rejects(absent.refill(400,{getSnapshot}),/当地商人/);assert.deepEqual(absent.actions,[]);
});

test('a character switch between purchase and loading stops further commands',async()=>{
 const f=fixture();let switched=false;
 const getSnapshot=()=>{const snapshot=f.getSnapshot();return switched?{...snapshot,player:{...snapshot.player,id:'other'}}:snapshot;};
 await assert.rejects(f.refill(400,{getSnapshot,send:async action=>{const result=await f.send(action);switched=true;return result;}}),/角色或补给任务已改变/);
 assert.equal(f.actions.length,1);assert.equal(f.actions[0].type,'buy');
});
