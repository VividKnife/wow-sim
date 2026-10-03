import test from 'node:test';
import {dungeonDefinitions} from '../../../packages/game-domain/src/rules/dungeon-registry.js';
import assert from 'node:assert/strict';
import {clientContent} from '../../../packages/game-domain/src/rules/client-content.js';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {contentPack} from '../../../packages/game-domain/src/rules/content-packs.js';

test('versioned content carries a browsable journal with display-safe loot and playable states',()=>{
 const journal=clientContent().dungeonJournal;assert.ok(journal?.length>=20);
 assert.deepEqual(journal.filter(d=>d.playable).map(d=>d.id).sort(),Object.keys(dungeonDefinitions).sort());
 const stock=journal.find(d=>d.id==='stockades');assert.equal(stock.bosses.length,6);
 for(const dungeon of journal)for(const boss of dungeon.bosses)for(const item of boss.loot){assert.equal(typeof item.source,'string');assert.equal(typeof item.shared,'boolean');assert.ok(item.damage===null||item.damage.length===2&&item.damage.every(Number.isFinite));if(item.damage)assert.ok(item.speed>=1000);}
 const bruegal=stock.bosses.find(b=>b.id===1720);assert.ok(bruegal.loot.some(i=>!i.shared&&i.quality===3));
 assert.ok(stock.bosses.find(b=>b.id===1696).loot.find(i=>i.id===1206).shared,'gems shared across dungeons are not boss-specific rewards');
});
test('live snapshot includes all playable dungeon views but not the static journal',()=>{
 const s=createGame('手册',5,0),snapshot=projectClientSnapshot(s,view(s));
 assert.deepEqual(Object.keys(snapshot.view.dungeons).sort(),Object.keys(dungeonDefinitions).sort());
 assert.equal(snapshot.view.dungeonJournal,undefined);
 for(const entry of Object.values(snapshot.view.dungeons)){
  assert.equal(entry.map,undefined);assert.equal(entry.route,undefined);
  assert.equal(typeof entry.canEnter,'boolean');assert.equal(typeof entry.progress,'number');
 }
 assert.ok(JSON.stringify(snapshot.view.dungeons).length<50_000,'entry summaries must not contain maps and encounter routes');
});
test('team dungeon journal includes browsable bosses, loot, original maps and relevant quests',()=>{
 const catalog=clientContent(),core=contentPack(catalog,new URLSearchParams({pack:'core'}));
 assert.deepEqual(core.raidJournal.map(raid=>raid.id),['molten-core','onyxias-lair']);
 const quests=view(createGame('团队手册',5,0)).dungeonQuests;
 for(const raid of core.raidJournal){
  assert.equal(raid.groupSize,40);
  assert.ok(raid.background&&raid.bosses.length&&quests[raid.id]?.length);
  assert.equal(raid.atlas,undefined);
  const atlas=contentPack(catalog,new URLSearchParams({pack:raid.atlasPack})).atlas;
  assert.ok(atlas.floors.every(floor=>floor.image));
  for(const boss of raid.bosses){
   assert.ok(atlas.bossLocations[boss.id]);
   assert.equal(boss.loot,undefined);
   const loot=contentPack(catalog,new URLSearchParams({pack:boss.lootPack})).loot;
   assert.ok(loot.length&&loot.every(item=>item.name&&item.source==='首领掉落'));
  }
 }
});
