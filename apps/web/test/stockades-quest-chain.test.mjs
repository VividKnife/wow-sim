import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {quests,questLinks,endpointNodes,items,monsterIdsAt} from '../../../packages/game-domain/src/rules/catalog.js';
import {acceptQuest,turnIn,questProgress,questAvailable,gatherables,gather} from '../../../packages/game-domain/src/rules/quests.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {collectLoot} from '../../../packages/game-domain/src/rules/loot.js';
import {stats,countItem} from '../../../packages/game-domain/src/rules/character.js';
import {stockadesQuestTick} from '../../../packages/game-domain/src/rules/stockades-quests.js';
import {recruitForTest} from './support/party-fixture.mjs';

function ready(){const s=createGame('监狱任务链',337,0);s.level=35;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;return s;}
function travel(s,to){if(s.location===to)return s;s=act(s,{type:'travel',to},s.wallAt);return advance(s,s.wallAt+s.activity.endsAt-s.clock).state;}
function endpoint(s,id,kind){const locations=questLinks[id][kind].flatMap(endpointNodes);assert.ok(locations.length,`quest ${id} ${kind} is reachable`);return travel(s,locations[0]);}
function accept(s,id){s=endpoint(s,id,'starts');assert.equal(questProgress(s,id).canAccept,true,`accept ${id}`);acceptQuest(s,id);return s;}
function deliver(s,id){s=endpoint(s,id,'ends');assert.equal(questProgress(s,id).complete,true,`complete ${id}`);turnIn(s,id,questProgress(s,id).choices[0]?.id);return s;}
// Controlled enemy damage isolates content completeness. Combat settlement,
// objective credit, source loot rolls, gathering, travel and rewards are real.
function victory(s,entries){
 startCombat(s,entries);for(const enemy of s.combat.enemies)enemy.hp=0;combatTick(s);stockadesQuestTick(s);
 s.bag=s.bag.filter(i=>items[i.id].class===12||[4306,2933].includes(i.id));collectLoot(s);s.pending=[];s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;return s;
}

test('all six Stockades dungeon quests have reachable prerequisites, real objectives and rewards',()=>{
 let s=ready();s=accept(s,303);assert.equal(questAvailable(s,quests[378]),false);
 for(const [id,count]of [[1051,10],[1053,5],[1052,5],[1054,5]]){assert.ok(monsterIdsAt(s.location).includes(id));for(let n=0;n<count;n++)victory(s,[id]);}
 s=deliver(s,303);s=accept(s,378);for(const id of [377,386,387,388])s=accept(s,id);
 // The sixth quest follows the letter recovered from VanCleef.
 s=travel(s,'deadmines');victory(s,[639]);assert.equal(countItem(s,2874),1);acceptQuest(s,373);s=deliver(s,373);s=accept(s,389);s=deliver(s,389);s=accept(s,391);
 s=travel(s,'stockades');for(const id of [1716,1666,1696,1663])victory(s,[id]);
 for(const [id,count]of [[1706,10],[1711,8],[1715,8]])for(let n=0;n<count;n++)victory(s,[id]);
 for(let n=0;!questProgress(s,388).complete&&n<100;n++)victory(s,[1706]);
 for(const id of [377,378,386,387,388,391]){s=deliver(s,id);assert.equal(s.completed[id],1);}
});

test('Unsent Letter through the king consumes source items, gathers apples and grants Seal of Wrynn once',()=>{
 let s=ready();s=travel(s,'deadmines');victory(s,[639]);assert.equal(countItem(s,2874),1);acceptQuest(s,373);s=deliver(s,373);assert.equal(countItem(s,2874),0);
 for(const id of [389]){s=accept(s,id);s=deliver(s,id);}s=accept(s,391);s=travel(s,'stockades');victory(s,[1716]);s=deliver(s,391);
 for(const id of [392,393,350,2745]){s=accept(s,id);s=deliver(s,id);}
 s=accept(s,2746);assert.equal(questProgress(s,2746).complete,false);s=travel(s,'mirror');const apples=gatherables(s).find(o=>o.items.some(i=>i.id===8683));assert.ok(apples,'Clara apple basket must be gatherable');gather(s,apples.id);assert.equal(countItem(s,8683),2);
 s=travel(s,'dunmodr');for(let n=0;countItem(s,4306)<3&&n<100;n++)victory(s,[1051]);assert.ok(countItem(s,4306)>=3);s=deliver(s,2746);assert.equal(countItem(s,8683),0);
 s=accept(s,434);s=act(s,{type:'stockadesQuestStart',questId:434},s.wallAt);while(!s.combat)s=advance(s,s.wallAt+s.activity.endsAt-s.clock).state;
 for(const e of s.combat.enemies)e.hp=0;combatTick(s);stockadesQuestTick(s);s=deliver(s,434);
 for(const id of [394,395,396]){s=accept(s,id);s=deliver(s,id);}
 assert.equal(countItem(s,2956),0);assert.equal(countItem(s,2933),1);assert.equal(s.completed[396],1);const before=s.money;assert.throws(()=>turnIn(s,396));assert.equal(s.money,before);assert.equal(countItem(s,2933),1);
});

test('a level 35 party completes the Attack using autonomous combat without fixture damage',()=>{
 let s=ready();s.location='keep';s.quests[434]={kills:{},event:false,acceptedAt:0,expiresAt:0};
 for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},s.wallAt);
 s=act(s,{type:'stockadesQuestStart',questId:434},s.wallAt);
 for(let n=0;n<180&&s.stockadesQuestEvent;n++)s=advance(s,s.wallAt+1000).state;
 assert.equal(s.stockadesQuestEventLast.outcome,'complete');assert.equal(questProgress(s,434).complete,true);assert.ok(s.lastCombat.enemies.every(e=>e.hp<=0&&e.rewarded));assert.ok(Object.values(s.lastCombat.damage).reduce((sum,value)=>sum+value,0)>1000);
});
