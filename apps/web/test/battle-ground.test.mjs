import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {battleGrounds,encounterGround} from '../../../packages/game-data/battle-ground.js';
import {sceneCombatArea} from '../../../packages/game-domain/src/rules/combat-area.js';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';

test('Deadmines follows each encounter floor instead of one dungeon illustration',()=>{
 for(const [routeId,expected] of [['dm-entry-01','cave'],['dm-sneed','cave'],['dm-smite','deck'],['dm-vancleef','deck']]){
  assert.equal(encounterGround({dungeon:true,area:sceneCombatArea({dungeon:true,routeId})}),expected);
 }
});
test('outdoors distinguishes caves, dry earth, grass and actually entering water',()=>{
 assert.equal(encounterGround({location:{id:'jansen',region:'西部荒野'}}),'cave');
 assert.equal(encounterGround({location:{id:'coast',region:'西部荒野'},environment:{mode:'shore'}}),'dirt');
 assert.equal(encounterGround({location:{id:'mirror',region:'艾尔文'},environment:{mode:'shore'}}),'grass');
 for(const mode of ['swim','underwater','waterwalk'])assert.equal(encounterGround({environment:{mode}}),'water');
 assert.equal(encounterGround({dungeon:true,area:{ground:'deck'},environment:{mode:'swim'}}),'deck');
 assert.equal(encounterGround(),'grass');
});
test('battle ground survives client projection and moving away after combat',()=>{
 const s=createGame('地面测试',283,0);s.location='jansen';startCombat(s,[299]);
 assert.equal(s.combat.ground,'cave');
 assert.equal(projectClientSnapshot(s,view(s)).player.combat.ground,'cave');
 s.lastCombat=s.combat;s.combat=null;s.location='northshire';
 assert.equal(projectClientSnapshot(s,view(s)).player.lastCombat.ground,'cave');
 s.location='mirror';s.environment={mode:'swim'};startCombat(s,[299]);
 assert.equal(projectClientSnapshot(s,view(s)).player.combat.ground,'water');
});
test('all ground presets have local production assets',()=>{
 for(const ground of Object.values(battleGrounds))assert.ok(existsSync(new URL('../public'+ground.image,import.meta.url)),ground.image);
});
