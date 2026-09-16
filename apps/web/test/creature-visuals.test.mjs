import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {creatureVisual} from '../lib/creature-visuals.js';
import manifest from '../../../packages/game-data/data/creature-assets-manifest.json' with {type:'json'};
import {nodes,monsterIdsAt} from '../../../packages/game-domain/src/rules/catalog.js';
import deadmines from '../../../packages/game-data/data/deadmines-reference.json' with {type:'json'};

test('species and type icons never masquerade as an exact creature portrait',()=>{
 const wolf=creatureVisual({entry:69}),boar=creatureVisual({entry:113}),boss=creatureVisual({entry:639});
 assert.notEqual(wolf.src,boar.src);assert.equal(wolf.kind,'species-icon');assert.match(wolf.label,/类型图标/);
 assert.equal(boss.kind,'type-icon');assert.match(boss.label,/类型图标/);
 assert.deepEqual(creatureVisual({modelId:604}),wolf);
 assert.equal(creatureVisual({entry:999999}).kind,'type-icon');
});
test('every playable outdoor and dungeon template has a local mapped asset',()=>{
 const ids=new Set([...Object.keys(nodes).flatMap(monsterIdsAt),...deadmines.encounters.flatMap(e=>e.sourceSpawns.flatMap(s=>s.templateChoices.map(t=>t.entry))),643]);
 for(const entry of ids){assert.ok(manifest.entries[entry],`missing template ${entry}`);assert.match(creatureVisual({entry}).src,/^\/creatures\/[^/]+\.jpg$/);}
});
test('checked-in original icon bytes match the resource manifest',async()=>{
 for(const asset of manifest.assets){
  const bytes=await readFile(new URL('../public/'+asset.path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  assert.equal(bytes.length,asset.bytes);assert.equal(bytes.readUInt16BE(0),0xffd8);
  assert.match(asset.url,/^https:\/\/wow\.zamimg\.com\//);
 }
});
