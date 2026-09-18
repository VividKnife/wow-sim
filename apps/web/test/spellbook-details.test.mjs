import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import {spellbookDetails} from '../../../packages/game-domain/src/rules/spellbook-details.js';

const character=()=>createGame('技能详情',37,0);
const details=(id)=>{const c=character();return spellbookDetails(c,spellInfo(c,id));};

test('spellbook projects learned and unlearned spell details with separate direct and periodic damage',()=>{
 const skills=view(character()).skills;
 const fireball=skills.find(a=>a.spellId===133);
 assert.equal(fireball.known,true);
 assert.ok(fireball.details.facts.includes('施法距离 35 码'));
 assert.deepEqual(fireball.details.effects,['基础火焰伤害 14—22','每 2 秒 造成火焰伤害 1（基础）']);
 const teleport=skills.find(a=>a.spellId===3561);
 assert.equal(teleport.known,false);
 assert.ok(teleport.details.restrictions.includes('材料：传送符文 ×1'));
 assert.ok(teleport.details.restrictions.includes('仅限非战斗状态'));
});

test('slow and absorption use their distinct aura types',()=>{
 assert.ok(details(116).effects.includes('移动速度变化 -40%'));
 assert.ok(!details(116).effects.some(text=>text.includes('吸收')));
 assert.ok(details(17).effects.some(text=>text.startsWith('基础吸收伤害 ')));
});

test('range dead zones, cooldowns, stances and equipment restrictions are visible',()=>{
 assert.ok(details(1978).facts.includes('施法距离 8—35 码'));
 assert.ok(details(100).facts.includes('冷却 15 秒'));
 assert.ok(details(100).restrictions.includes('需要战斗姿态'));
 assert.ok(details(53).restrictions.includes('需要装备匕首'));
 assert.ok(details(585).effects.includes('基础神圣伤害 13—17'));
});

test('all class skill projections contain finite readable detail values',()=>{
 for(const [classId,raceId] of [[1,1],[2,1],[3,3],[4,1],[5,1],[7,2],[8,1],[9,1],[11,4]]){
  const skills=view(createGame('职业详情',37,0,{classId,raceId})).skills;
  assert.ok(skills.length);
  for(const skill of skills){
   assert.ok(skill.details.facts.length);
   assert.doesNotMatch(JSON.stringify(skill.details),/NaN|undefined|Infinity/);
  }
 }
});
