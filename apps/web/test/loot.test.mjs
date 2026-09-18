import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {queueCombatLoot,collectLoot} from '../../../packages/game-domain/src/rules/loot.js';
import {lootRows} from '../../../packages/game-domain/src/rules/quests.js';
import {bagCapacity,makeItem} from '../../../packages/game-domain/src/rules/character.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';

function fixture(){const s=createGame('拾取测试',283,0);startCombat(s,[299]);return s;}
test('rolled combat drops stay pending through settlement and appear in the snapshot',()=>{
 const s=fixture(),before=structuredClone(s.bag),battleId=s.combat.id;
 lootRows(s,[{item:2589,mincountOrRef:2,maxcount:2,ChanceOrQuestChance:100,groupid:0,condition_id:0}],0,true);
 assert.deepEqual(s.bag,before);assert.equal(s.pending[0].count,2);assert.equal(s.pending[0].lootBattleId,battleId);
 s.combat.enemies.forEach(e=>{e.hp=0;e.rewarded=true;});combatTick(s);
 assert.equal(s.combat,null);assert.ok(s.pending.length);assert.equal(projectClientSnapshot(s,{}).player.pending[0].lootBattleId,battleId);
});
test('selected pickup preserves instance metadata and repeated commands cannot duplicate loot',()=>{
 let s=fixture();queueCombatLoot(s,25,1);queueCombatLoot(s,2589,2);s.combat=null;
 const chosen=s.pending[0];Object.assign(chosen,{enchant:123,durability:3,locked:true,ownerId:s.id});
 s=act(s,{type:'loot',uids:[chosen.uid]},0);
 const received=s.bag.find(i=>i.uid===chosen.uid);
 assert.equal(received.enchant,123);assert.equal(received.durability,3);assert.equal(received.locked,true);assert.equal(received.ownerId,s.id);assert.equal(received.lootBattleId,undefined);
 assert.equal(s.pending.length,1);const count=s.bag.length;
 s=act(s,{type:'loot',uids:[chosen.uid]},0);assert.equal(s.bag.length,count);assert.equal(s.pending.length,1);
 s=act(s,{type:'loot'},0);assert.equal(s.pending.length,0);
});
test('full bags retain loot; stackable items can still be collected and retried later',()=>{
 const s=fixture();s.bag=[makeItem(s,2589,1)];while(s.bag.length<bagCapacity(s))s.bag.push(makeItem(s,25));
 queueCombatLoot(s,25,1);queueCombatLoot(s,2589,2);s.combat=null;const retained=s.pending[0].uid;
 collectLoot(s);assert.equal(s.pending.length,1);assert.equal(s.pending[0].uid,retained);assert.equal(s.bag[0].count,3);
 s.bag.pop();collectLoot(s);assert.equal(s.pending.length,0);assert.ok(s.bag.some(i=>i.uid===retained));
});
test('oversized pending stacks are split without duplicate instance IDs',()=>{
 const s=fixture();s.combat=null;s.pending=[makeItem(s,2589,45)];s.bag=[];
 while(s.bag.length<bagCapacity(s)-1)s.bag.push(makeItem(s,25));
 collectLoot(s);assert.equal(s.pending[0].count,25);
 assert.equal(new Set([...s.bag,...s.pending].map(i=>i.uid)).size,s.bag.length+s.pending.length);
 s.bag.splice(0,2);collectLoot(s);assert.equal(s.pending.length,0);assert.equal(s.bag.filter(i=>i.id===2589).reduce((n,i)=>n+i.count,0),45);
});
test('auto-loot preference is validated and does not overwrite recovery settings',()=>{
 let s=createGame('设置',283,0);assert.equal(s.settings.autoLoot,false);
 s=act(s,{type:'settings',autoLoot:true},0);assert.equal(s.settings.autoLoot,true);assert.equal(s.settings.health,70);
 s=act(s,{type:'settings',health:50,mana:40},0);assert.equal(s.settings.autoLoot,true);
 assert.throws(()=>act(s,{type:'settings',autoLoot:'true'},0),/自动拾取/);
});
test('hunt waits for pickup then continues, and combat pickup is rejected',()=>{
 let s=fixture();queueCombatLoot(s,2589,1);assert.throws(()=>collectLoot(s),/结束战斗/);
 s.combat=null;s.activity={type:'hunt',target:299};s.nextPull=0;
 s=advance(s,1000).state;assert.equal(s.activity.type,'hunt');assert.match(s.activity.reason,/待拾取战利品/);assert.equal(s.combat,null);
 s=act(s,{type:'loot'},s.wallAt);s=advance(s,s.wallAt+100).state;assert.ok(s.combat);
 assert.throws(()=>collectLoot({...s,combat:null},'bad'),/列表无效/);
});

test('full bag rejects a new hunt with a visible reason before combat opens',()=>{
 const s=createGame('满包狩猎',283,0);while(s.bag.length<bagCapacity(s))s.bag.push(makeItem(s,25));
 assert.throws(()=>act(s,{type:'hunt',id:299},0),/背包已满，请先整理背包后再开始战斗/);
 assert.equal(s.activity.type,'idle');assert.equal(s.combat,null);
});

test('automatic loot finishes combat and resumes hunting without any client commands',()=>{
 let s=fixture();s.settings.autoLoot=true;s.activity={type:'hunt',target:299};
 queueCombatLoot(s,2589,2);const uid=s.pending[0].uid;
 s.combat.enemies.forEach(e=>{e.hp=0;e.rewarded=true;});
 s=advance(s,100).state;
 assert.equal(s.combat,null);assert.equal(s.pending.length,0);assert.ok(s.bag.some(i=>i.uid===uid));
 s=advance(s,3200).state;assert.ok(s.combat);
});

test('automatic loot retains full-bag drops and collects them once space is available',()=>{
 let s=fixture();s.settings.autoLoot=true;queueCombatLoot(s,25,1);queueCombatLoot(s,2589,2);
 s.combat=null;s.bag=[makeItem(s,2589,1)];while(s.bag.length<bagCapacity(s))s.bag.push(makeItem(s,25));
 s=advance(s,1000).state;assert.equal(s.pending.length,1);assert.equal(s.bag[0].count,3);
 const uid=s.pending[0].uid;s.bag.pop();
 s=advance(s,2000).state;assert.equal(s.pending.length,0);assert.ok(s.bag.some(i=>i.uid===uid));
});

test('automatic loot waits for resurrection and is deterministic across persisted catch-up',()=>{
 const s=fixture();s.settings.autoLoot=true;queueCombatLoot(s,2589,2);s.combat=null;s.hp=0;s.activity={type:'dead'};
 let dead=advance(s,1000).state;assert.equal(dead.pending.length,1);
 dead.hp=100;dead.activity={type:'idle'};
 const whole=advance(dead,4000).state;
 const chunk=advance(JSON.parse(JSON.stringify(advance(dead,1500).state)),4000).state;
 assert.deepEqual(chunk,whole);assert.equal(whole.pending.length,0);
});
