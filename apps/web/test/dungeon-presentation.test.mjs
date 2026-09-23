import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {dungeonJournal} from '../../../packages/game-domain/src/rules/dungeon-journal.js';
import {contentPack} from '../../../packages/game-domain/src/rules/content-packs.js';
import {clientContent,itemView} from '../../../packages/game-domain/src/rules/client-content.js';
import {battleModel} from '../../../packages/game-data/battle-models.js';
import {dungeonDefinitions} from '../../../packages/game-domain/src/rules/dungeon-registry.js';
import {dungeonMap} from '../../../packages/game-domain/src/rules/dungeon-map.js';
import {creatures,nodes,monsterIdsAt} from '../../../packages/game-domain/src/rules/catalog.js';
import {mapRegions} from '../lib/world-map.js';
const local=path=>path&&existsSync(new URL('../public'+path,import.meta.url));

test('every journal card has local dungeon-specific artwork and every playable map has original floor images',()=>{
 for(const dungeon of dungeonJournal){
  assert.ok(local(dungeon.background),dungeon.id);
  if(!dungeon.playable)continue;
  assert.ok(dungeon.atlas.floors.length);
  for(const f of dungeon.atlas.floors)assert.ok(local(f.image),`${dungeon.id}:${f.id}`);
  for(const [node,p] of Object.entries(dungeon.atlas.points))assert.ok(p[0]>=0&&p[0]<=1002&&p[1]>=0&&p[1]<=668,`${dungeon.id}:${node}`);
 }
});
test('all outdoor regions with world nodes use local original maps',()=>{
 for(const region of new Set(Object.values(nodes).filter(n=>n.kind!=='dungeon').map(n=>n.region))){
  const map=mapRegions[region==='北郡'?'艾尔文':region];
  if(map)assert.ok(local(map.image),region);
 }
});
test('dungeon coordinates use the map orientation and the final Uldaman chamber floor',()=>{
 const rfc=dungeonMap('ragefire-chasm');assert.ok(rfc.points.entrance[0]>600&&rfc.points.entrance[0]<650);assert.ok(rfc.points.entrance[1]<70);
 const boss=dungeonDefinitions.uldaman.reference.encounters.find(e=>e.creatureTemplateIds.includes(2748));assert.equal(dungeonMap('uldaman').floorByNode[boss.id],2);
 const arugal=dungeonDefinitions['shadowfang-keep'].reference.encounters.find(e=>e.creatureTemplateIds.includes(4275));assert.equal(dungeonMap('shadowfang-keep').floorByNode[arugal.id],6);
});
test('combat enemy models resolve to actual GLBs and local portraits',()=>{
 const entries=new Set(Object.keys(nodes).flatMap(id=>monsterIdsAt(id)));
 for(const entry of [7915,6575,7076,10120,7309,7077])entries.add(entry);
 for(const d of Object.values(dungeonDefinitions))for(const e of d.reference.encounters)for(const id of e.creatureTemplateIds||[])entries.add(id);
 for(const entry of entries){const c=creatures[entry];if(!c)continue;const model=battleModel({entry,ModelId1:c.ModelId1});assert.ok(model&&local(model.src),`${entry}: model`);assert.ok(local(model.portrait),`${entry}: portrait`);}
});
test('map content is loaded independently from bootstrap and invalid map ids fail',()=>{
 const catalog=clientContent(),core=contentPack(catalog,new URLSearchParams());
 const d=core.dungeonJournal.find(d=>d.id==='gnomeregan');assert.equal(d.atlas,undefined);assert.equal(d.atlasPack,'atlas:gnomeregan');
 assert.equal(contentPack(catalog,new URLSearchParams({pack:d.atlasPack})).atlas.floors.length,4);
 assert.throws(()=>contentPack(catalog,new URLSearchParams({pack:'atlas:unknown'})),error=>error.status===404);
});
test('equipment exposes source binding, DPS and on-equip bonuses consistently',()=>{
 const item=itemView(5191);assert.equal(item.binding,'拾取后绑定');assert.equal(item.itemLevel,24);assert.equal(item.dps,15.5);assert.ok(item.effects.some(e=>e.id===9141&&e.text.includes('12')));
 const journalItem=dungeonJournal.flatMap(d=>d.bosses.flatMap(b=>b.loot)).find(i=>i.id===5191);assert.deepEqual(journalItem.effects,item.effects);assert.equal(journalItem.dps,item.dps);
});
