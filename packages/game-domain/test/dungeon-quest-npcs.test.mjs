import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act} from '../src/rules/engine.js';
import {quests,questLinks,endpointNodes} from '../src/rules/catalog.js';
import {addItem} from '../src/rules/character.js';
import {visibleQuestIds,questProgress,questAvailable,atEndpoint} from '../src/rules/quests.js';
import {localInteractions} from '../src/rules/interactions.js';
import {questNavigation} from '../src/rules/navigation.js';
import {dungeonDefinitions} from '../src/rules/dungeon-registry.js';

function character(dungeon='deadmines'){
 const s=createGame('副本任务',37,0);s.level=60;s.location=dungeon;s.dungeon={id:dungeon};return s;
}
const people=s=>localInteractions(s,visibleQuestIds(s).map(id=>questProgress(s,id)));
const giver=(s,id,field)=>people(s).find(n=>n[field].includes(id));

test('dungeon NPCs accept and reward quests through authoritative commands',()=>{
 let s=character();s.completed[155]=1;
 assert.ok(giver(s,166,'accepts'));
 assert.ok(giver(s,168,'accepts'),'dungeon-category quests include objectives outside the instance');
 assert.equal(giver(s,166,'accepts').entry,questLinks[166].starts[0].id);
 s=act(s,{type:'accept',id:166},0);
 assert.ok(giver(s,166,'turnIns'));
 assert.throws(()=>act(s,{type:'turnin',id:166,choice:6087},0),/任务未完成/);
 addItem(s,3637,1);
 assert.equal(questNavigation(s,questProgress(s,166)).here,true);
 s=act(s,{type:'turnin',id:166,choice:6087},0);
 assert.equal(s.completed[166],1);
 assert.ok(s.bag.some(i=>i.id===6087));
 assert.equal(giver(s,166,'turnIns'),undefined);
});

test('actual outdoor endpoints remain usable and entry alone does not summon NPCs',()=>{
 let s=character();s.completed[155]=1;delete s.dungeon;
 assert.equal(giver(s,166,'accepts'),undefined);
 assert.throws(()=>act(s,{type:'accept',id:166},0),/当前地点/);
 s.location=endpointNodes(questLinks[166].starts[0])[0];
 assert.ok(giver(s,166,'accepts'));
 s=act(s,{type:'accept',id:166},0);addItem(s,3637,1);
 s.location=endpointNodes(questLinks[166].ends[0])[0];
 s=act(s,{type:'turnin',id:166,choice:6087},0);
 assert.equal(s.completed[166],1);
});

test('remote NPCs retain prerequisite and level gates and expose only related quests',()=>{
 const s=character();
 assert.equal(giver(s,166,'accepts'),undefined);
 s.completed[155]=1;s.level=13;
 assert.equal(giver(s,166,'accepts'),undefined);
 s.level=60;
 assert.ok(giver(s,166,'accepts'));
 assert.equal(giver(s,377,'accepts'),undefined);
 assert.equal(giver(s,62,'accepts'),undefined);
 s.location='stockades';s.dungeon.id='stockades';
 for(const id of [377,386,387,388])assert.ok(giver(s,id,'accepts'),String(id));
 assert.equal(giver(s,166,'accepts'),undefined);
 assert.throws(()=>act(s,{type:'accept',id:166},0),/当前地点/);
});

test('item-started dungeon quests still need their starter and gain remote receivers',()=>{
 let s=character();
 assert.equal(giver(s,373,'accepts'),undefined);
 const item=questLinks[373].starts.find(e=>e.type==='item').id;
 addItem(s,item,1);
 assert.ok(giver(s,373,'accepts'));
 s=act(s,{type:'accept',id:373},0);
 assert.ok(giver(s,373,'turnIns'));
 s=act(s,{type:'turnin',id:373},0);
 assert.equal(s.completed[373],1);
});

test('indexed candidates cover all eligible quests in every supported dungeon',()=>{
 for(const d of Object.values(dungeonDefinitions)){
  const s=character(d.id);
  const expected=Object.values(quests).filter(q=>questAvailable(s,q)&&atEndpoint(s,q,'starts')).map(q=>q.entry).sort((a,b)=>a-b);
  assert.deepEqual(visibleQuestIds(s),expected,d.id);
  const npcs=people(s);assert.equal(new Set(npcs.map(n=>n.key)).size,npcs.length);
  for(const npc of npcs){assert.deepEqual(npc.roles,['quests']);assert.equal(new Set(npc.accepts).size,npc.accepts.length);}
 }
});

test('shared-room members accept and turn in only their own quest',async()=>{
 const {controllerAction}=await import('../src/controller-actions.ts');
 const {participantPresentationState}=await import('../src/resident-participants.ts');
 let s=character();const member=createGame('队员',38,0);member.id='member';member.level=60;member.completed[155]=1;s.party=[member];
 const controllers=[{actorId:s.id,accountId:'leader'},{actorId:member.id,accountId:'member'}];
 const accept=controllerAction(s,controllers,controllers[1],{kind:'questAccept',questId:166});
 assert.ok(giver(participantPresentationState(s,member.id),166,'accepts'));
 s=act(s,accept,0,{actorId:member.id});
 assert.ok(s.party[0].quests[166]);assert.equal(s.quests[166],undefined);
 addItem(s.party[0],3637,1);
 const reward=controllerAction(s,controllers,controllers[1],{kind:'questTurnIn',questId:166,choiceId:6087});
 s=act(s,reward,0,{actorId:member.id});
 assert.equal(s.party[0].completed[166],1);assert.equal(s.completed[166],undefined);
 assert.ok(s.party[0].bag.some(i=>i.id===6087));assert.ok(!s.bag.some(i=>i.id===6087));
});

test('busy and dead participants cannot interact with quest NPCs',()=>{
 const s=character();s.completed[155]=1;s.hp=0;
 assert.throws(()=>act(s,{type:'accept',id:166},0),/存活/);
 s.hp=100;s.activity={type:'travel'};
 assert.throws(()=>act(s,{type:'accept',id:166},0),/当前活动/);
});
