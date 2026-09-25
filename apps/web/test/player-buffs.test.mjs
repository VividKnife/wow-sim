import test from 'node:test';
import assert from 'node:assert/strict';
import {hudBuffs,buffDuration} from '../lib/player-buffs.js';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {applyExperienceBuff} from '../../../packages/game-domain/src/rules/experience.js';
test('HUD lists permanent and active buffs outside combat, deduplicating server effects',()=>{
 const s=applyExperienceBuff(createGame('Buff测试',1,0),2);
 s.clock=1000;s.buffs={int:{spell:1459,until:10000,amount:2,kind:'int'},expired:{spell:168,until:999}};
 s.dots=[{spell:589,until:10000}];
 const d=view(s),buffs=hudBuffs(s,d);
 assert.equal(buffs.filter(b=>b.name==='经验加成').length,1);
 assert.ok(buffs.find(b=>b.spellId===1459));
 assert.ok(!buffs.find(b=>b.spellId===168||b.spellId===589));
 assert.equal(buffs[0].permanent,true);
 s.clock=10001;assert.equal(hudBuffs(s,d).length,1);
});
test('HUD formats short countdowns and merges timed item effects',()=>{
 assert.deepEqual([999,10000,60000,3600000].map(buffDuration),['1s','10s','1m','1h']);
 const buffs=hudBuffs({clock:1000},{itemBuffs:[{spell:1,name:'药剂',until:2000},{spell:2,name:'已过期',until:1000}]});
 assert.equal(buffs.length,1);assert.equal(buffs[0].permanent,false);
});
