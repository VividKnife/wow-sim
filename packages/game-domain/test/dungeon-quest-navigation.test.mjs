import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view,act} from '../src/rules/engine.js';
import {dungeonQuestPlan,dungeonQuestJournal} from '../src/rules/dungeon-quest-journal.js';
import {questNavigation} from '../src/rules/navigation.js';
import {questProgress,dungeonQuestIds} from '../src/rules/quests.js';
import {questLinks,endpointNodes} from '../src/rules/catalog.js';
import {addItem} from '../src/rules/character.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';
const setup=()=>{const s=createGame('任务导航',37,0);s.level=60;return s;};

test('dungeon journal follows the earliest unmet link and then the original giver',()=>{
 const s=setup();let plan=dungeonQuestPlan(s,166);
 assert.equal(plan.questId,65);assert.equal(plan.prerequisite,true);
 assert.equal(plan.navigation.to,'sentinel');assert.equal(plan.navigation.npcKey,'creature:234');
 s.completed[155]=1;plan=dungeonQuestPlan(s,166);
 assert.equal(plan.questId,166);assert.equal(plan.navigation.kind,'accept');
 s.location=plan.navigation.to;
 const data=view(s);assert.ok(data.interactions.find(n=>n.key===plan.navigation.npcKey).accepts.includes(166));
 assert.equal(dungeonQuestPlan(s,166).navigation.here,true);
});
test('active and completed prerequisite quests point to their receiver, without skipping progress',()=>{
 const s=setup();s.quests[65]={kills:{},event:false};
 const plan=dungeonQuestPlan(s,166);
 assert.equal(plan.questId,65);assert.equal(plan.navigation.kind,'turnin');
 assert.ok(endpointNodes(questLinks[65].ends[0]).includes(plan.navigation.to));
 s.location=plan.navigation.to;
 const npc=view(s).interactions.find(n=>n.key===plan.navigation.npcKey);
 assert.ok(npc.turnIns.includes(65));assert.equal(questProgress(s,166).canAccept,false);
});
test('condition-based alternative prerequisites choose the appropriate character branch',()=>{
 const s=setup();const plan=dungeonQuestPlan(s,7483);
 assert.equal(plan.questId,7482);assert.equal(plan.prerequisite,true);
 assert.equal(plan.navigation.to,'feathermoon');
 s.completed[7482]=1;assert.equal(dungeonQuestPlan(s,7483).questId,7483);
});
test('completed quest navigation resolves a specific NPC and changes to here after arrival',()=>{
 let s=setup();s.completed[155]=1;s.location='sentinel';s=act(s,{type:'accept',id:166},0);addItem(s,3637,1);s.location='goldshire';
 let nav=questNavigation(s,questProgress(s,166));assert.equal(nav.kind,'turnin');assert.equal(nav.here,false);
 s.location=nav.to;nav=questNavigation(s,questProgress(s,166));assert.equal(nav.here,true);
 assert.ok(view(s).interactions.find(n=>n.key===nav.npcKey).turnIns.includes(166));
 s.activity={type:'travel'};assert.equal(questNavigation(s,questProgress(s,166)).here,false);
});
test('dungeon turn-in remains local and journal projection preserves original task identity',()=>{
 const s=setup();s.location='deadmines';s.dungeon={id:'deadmines'};s.quests[166]={kills:{},event:false};addItem(s,3637,1);
 const nav=questNavigation(s,questProgress(s,166));assert.equal(nav.here,true);assert.equal(nav.to,'deadmines');
 const outside=setup(),journal=dungeonQuestJournal(outside);
 const row=journal.deadmines.find(q=>q.id===214);assert.equal(row.questId,65);assert.equal(row.name,'红色丝质面罩');assert.equal(row.targetName,'迪菲亚兄弟会');
 const snapshot=projectClientSnapshot(outside,{dungeonQuests:journal});assert.deepEqual(snapshot.view.dungeonQuests,journal);
});
test('locked and item-started tasks explain why no NPC route is offered; generic commodities are excluded',()=>{
 const s=setup();s.level=1;
 assert.equal(dungeonQuestPlan(s,168).navigation,null);assert.match(dungeonQuestPlan(s,168).reason,/等级|级/);
 s.level=60;assert.match(dungeonQuestPlan(s,373).reason,/物品/);assert.equal(dungeonQuestPlan(s,373).navigation,null);
 s.completed[168]=1;assert.equal(dungeonQuestPlan(s,168).status,'completed');
 assert.equal(dungeonQuestPlan({...s,raceId:2},166),null);
 assert.ok(!dungeonQuestIds('deadmines').includes(8511));
});
