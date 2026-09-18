import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view,act} from '../../../packages/game-domain/src/rules/engine.js';
import {log} from '../../../packages/game-domain/src/rules/character.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {finishCombat} from '../../../packages/game-domain/src/rules/combat-metrics.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
const game=()=>createGame('旅程',93,0);
function battle(s){startCombat(s,[299]);s.combat.enemies[0].hp=0;s.combat.enemies[0].dead=true;s.clock+=1000;return finishCombat(s);}
test('core events survive noisy combat logs',()=>{
 const s=game();log(s,'抵达 北郡','travel');log(s,'完成任务：试炼','quest');
 for(let i=0;i<200;i++)log(s,'伤害','damage');
 assert.deepEqual(s.journey.map(row=>row.kind),['travel','quest']);assert.equal(s.logs.length,140);
});
test('one hunt session groups encounters and new sessions remain separate',()=>{
 const s=game();s.activity={type:'hunt',target:299};battle(s);s.clock+=5000;battle(s);
 assert.equal(s.journey.length,1);assert.equal(s.journey[0].kills,2);assert.equal(s.journey[0].endedAt,7000);
 s.activity={type:'hunt',target:299};battle(s);assert.equal(s.journey.length,2);
});
test('archived battles retain actors, location and presentation independently of later fights',()=>{
 const s=game();const first=battle(s),old=structuredClone(s.battleHistory[0]);s.hp=1;s.location='goldshire';battle(s);
 assert.deepEqual(s.battleHistory[0],old);assert.notEqual(s.battleHistory[0].battle,first);
 const snapshot=projectClientSnapshot(s,view(s));const archived=snapshot.player.battleHistory[0];
 assert.equal(archived.battle.id,first.id);assert.ok(archived.view.units[s.id]);assert.ok(archived.location.name);assert.ok(archived.battle.actorsSnapshot.length);
 assert.equal(archived.battle.damage,undefined);
});
test('battle retention is bounded while hunt totals retain every kill',()=>{
 const s=game();s.activity={type:'hunt',target:299};for(let i=0;i<25;i++)battle(s);
 assert.equal(s.battleHistory.length,20);assert.equal(s.journey[0].battleIds.length,20);assert.equal(s.journey[0].kills,25);
});
