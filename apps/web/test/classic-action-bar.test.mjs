import test from 'node:test';
import assert from 'node:assert/strict';
import {quickActions,normalizeActionSlots,defaultActionSlots,quickActionKey,actionBarStorageKey} from '../lib/classic-action-bar.js';
import {createGame,view,act} from '../../../packages/game-domain/src/rules/engine.js';
import {addItem,stats} from '../../../packages/game-domain/src/rules/character.js';
test('slots preserve empty choices, reject invalid bindings and isolate characters',()=>{
 assert.equal(normalizeActionSlots({}),null);
 assert.deepEqual(normalizeActionSlots(['spell:20577','item:6948','bad',null]).slice(0,4),['spell:20577','item:6948',null,null]);
 assert.equal(normalizeActionSlots([]).length,12);
 assert.notEqual(actionBarStorageKey('one'),actionBarStorageKey('two'));
});
test('quickbar exposes real hearthstone, portal and cannibalize commands',()=>{
 const s=createGame('快捷',37,0,{raceId:5,classId:8});s.location='goldshire';s.level=40;s.learned.push(11418);s.mana=stats(s).maxMana;addItem(s,17032,2);
 const actions=quickActions(s,view(s));
 assert.equal(defaultActionSlots(actions)[0],'item:6948');
 const hearth=actions.find(a=>a.key==='item:6948');assert.equal(act(s,hearth.command,s.wallAt).activity.type,'hearth');
 const portal=actions.find(a=>a.key==='spell:11418');assert.ok(portal.canUse,portal.reason);assert.equal(portal.command.target,s.id);
 assert.equal(act(s,portal.command,s.wallAt).activity.type,'classSpell');
 assert.ok(actions.find(a=>a.key==='spell:20577'));
});
test('item bindings select usable stacks and survive stack replacement',()=>{
 const s={id:'player',bag:[{id:118,uid:'locked',count:2,locked:true},{id:118,uid:'ready',count:1}]};
 const d={items:{118:{name:'药水'}},itemUses:{locked:{canUse:false,reason:'锁定'},ready:{canUse:true}}};
 assert.equal(quickActions(s,d)[0].command.uid,'ready');assert.equal(quickActions(s,d)[0].count,3);
 s.bag=[{id:118,uid:'new',count:1}];d.itemUses.new={canUse:true};assert.equal(quickActions(s,d)[0].key,'item:118');assert.equal(quickActions(s,d)[0].command.uid,'new');
});
test('typing, repeat, composition, modifiers and handled keys never cast',()=>{
 assert.equal(quickActionKey({key:'1'}),0);assert.equal(quickActionKey({key:'='}),11);
 for(const flag of ['defaultPrevented','repeat','isComposing','ctrlKey','altKey','metaKey','shiftKey'])assert.equal(quickActionKey({key:'1',[flag]:true}),-1);
 assert.equal(quickActionKey({key:'1',target:{closest:()=>({})}}),-1);
});

test('combat and peace have separate storage and candidate lists',()=>{
 assert.notEqual(actionBarStorageKey('player','peace'),actionBarStorageKey('player','combat'));
 const s=createGame('双栏',37,0),d=view(s);
 const peace=quickActions(s,d,'peace'),combat=quickActions(s,d,'combat');
 assert.equal(peace[0].key,'item:6948');
 assert.ok(combat.some(a=>a.automatic&&a.key==='spell:133'));
 assert.ok(!peace.some(a=>a.key==='spell:133'));
 assert.ok(!combat.some(a=>a.automatic&&a.key==='spell:81'),'passive dodge is not a combat action');
});
test('combat monitoring uses live cooldowns while utility actions keep their existing rules',()=>{
 const s={id:'player',clock:1000,combat:{},bag:[]};
 const d={strategyMembers:[{id:'player',skills:[{spellId:133,name:'火球术',known:true}]}],skills:[{spellId:1459,name:'奥术智慧',known:true}],skillUses:{1459:{canUse:true}},battleView:{units:{player:{cooldowns:[{spellId:133,readyAt:6000}]}}}};
 const actions=quickActions(s,d,'combat');
 assert.equal(actions[0].remaining,5000);assert.equal(actions[0].canUse,false);assert.equal(actions[0].command,null);
 assert.equal(actions.find(a=>a.key==='spell:1459').canUse,true);
});

test('GCD expires locally without another snapshot, while other restrictions stay blocked',async()=>{
 const {actionAfterElapsed}=await import('../lib/classic-action-bar.js');
 const {skillUseView}=await import('../../../packages/game-domain/src/rules/utility-actions.js');
 for(const [classId,spellId] of [[5,1243],[8,168]]){
  let s=createGame('冷却',37,0,{raceId:1,classId});s.level=20;
  if(!s.learned.includes(spellId))s.learned.push(spellId);
  s.mana=stats(s).maxMana;
  s=act(s,{type:'cast',id:spellId},0);
  const use=skillUseView(s,spellId);
  assert.equal(use.remaining,1500);assert.equal(use.canUse,false);assert.equal(use.canUseAfterCooldown,true);
  assert.equal(actionAfterElapsed(use,1400).canUse,false);
  const ready=actionAfterElapsed(use,1500);assert.equal(ready.remaining,0);assert.equal(ready.canUse,true);assert.equal(ready.reason,'');
  assert.equal(actionAfterElapsed(use,6000).canUse,true);
  assert.equal(use.remaining,1500,'display projection never mutates engine state');
  s.mana=0;
  const blocked=skillUseView(s,spellId);assert.equal(blocked.canUseAfterCooldown,false);
  assert.equal(actionAfterElapsed(blocked,6000).canUse,false);assert.match(blocked.reason,/不足/);
 }
});

test('long spell cooldowns are not cleared at GCD duration',async()=>{
 const {actionAfterElapsed}=await import('../lib/classic-action-bar.js');
 const use={canUse:false,canUseAfterCooldown:true,remaining:30000,reason:'技能尚未冷却'};
 assert.equal(actionAfterElapsed(use,1500).remaining,28500);assert.equal(actionAfterElapsed(use,1500).canUse,false);
 assert.equal(actionAfterElapsed(use,30000).canUse,true);
 assert.equal(actionAfterElapsed({...use,canUseAfterCooldown:false,reason:'缺少材料'},30000).reason,'缺少材料');
});
