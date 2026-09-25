import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {items,quests,nameOf} from '../src/rules/catalog.js';
import {itemDetails} from '../src/rules/item-details.js';
import {itemSources,questProgress} from '../src/rules/quests.js';

const chinese=/[\u3400-\u9fff]/;

test('all playable quest titles and reachable item names have Chinese text',()=>{
 const state=createGame('译文验证',1,0);
 for(const quest of Object.values(quests))assert.match(nameOf('quests',quest.entry),chinese,`quest ${quest.entry}`);
 for(const quest of Object.values(quests)){
  const presentation=questProgress(state,quest.entry)!;
  for(const field of ['description','details','giver'] as const)if(presentation[field])assert.match(presentation[field],chinese,`quest ${quest.entry} ${field}`);
  for(const objective of presentation.objectives)assert.match(objective.name,chinese,`quest ${quest.entry} objective`);
 }
 for(const item of Object.values(items)){
  assert.match(nameOf('items',item.entry),chinese,`item ${item.entry}`);
  if(itemSources(item.entry).length)assert.doesNotMatch(nameOf('items',item.entry),/^物品 \d+$/,`reachable item ${item.entry}`);
 }
});

test('quest and item presentation never falls back to English source prose',()=>{
 const state=createGame('译文验证',1,0);
 for(const id of [26,247,960]){
  const quest=questProgress(state,id)!;
  assert.match(quest.description,chinese,`quest ${id} objective`);
  assert.match(quest.details,chinese,`quest ${id} details`);
  assert.doesNotMatch(quest.description,/\$[BNCR]/);
  assert.doesNotMatch(quest.details,/\$[BNCR]/);
 }
 assert.match(questProgress(state,254)!.details,/棺材/);
 assert.doesNotMatch(questProgress(state,1271)!.details,/<name>|\$N/);
 assert.doesNotMatch(questProgress(state,49)!.details,/Amber is the hue|\$b/);
 assert.doesNotMatch(questProgress(state,166)!.description,/Level/);
 assert.doesNotMatch(questProgress(state,579)!.description,/Requirements/);
 assert.match(itemDetails(957).flavor!,chinese);
 assert.equal(nameOf('items',907426),'附魔羊皮纸：附魔 胸甲 - 初级吸收');
 for(const item of Object.values(items))if(itemDetails(item.entry).flavor)assert.match(itemDetails(item.entry).flavor!,chinese,`item ${item.entry} flavor`);
});
