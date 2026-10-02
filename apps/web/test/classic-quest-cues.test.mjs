import test from 'node:test';
import assert from 'node:assert/strict';
import {hasNearbyQuestCue,hasOutdoorQuestTarget,isYellowQuest} from '../lib/classic-quest-cues.js';

test('nearby cue only marks yellow available quests and completed local turn-ins',()=>{
 const npc={accepts:[1],turnIns:[]};
 const quest={id:1,level:6,canAccept:true};
 assert.equal(isYellowQuest(6,10),true);
 assert.equal(hasNearbyQuestCue([npc],[quest],10),true);
 assert.equal(hasNearbyQuestCue([npc],[{...quest,level:5}],10),false);
 assert.equal(hasNearbyQuestCue([npc],[{...quest,level:13}],10),false);
 assert.equal(hasNearbyQuestCue([npc],[{...quest,canAccept:false}],10),false);
 assert.equal(hasNearbyQuestCue([{accepts:[],turnIns:[2]}],[{id:2,canTurnIn:true,complete:false}],10),false);
 assert.equal(hasNearbyQuestCue([{accepts:[],turnIns:[2]}],[{id:2,canTurnIn:true,complete:true}],10),true);
 assert.equal(hasNearbyQuestCue([], [{...quest}],10),false);
});

test('outdoor cue follows remaining local monster objectives',()=>{
 assert.equal(hasOutdoorQuestTarget([{id:1,quest:false},{id:2,quest:true}]),true);
 assert.equal(hasOutdoorQuestTarget([{id:1,quest:false}]),false);
});
