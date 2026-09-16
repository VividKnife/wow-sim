import test from 'node:test';
import assert from 'node:assert/strict';
import {newCharacter} from '../lib/game/character.js';
import {initializeMetrics,recordMetric,finishCombat,meterRows} from '../lib/game/combat-metrics.js';

const state=()=>({...newCharacter('同名'),bag:[],clock:1000,party:[{...newCharacter('同名'),id:'mage-2'}],logs:[],combat:{startedAt:1000,dungeon:true,runId:'run-1'},dungeon:{runId:'run-1'}});
test('actor and spell identities survive names, periodic hits and truncated logs',()=>{
 const s=state();initializeMetrics(s);
 recordMetric(s,s,{hp:80},100,{spellId:133,label:'火球术',critical:true});
 recordMetric(s,s,{hp:50},20,{spellId:133,label:'火球术（持续）',periodic:true});
 recordMetric(s,s.party[0],{hp:200},40,{});
 s.logs=[];s.clock=3000;
 const rows=meterRows(s.combat,s.clock);
 assert.equal(rows.length,2);assert.equal(rows[0].damage,100);assert.equal(rows[0].dps,50);
 assert.equal(rows[0].hits,2);assert.equal(rows[0].crits,1);assert.equal(rows[0].periodicDamage,20);
 assert.equal(rows[0].spells.length,1);assert.equal(rows[0].spells[0].spellId,133);
 assert.equal(rows[1].actorId,'mage-2');assert.equal(rows[1].spells[0].spellId,0);
 assert.equal(rows[0].share,100/140);
});
test('effective healing is separate from damage and overhealing is capped',()=>{
 const s=state();initializeMetrics(s);
 recordMetric(s,s,{hp:90,maxHp:100},40,{kind:'healing',spellId:2050});
 recordMetric(s,s,{hp:100,maxHp:100},15,{kind:'healing',spellId:2050,effective:true,critical:true});
 const row=meterRows(s.combat,2000)[0];
 assert.equal(row.damage,0);assert.equal(row.healing,25);assert.equal(row.dps,0);
 assert.equal(row.healHits,2);assert.equal(row.healCrits,1);
});
test('finalization freezes encounter duration and accumulates each dungeon segment once',()=>{
 const s=state();initializeMetrics(s);recordMetric(s,s,{hp:1000},100,{spellId:133});s.clock=3000;
 const battle=finishCombat(s);assert.equal(s.combat,null);assert.equal(s.lastCombat,battle);
 assert.equal(battle.endedAt,3000);assert.equal(meterRows(battle,90000)[0].dps,50);
 assert.deepEqual(meterRows(battle,90000),meterRows(battle,3000));
 s.combat=battle;s.clock=4000;finishCombat(s);
 assert.equal(s.dungeon.metrics.durationMs,2000);assert.equal(meterRows(s.dungeon.metrics,s.clock)[0].damage,100);
 s.clock=20000;s.combat={startedAt:20000,dungeon:true,runId:'run-1'};initializeMetrics(s);
 recordMetric(s,s,{hp:1000},200,{spellId:133});s.clock=24000;finishCombat(s);
 const aggregate=meterRows(s.dungeon.metrics,90000)[0];
 assert.equal(s.dungeon.metrics.durationMs,6000);assert.equal(aggregate.damage,300);assert.equal(aggregate.dps,50);
});
test('zero duration, legacy battles and foreign dungeon runs never invent precise statistics',()=>{
 const s=state();initializeMetrics(s);recordMetric(s,s,{hp:100},50,{});
 assert.equal(meterRows(s.combat,s.clock)[0].dps,0);
 assert.deepEqual(meterRows({damage:{'旧名字 · 技能':100}},10000),[]);
 s.dungeon.runId='different-run';finishCombat(s);assert.equal(s.dungeon.metrics,undefined);
});
test('restored legacy battles report only their observed time and preserve partial dungeon status',()=>{
 const s=state();s.clock=9000;initializeMetrics(s);
 recordMetric(s,s,{hp:500},100,{spellId:133});s.clock=11000;
 assert.equal(s.combat.metrics.startedAt,9000);
 assert.equal(meterRows(s.combat,s.clock)[0].dps,50);
 assert.equal(meterRows(s.combat,s.clock)[0].partial,true);
 finishCombat(s);
 assert.equal(s.dungeon.metrics.durationMs,2000);
 assert.equal(meterRows(s.dungeon.metrics,60000)[0].partial,true);
 s.combat={startedAt:11000,dungeon:true,runId:'run-1'};initializeMetrics(s);s.clock=13000;finishCombat(s);
 assert.equal(s.dungeon.metrics.partial,true);
 assert.equal(meterRows(s.dungeon.metrics,60000)[0].dps,25);
});
test('battle end cancels casts and projectiles but preserves enemy persistent ground hazards',()=>{
 const s=state();s.combat.id='encounter-7';s.combat.projectiles=[{id:'friendly'},{id:'hostile'}];
 s.cast={spell:133};s.party[0].cast={spell:116};s.combat.enemies=[{id:'enemy',cast:{spell:133}}];
 s.groundEffects=[{side:'friendly',spell:2120},{caster:'enemy',spell:900}];
 s.logs=Array.from({length:140},(_,i)=>({id:i+1}));s.logSequence=140;
 const battle=finishCombat(s);
 assert.deepEqual(battle.projectiles,[]);assert.equal(s.cast,null);assert.equal(s.party[0].cast,null);
 assert.equal(battle.enemies[0].cast,null);assert.deepEqual(s.groundEffects,[{caster:'enemy',spell:900}]);
 assert.equal(s.logs.length,140);assert.equal(s.logs.at(-1).kind,'combat-end');
 assert.equal(s.logs.at(-1).encounterId,'encounter-7');assert.equal(s.logs.at(-1).id,141);
 s.combat=battle;finishCombat(s);assert.equal(s.logSequence,141);
});
test('last encounter actor snapshots keep final positions and health after later recovery',()=>{
 const s=state();Object.assign(s,{hp:30,mana:10,currentMaxHp:100,currentMaxMana:200,position:12,positionY:4,auras:[{type:33,until:5000}]});
 Object.assign(s.party[0],{hp:40,maxHp:120,position:7,positionY:-3});
 const battle=finishCombat(s);
 s.hp=100;s.position=0;s.auras[0].until=9000;s.party[0].name='新名字';
 assert.equal(battle.actorsSnapshot[0].hp,30);assert.equal(battle.actorsSnapshot[0].maxHp,100);
 assert.equal(battle.actorsSnapshot[0].maxMana,200);assert.equal(battle.actorsSnapshot[0].position,12);
 assert.equal(battle.actorsSnapshot[0].positionY,4);assert.equal(battle.actorsSnapshot[0].auras[0].until,5000);
 assert.equal(battle.actorsSnapshot[1].name,'同名');assert.equal(battle.actorsSnapshot[1].maxHp,120);
 assert.equal(battle.actorsSnapshot[0].cast,null);
});
