import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {stats} from '../../../packages/game-domain/src/rules/character.js';
import {combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {creditKill,questProgress,turnIn} from '../../../packages/game-domain/src/rules/quests.js';
import {beginStockadesQuestEvent,stockadesQuestTick,cancelStockadesQuestEvent,stockadesQuestEventView} from '../../../packages/game-domain/src/rules/stockades-quests.js';

function ready(){const s=createGame('袭击测试',437,0);s.level=40;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.location='keep';s.quests[434]={kills:{},event:false,acceptedAt:0,expiresAt:0};return s;}
function dialogue(s){while(s.stockadesQuestEvent?.stage!=='combat'){s.clock=s.activity.endsAt;stockadesQuestTick(s);}return s;}
function win(s){for(const e of s.combat.enemies)e.hp=0;s.clock+=100;combatTick(s);stockadesQuestTick(s);return s;}

test('Attack requires an active quest, the garden, and no competing activity',()=>{
 const s=ready();s.location='oldtown';assert.throws(()=>beginStockadesQuestEvent(s,434));s.location='keep';s.activity={type:'travel'};assert.throws(()=>beginStockadesQuestEvent(s,434));s.activity={type:'idle'};delete s.quests[434];assert.throws(()=>beginStockadesQuestEvent(s,434));assert.throws(()=>beginStockadesQuestEvent(ready(),2746));
});
test('Attack persists a staged conversation and starts real combat before credit',()=>{
 const s=ready();beginStockadesQuestEvent(s,434);assert.equal(s.combat,null);assert.equal(s.quests[434].event,false);
 const restored=JSON.parse(JSON.stringify(s));dialogue(s);dialogue(restored);assert.deepEqual(restored,s);assert.deepEqual(s.combat.enemies.map(e=>e.entry),[1754,1755]);assert.equal(questProgress(s,434).complete,false);
 win(s);assert.equal(s.stockadesQuestEvent,undefined);assert.equal(s.quests[434].event,true);assert.equal(questProgress(s,434).complete,true);assert.equal(s.completed[434],undefined);assert.throws(()=>beginStockadesQuestEvent(s,434));
 s.location=questProgress(s,434).endLocations[0];turnIn(s,434);const xp=s.xp,money=s.money;assert.throws(()=>turnIn(s,434));assert.equal(s.xp,xp);assert.equal(s.money,money);assert.equal(s.completed[434],1);
});
test('unrelated kills cannot satisfy the Attack objective',()=>{const s=ready();creditKill(s,1754);creditKill(s,1755);assert.deepEqual(s.quests[434].kills,{});});
test('cancel and death clear partial progress and permit a new attempt',()=>{
 for(const failure of ['cancel','death','abandon','leave']){const s=ready();beginStockadesQuestEvent(s,434);dialogue(s);const attempt=s.stockadesQuestEvent.attempt;
  s.combat.enemies[0].hp=0;combatTick(s);assert.equal(s.quests[434].kills[1754],1);
  if(failure==='cancel')cancelStockadesQuestEvent(s);else if(failure==='death')s.hp=0;else if(failure==='abandon')delete s.quests[434];else s.location='oldtown';
  stockadesQuestTick(s);assert.ok(s.stockadesQuestEvent);s.combat=null;stockadesQuestTick(s);assert.equal(s.stockadesQuestEvent,undefined);assert.equal(s.stockadesQuestEventLast.outcome,'failed');
  if(!s.quests[434])s.quests[434]={kills:{},event:false};assert.equal(s.quests[434].event,false);assert.deepEqual(s.quests[434].kills,{});s.hp=stats(s).maxHp;s.activity={type:'idle'};s.location='keep';beginStockadesQuestEvent(s,434);assert.notEqual(s.stockadesQuestEvent.attempt,attempt);
 }
});
test('a fled or unrelated battle cannot grant event completion',()=>{
 const s=ready();beginStockadesQuestEvent(s,434);dialogue(s);s.lastCombat={...s.combat,enemies:s.combat.enemies.map(e=>({...e,hp:0,removed:true}))};s.combat=null;stockadesQuestTick(s);assert.equal(s.quests[434].event,false);assert.equal(stockadesQuestEventView(s).last.outcome,'failed');
});
test('engine schedules persisted dialogue identically across split advances and prevents departure',()=>{
 const s=act(ready(),{type:'stockadesQuestStart',questId:434},0);
 assert.throws(()=>act(s,{type:'travel',to:'oldtown'},0),/袭击|事件/);
 const whole=advance(s,24000).state;let split=JSON.parse(JSON.stringify(s));for(let time=1000;time<=24000;time+=1000)split=advance(split,time).state;
 assert.deepEqual(split,whole);assert.ok(whole.combat);assert.equal(whole.stockadesQuestEvent.stage,'combat');
 const cancelled=act(whole,{type:'stop'},whole.wallAt);assert.equal(cancelled.stockadesQuestEvent.cancelled,true);assert.equal(cancelled.quests[434].event,false);
});
