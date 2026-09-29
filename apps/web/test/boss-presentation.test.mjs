import test from 'node:test';
import assert from 'node:assert/strict';
import {combatBosses,waitingRaidBoss} from '../lib/boss-presentation.js';
import {effectsFor} from '../../../packages/game-domain/src/rules/battle-presentation.js';

test('boss targets distinguish raid guards from bosses and recognize dungeon elites',()=>{
 const enemies=[{id:'mc-boss',entry:12118,rank:3},{id:'guard',entry:12119,rank:3},{id:'dungeon-boss',entry:639,rank:1}];
 assert.deepEqual(combatBosses({enemies},{goldRaid:{bosses:[{entry:12118}]}}).map(e=>e.id),['mc-boss']);
 assert.deepEqual(combatBosses({enemies},{dungeon:{route:[{bossIds:[639]}]}}).map(e=>e.id),['dungeon-boss']);
 assert.deepEqual(combatBosses({enemies,raidEncounter:{id:'lucifron'}},{}).map(e=>e.id),['mc-boss']);
});
test('waiting boss appears only at a paused uncleared raid encounter',()=>{
 const boss={id:'lucifron'},raid={active:true,phase:'camp',activeBoss:'lucifron',bosses:[boss],cleared:[],map:{autoAdvance:false}};
 assert.equal(waitingRaidBoss({}, {goldRaid:raid}),boss);
 for(const patch of [{active:false},{phase:'combat'},{cleared:['lucifron']},{activeBoss:'trash'},{map:{autoAdvance:true}}])assert.equal(waitingRaidBoss({}, {goldRaid:{...raid,...patch}}),null);
 assert.equal(waitingRaidBoss({combat:{}},{goldRaid:raid}),null);
});
test('aura projection distinguishes routine buffs, healing and hostile curses',()=>{
 const effects=effectsFor({serverBuffs:[{id:'realm',name:'服务器增益'}],buffs:{sta:{spell:1243,until:100000}},hots:[{spell:139,until:5000}],auras:[{spell:19703,positive:false,until:26000}],periodicClass:[{spell:774,type:8,until:5000}],absorb:{spell:17,amount:50,until:6000}},1000);
 assert.equal(effects.find(e=>e.name==='服务器增益').routine,true);
 assert.equal(effects.find(e=>e.spellId===1243).routine,true);
 for(const id of [139,774,17]){assert.equal(effects.find(e=>e.spellId===id).kind,'buff');assert.equal(effects.find(e=>e.spellId===id).routine,false);}
 assert.equal(effects.find(e=>e.spellId===19703).kind,'debuff');
 assert.equal(effectsFor({auras:[{spell:19703,positive:false,until:999}]},1000).length,0);
});
