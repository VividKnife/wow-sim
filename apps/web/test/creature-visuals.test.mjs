import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {creatureVisual} from '../lib/creature-visuals.js';
import manifest from '../../../packages/game-data/data/npc-models-manifest.json' with {type:'json'};
import {serviceModels} from '../../../packages/game-data/creature-visuals.js';
import {nodes,monsterIdsAt,creatures,creatureLocations} from '../../../packages/game-domain/src/rules/catalog.js';
import deadmines from '../../../packages/game-data/data/deadmines-reference.json' with {type:'json'};

test('creatures resolve to individual model textures rather than type icons',()=>{
 const wolf=creatureVisual({entry:69}),boar=creatureVisual({entry:113}),boss=creatureVisual({entry:639});
 assert.notEqual(wolf.src,boar.src);assert.equal(wolf.kind,'npc-model-render');
 assert.equal(boss.kind,'npc-model-render');assert.notEqual(boss.src,creatureVisual({entry:636}).src);
 assert.equal(creatureVisual({modelId:manifest.entries[69].displayId}).src,wolf.src);
 assert.equal(creatureVisual({entry:999999}).src,null);
});
test('every playable outdoor and dungeon template has a local mapped asset',()=>{
 const ids=new Set([...Object.keys(nodes).flatMap(monsterIdsAt),...deadmines.encounters.flatMap(e=>e.sourceSpawns.flatMap(s=>s.templateChoices.map(t=>t.entry))),643]);
 for(const entry of ids){assert.ok(manifest.entries[entry],`missing template ${entry}`);assert.match(creatureVisual({entry}).src,/^\/creatures\/portraits\/classic-display-\d+\.webp$/);}
});
test('all locally placed NPC templates and authored service roles have model textures',()=>{
 for(const entry of [...Object.keys(creatureLocations).filter(id=>creatures[id]),...Object.values(serviceModels),467]){
  assert.equal(creatureVisual({entry}).kind,'npc-model-render',`missing NPC ${entry}`);
 }
});
test('checked-in original model bytes match the resource manifest',async()=>{
 for(const asset of manifest.assets){
  const bytes=await readFile(new URL('../public/'+asset.path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
});
