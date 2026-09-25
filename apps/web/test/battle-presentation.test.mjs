import test from 'node:test';
import assert from 'node:assert/strict';
import {inlineWorldBattle,opensBattleDialog} from '../lib/battle-presentation.js';

test('world encounters opt into the live combat stream, other pages retain their presentation',()=>{
 assert.equal(inlineWorldBattle('world',null),true);
 assert.equal(inlineWorldBattle('world',{id:'run'}),false);
 for(const tab of ['character','dungeon','raid','log','pvp'])assert.equal(inlineWorldBattle(tab,null),false);
});
test('world hunting and quest ambushes stay inline; explicit raid starts retain dialogs',()=>{
 for(const command of [{type:'hunt'},{type:'useQuestItem',id:7308}]){
  assert.equal(opensBattleDialog(command,true),false);
  assert.equal(opensBattleDialog(command,false),true);
 }
 for(const type of ['goldStart','raidStart'])assert.equal(opensBattleDialog({type},true),true);
 for(const type of ['travel','fly','equip','stop'])assert.equal(opensBattleDialog({type},true),false);
});
