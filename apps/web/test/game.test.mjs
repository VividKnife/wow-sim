import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, advance, stats, view, killXp, questProgress } from '../../../packages/game-domain/src/rules/engine.js';
import { route } from '../../../packages/game-domain/src/rules/catalog.js';
test('new human mage uses base attributes, original xp, and cannot access mount early',()=>{
 const s=createGame('星落',1,0);assert.equal(s.level,1);assert.equal(s.hp,stats(s).maxHp);assert.equal(s.mana,stats(s).maxMana);assert.equal(view(s).nextXp,400);assert.throws(()=>act(s,{type:'mount'},0),/20/);
});
test('quest chain enforces prerequisites, location, reward once',()=>{
 let s=createGame('测试',3,0);assert.throws(()=>act(s,{type:'accept',id:7},0));s=act(s,{type:'accept',id:783},0);s=act(s,{type:'turnin',id:783},0);assert.equal(s.xp,40);assert.throws(()=>act(s,{type:'turnin',id:783},0));s=act(s,{type:'accept',id:7},0);assert.equal(questProgress(s,7).complete,false);
});
test('travel is exclusive, reaches exact destination once, and respects elapsed time',()=>{
 let s=createGame('旅人',5,0);s=act(s,{type:'travel',to:'goldshire'},0);const time=route('northshire','goldshire').duration;assert.equal(advance(s,time-1).state.location,'northshire');s=advance(s,time).state;assert.equal(s.location,'goldshire');assert.equal(s.activity.type,'idle');assert.throws(()=>act(s,{type:'fly',to:'sentinel'},time));
});
test('outdoor combat is deterministic across save/reload and differently sized advances',()=>{
 let s=createGame('法师',12345,0);s=act(s,{type:'hunt',id:299},0);
 const whole=advance(s,180000).state;let chunks=s;for(let t=1000;t<=180000;t+=1000)chunks=advance(JSON.parse(JSON.stringify(chunks)),t).state;
 assert.deepEqual(chunks,whole);assert.ok(whole.totals.kills>0);assert.ok(whole.totals.xp>0);
});
test('kill XP has no hidden multiplier and becomes trivial',()=>{assert.equal(killXp(1,1),50);assert.equal(killXp(10,10),95);assert.equal(killXp(20,1),0)});
test('invalid actions cannot modify original state',()=>{const s=createGame('法师',12,0);const original=JSON.stringify(s);assert.throws(()=>act(s,{type:'buy',id:17,count:-1},0));assert.equal(JSON.stringify(s),original)});
