import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,view,act} from '../lib/game/engine.js';
import {stats,gainXp,killXp,canEquip} from '../lib/game/character.js';
import {classDefinitions,xpTable} from '../lib/game/catalog.js';

test('every valid race/class advances beyond20 using its real level60 stats and stops exactly at60',()=>{
 for(const cls of classDefinitions)for(const raceId of cls.races){
  const s=createGame('满级成长',771,0,{classId:cls.id,raceId});s.level=20;const before=stats(s);
  assert.ok(xpTable[59]?.xp_for_next_level>0,'level59 source XP');
  const total=Array.from({length:40},(_,n)=>xpTable[n+20].xp_for_next_level).reduce((a,b)=>a+b,0);
  gainXp(s,s,total+500);assert.equal(s.level,60);assert.equal(s.xp,0);assert.ok(stats(s).maxHp>before.maxHp);assert.ok(stats(s).str>before.str);
  const saved=JSON.parse(JSON.stringify(s));gainXp(s,s,1000000);assert.equal(s.level,60);assert.equal(s.xp,0);assert.equal(view(s).nextXp,0);assert.equal(advance(saved,0).state.level,60);
 }
});

test('level60 kill experience uses high-level trivial and zero-difference bands',()=>{
 assert.equal(killXp(60,47),0);assert.equal(killXp(60,48),101);assert.equal(killXp(50,40),98);assert.equal(killXp(60,60),345);
});

test('level40 armor upgrades require the learned class proficiency',()=>{
 const plate={class:4,subclass:4,InventoryType:5,RequiredLevel:40,AllowableClass:-1,AllowableRace:-1,RequiredSkill:0};
 const mail={...plate,subclass:3};
 const warrior=createGame('板甲',77,0,{classId:1,raceId:1});warrior.level=40;assert.equal(canEquip(warrior,plate),false);warrior.learned.push(750);assert.equal(canEquip(warrior,plate),true);
 const hunter=createGame('锁甲',78,0,{classId:3,raceId:2});hunter.level=40;assert.equal(canEquip(hunter,mail),false);hunter.learned.push(8737);assert.equal(canEquip(hunter,mail),true);assert.equal(canEquip(hunter,plate),false);
});

test('druid current form changes the displayed resource and current states serialize',()=>{
 const s=createGame('形态资源',81,0,{classId:11,raceId:4});s.level=20;s.form='cat';s.energy=43;assert.deepEqual(view(s).resource,{name:'能量',value:43,max:100});s.form='bear';s.rage=310;assert.deepEqual(view(s).resource,{name:'怒气',value:31,max:100});
 const saved=JSON.parse(JSON.stringify(createGame('存档恢复',83,0)));saved.level=20;assert.equal(advance(saved,0).state.level,20);
});
