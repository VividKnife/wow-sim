import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {bagCapacity,makeItem} from '../../../packages/game-domain/src/rules/character.js';
import {queueCombatLoot} from '../../../packages/game-domain/src/rules/loot.js';
import {questProgress} from '../../../packages/game-domain/src/rules/quests.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';

function militia(){const s=createGame('任务狩猎',1,0);s.location='sentinel';s.quests[12]={kills:{95:14,504:0}};return s;}
function finish(s){s.combat.enemies.forEach(e=>{e.hp=0;e.rewarded=true;});return advance(s,s.wallAt+100).state;}
test('full bags pause without losing the target, including when nothing remains to pick up',()=>{
 let s=createGame('满包恢复',1,0);s=act(s,{type:'hunt',id:299},0);
 while(s.bag.length<bagCapacity(s))s.bag.push(makeItem(s,25));
 s=advance(s,5000).state;
 assert.equal(s.activity.type,'hunt');assert.equal(s.activity.target,299);assert.equal(s.activity.paused,true);assert.equal(s.combat,null);
 assert.equal(projectClientSnapshot(s,{}).player.activity.paused,true);
 s.bag.pop();s=advance(JSON.parse(JSON.stringify(s)),5100).state;
 assert.ok(s.combat);assert.equal(s.activity.paused,undefined);
});
test('full bags and pending drops keep the pause visible until pickup and space are resolved',()=>{
 let s=createGame('待拾取恢复',1,0);s=act(s,{type:'hunt',id:299},0);
 while(s.bag.length<bagCapacity(s))s.bag.push(makeItem(s,25));
 s.pending=[makeItem(s,25)];s.settings.autoLoot=true;
 s=advance(s,1000).state;assert.equal(s.activity.paused,true);assert.equal(s.pending.length,1);
 s.bag.pop();s=advance(s,2000).state;assert.equal(s.pending.length,0);assert.equal(s.activity.paused,true);
 s.bag.pop();s=advance(s,2100).state;assert.ok(s.combat);
});
test('current kill target stops at its quota even though the other task target remains',()=>{
 let s=act(militia(),{type:'hunt',id:95},0);
 assert.deepEqual(s.activity.questIds,[12]);s.quests[12].kills[95]=15;
 s=advance(s,1000).state;assert.equal(s.activity.type,'idle');assert.equal(s.combat,null);
 assert.equal(questProgress(s,12).complete,false);assert.match(s.activity.reason,/需求已完成/);
 // A fresh hunt with no remaining demand for this monster is ordinary XP farming.
 s=act(s,{type:'hunt',id:95},s.wallAt);s=advance(s,s.wallAt+100).state;assert.ok(s.combat);
});
test('all captured tasks for a monster must be satisfied before stopping',()=>{
 let s=militia();s.quests[153]={kills:{}}; // Red Leather Bandanas, dropped by Defias.
 s=act(s,{type:'hunt',id:95},0);assert.ok(s.activity.questIds.includes(153));
 s.quests[12].kills[95]=15;s=advance(s,100).state;assert.ok(s.combat);
});
test('Surena item completion stops immediately after automatic loot settlement',()=>{
 let s=createGame('苏伦娜',9,0);s.location='brackwell';s.quests[1688]={kills:{}};s.settings.autoLoot=true;
 s=act(s,{type:'hunt',id:881},0);s=advance(s,100).state;assert.ok(s.combat);
 queueCombatLoot(s,6810,1);s=finish(s);
 assert.equal(s.activity.type,'idle');assert.equal(questProgress(s,1688).complete,true);
 s=advance(s,s.wallAt+10000).state;assert.equal(s.combat,null);
});
test('stopping during combat survives persistence and never starts the next pull',()=>{
 let s=createGame('排队停止',1,0);s=act(s,{type:'hunt',id:299},0);s=advance(s,100).state;
 const id=s.combat.id;s=act(s,{type:'stop'},s.wallAt);
 assert.equal(s.combat.id,id);assert.equal(s.activity.stopQueued,true);
 assert.equal(projectClientSnapshot(s,{}).player.activity.stopQueued,true);
 s=finish(JSON.parse(JSON.stringify(s)));assert.equal(s.activity.stopQueued,undefined);
 assert.match(s.activity.reason,/已停止狩猎/);s=advance(s,s.wallAt+10000).state;assert.equal(s.combat,null);
});
