import {build} from 'esbuild';
import {creatureVisual as resolveCreatureVisual} from '../../../packages/game-data/creature-visuals.js';
import world from '../../../packages/game-data/data/world-visuals.json' with {type:'json'};
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
test('every playable outdoor and dungeon template has a local portrait or labelled type fallback',()=>{
 const ids=new Set([...Object.keys(nodes).flatMap(monsterIdsAt),...deadmines.encounters.flatMap(e=>e.sourceSpawns.flatMap(s=>s.templateChoices.map(t=>t.entry))),643]);
 for(const entry of ids){const visual=creatureVisual({entry});assert.match(visual.src,/^\/creatures\//,`missing template ${entry}`);if(visual.kind==='type-icon')assert.match(visual.label,/类型图标/);}
});
test('placed NPCs have portraits and original service roles retain model textures',()=>{
 for(const entry of [...Object.keys(creatureLocations).filter(id=>creatures[id]),...Object.values(serviceModels),467]){
  assert.ok(creatureVisual({entry}).src,`missing NPC ${entry}`);if(manifest.entries[entry])assert.equal(creatureVisual({entry}).kind,'npc-model-render');
 }
});
test('checked-in original model bytes match the resource manifest',async()=>{
 for(const asset of manifest.assets){
  const bytes=await readFile(new URL('../public/'+asset.path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
});

async function browserVisuals(base){
 const result=await build({
  entryPoints:[new URL('../lib/creature-visuals.js',import.meta.url).pathname],
  bundle:true,write:false,platform:'browser',format:'esm',logLevel:'silent',
  define:{__PUBLIC_ASSET_BASE__:JSON.stringify(base)},
 });
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

for(const base of ['', 'https://cdn.test/public/version'])test(`creature portraits resolve runtime paths in ${base?'R2':'bundled'} builds`,async()=>{
 const {creatureVisual}=await browserVisuals(base);
 // The four NPCs reported missing in Valley of Trials.
 for(const [entry,display] of [[3287,2025],[11378,12089],[3145,1875],[3159,1883]]){
  assert.equal(creatureVisual({entry}).src,`${base}/creatures/portraits/classic-display-${display}.webp`);
 }
 // Shared battle/raid model portraits also assemble their paths at runtime.
 for(const entry of [40,11502]){
  const original=resolveCreatureVisual({entry});
  assert.ok(original.model);
  assert.ok(original.src?.startsWith('/creatures/'));
  assert.equal(creatureVisual({entry}).src,base+original.src);
 }
 const fallback=Object.keys(world.entries).map(entry=>({entry:Number(entry)})).find(unit=>resolveCreatureVisual(unit).kind==='type-icon');
 assert.ok(fallback,'fixture must exercise a species icon fallback');
 assert.equal(creatureVisual(fallback).src,base+resolveCreatureVisual(fallback).src);
 assert.equal(creatureVisual({entry:-1}).src,null);
});
