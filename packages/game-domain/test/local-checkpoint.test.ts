import test from 'node:test';
import assert from 'node:assert/strict';
import {advance} from '../src/rules/engine.js';
import {projectLocalCheckpoint} from '../src/rules/local-checkpoint.js';
import {localScenarios} from './support/local-scenarios.ts';

for(const [name,initial] of Object.entries(localScenarios()))test(`${name}: restoring a compact checkpoint preserves subsequent simulation and settlement`,()=>{
 const live=advance(initial,5000).state;
 const checkpoint=projectLocalCheckpoint(live);
 assert.deepEqual(checkpoint.logs,[]);assert.deepEqual(checkpoint.battleHistory,[]);
 const expected=advance(live,15000).state;
 const restored=advance(checkpoint,15000).state;
 assert.deepEqual(projectLocalCheckpoint(restored),projectLocalCheckpoint(expected));
 assert.notEqual(checkpoint,live);
 if(live.combat){assert.deepEqual(checkpoint.combat,live.combat);assert.notEqual(checkpoint.combat,live.combat);}
});

test('presentation pruning is recursive for party and NPC copies, without discarding durable journey or combat data',()=>{
 const unit={id:'npc',logs:[{text:'hit'}],battleHistory:[{battle:{id:'past'}}],hp:10,equipment:{hand:{uid:'weapon'}}};
 const source={logs:[{text:'hit'}],battleHistory:[{battle:{id:'past'}}],journey:[{kind:'quest',text:'完成任务'}],
  party:[unit],npcWorld:{residents:[{unit,history:[{text:'获得装备'}]}]},
  combat:{projectiles:[{damage:100,landsAt:200}],metrics:{damage:100}},
  lastCombat:{goldSettled:false,enemies:[{hp:0}]},arena:{logs:[{text:'cast'}],logSequence:7},
  battleground:{events:[{text:'flag'}],effects:[{kind:'heal'}],eventSequence:9,score:[1,0]}};
 const before=structuredClone(source),saved=projectLocalCheckpoint(source);
 assert.deepEqual(source,before);
 assert.deepEqual(saved.party[0].logs,[]);assert.deepEqual(saved.npcWorld.residents[0].unit.battleHistory,[]);
 assert.deepEqual(saved.npcWorld.residents[0].history,source.npcWorld.residents[0].history);
 assert.deepEqual(saved.journey,source.journey);assert.deepEqual(saved.combat,source.combat);assert.deepEqual(saved.lastCombat,source.lastCombat);
 assert.deepEqual(saved.arena,{logs:[],logSequence:7});assert.deepEqual(saved.battleground,{events:[],effects:[],eventSequence:9,score:[1,0]});
});
