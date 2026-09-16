import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,stats} from '../lib/game/engine.js';
import {startCombat,combatTick} from '../lib/game/combat.js';

const clone=value=>JSON.parse(JSON.stringify(value));

function finishFightWithEffect(classId,raceId,spellId){
 const s=createGame('持续恢复测试',90210,0,{classId,raceId});
 s.level=20;s.learned=[spellId];s.rules=[{spell:spellId,condition:'always',value:0,enabled:true}];
 s.hp=1;s.mana=stats(s).maxMana;
 startCombat(s,[299]);
 const enemy=s.combat.enemies[0];enemy.hp=enemy.maxHp=100000;enemy.nextAttack=1e9;enemy.nextSpell=1e9;enemy.rootUntil=1e9;
 combatTick(s);
 s.rules=[];
 while(s.cast){s.clock+=100;combatTick(s);}
 assert.ok(s.hots?.some(h=>h.spell===spellId)||s.totems?.water?.spell===spellId,`spell ${spellId} must create its periodic effect`);
 enemy.hp=0;s.clock+=100;combatTick(s);
 assert.equal(s.combat,null,'the periodic effect must survive combat ending');
 s.nextTick=s.clock+100;s.nextRegen=Math.max(s.nextRegen,s.clock+100);
 return s;
}

test('Renew, Rejuvenation, and Regrowth keep ticking after combat, expire, and serialize deterministically',()=>{
 for(const [classId,raceId,spellId] of [[5,1,139],[11,4,774],[11,4,8936]]){
  const seed=finishFightWithEffect(classId,raceId,spellId),before=seed.logs.filter(l=>l.kind==='heal'&&l.spellId===spellId).length;
  const whole=advance(clone(seed),30000).state,direct=advance(seed,30000).state;
  const first=advance(clone(seed),10000).state,partitioned=advance(first,30000).state;
  assert.deepEqual(direct,whole,`spell ${spellId} must survive JSON restoration`);
  assert.deepEqual(partitioned,whole,`spell ${spellId} must be JSON and partition deterministic`);
  assert.ok(whole.logs.filter(l=>l.kind==='heal'&&l.spellId===spellId).length>before,`spell ${spellId} must heal outside combat`);
  assert.equal(whole.hots?.length||0,0,`spell ${spellId} must expire outside combat`);
 }
});

test('Healing Stream Totem keeps healing after combat and expires on schedule',()=>{
 const seed=finishFightWithEffect(7,2,5394),before=seed.logs.filter(l=>l.kind==='heal'&&l.spellId===5394).length;
 const done=advance(seed,70000).state;
 assert.ok(done.logs.filter(l=>l.kind==='heal'&&l.spellId===5394).length>before);
 assert.equal(done.totems?.water,undefined);
});
