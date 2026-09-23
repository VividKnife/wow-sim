import test from 'node:test';
import {dungeonDefinitions} from '../../../packages/game-domain/src/rules/dungeon-registry.js';
import assert from 'node:assert/strict';
import {clientContent} from '../../../packages/game-domain/src/rules/client-content.js';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';

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
});
