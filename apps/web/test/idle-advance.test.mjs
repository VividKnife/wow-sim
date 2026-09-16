import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance} from '../../../packages/game-domain/src/rules/engine.js';

test('fully recovered quiet actor advances 24 hours with a one-tick budget',()=>{
 const s=createGame('空闲',123,1000);const result=advance(s,86401037,{maxTicks:1});
 assert.equal(result.complete,true);assert.equal(result.state.clock,86400037);assert.equal(result.state.wallAt,86401037);
 assert.equal(result.state.nextTick,86400100);assert.equal(result.state.nextRegen,86402000);assert.equal(result.state.time,86400000);assert.equal(result.state.rngState,s.rngState);
});
test('idle shortcut matches normal tick and chunked advance including unaligned endpoints and party time',()=>{
 for(const duration of [99,100,1999,2000,2011,17033,600037]){
  const s=createGame('主角',123,1000);const companion=createGame('伙伴',456,1000);companion.id='helper';s.party=[companion];
  const expected=advance(s,1000+duration,{idleFastForward:false});assert.equal(expected.complete,true);
  const optimized=advance(s,1000+duration,{maxTicks:2});assert.equal(optimized.complete,true);assert.deepEqual(optimized.state,expected.state);
  const split=advance(advance(s,1000+Math.floor(duration/3)).state,1000+duration);assert.deepEqual(split.state,expected.state);
 }
});
test('incomplete regeneration uses bounded ticks then can fast-forward after recovery',()=>{
 const s=createGame('恢复',123,0);s.hp-=20;s.mana-=30;
 const bounded=advance(s,86400000,{maxTicks:1});assert.equal(bounded.complete,false);assert.equal(bounded.state.clock,100);
 assert.equal(bounded.state.hp,s.hp);assert.equal(bounded.state.mana,s.mana);
 const expected=advance(s,60000,{idleFastForward:false});const optimized=advance(s,60000);assert.deepEqual(optimized.state,expected.state);
 assert.equal(advance(s,86400000,{maxTicks:500}).complete,true);
});
test('periodic damage, underwater hazards, timed quests and pets cannot take idle shortcut',()=>{
 const dot=createGame('持续伤害',123,0);dot.auras=[{type:3,spell:172,amount:3,school:5,interval:1000,next:1000,until:3000,caster:'test',casterName:'测试'}];
 const timed=createGame('限时任务',123,0);timed.quests[783]={expiresAt:5000,kills:{}};
 const wet=createGame('水下',123,0);wet.location='mirror';wet.environment={mode:'underwater',breathMs:60000,lastTick:0};wet.swimming=true;
 for(const s of [dot,timed,wet]){const result=advance(s,86400000,{maxTicks:1});assert.equal(result.complete,false);assert.equal(result.state.clock,100);}
 for(const s of [dot,timed,wet])assert.deepEqual(advance(s,6000).state,advance(s,6000,{idleFastForward:false}).state);
 const pet=createGame('宠物',123,0);pet.pet={id:'pet',kind:'imp',hp:1,petUnit:true};assert.equal(advance(pet,86400000,{maxTicks:1}).complete,false);
});

