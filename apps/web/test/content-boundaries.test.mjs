import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act} from '../../../packages/game-domain/src/rules/engine.js';
import {monsterIdsAt,creatureLocations,objectLocations,quests,nodes} from '../../../packages/game-domain/src/rules/catalog.js';
test('instance-only bosses cannot be selected as outdoor offline hunting targets',()=>{
 assert.ok(!monsterIdsAt('deadmines').includes(639));
 const s=createGame('边界',1,0);s.location='deadmines';assert.throws(()=>act(s,{type:'hunt',id:639},0),/没有/);
});

test('companions immune to players are not outdoor hunting targets',()=>{
 for(const id of [7381,7382,7385])assert.ok(!monsterIdsAt('northshire').includes(id));
});
test('alternative and group spawns expose quest enemies in their original regions',()=>{
 for(const id of [97,478,46,732,126,626,623,624,625])assert.ok(Object.keys(nodes).some(node=>monsterIdsAt(node).includes(id)),`missing ${id}`);
 assert.deepEqual(creatureLocations[392],['lighthouse']);
 assert.ok(creatureLocations[1343].includes('algaz'));
 assert.ok(objectLocations[271].includes('silverstream'));
 assert.ok(objectLocations[33]?.length);assert.ok(objectLocations[34]?.length);
 assert.equal(quests[578],undefined,'level-32 provenance must not become a stage quest');
});
