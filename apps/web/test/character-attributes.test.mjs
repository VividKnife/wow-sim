import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view,combatView} from '../../../packages/game-domain/src/rules/engine.js';
import {stats} from '../../../packages/game-domain/src/rules/character.js';
import {characterAttributes} from '../../../packages/game-domain/src/rules/character-attributes.js';
import {items} from '../../../packages/game-domain/src/rules/catalog.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {playbackProjection} from '../../../packages/game-domain/src/combat-playback.ts';
import {playbackPerspective} from '../lib/combat-playback.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';

const make=()=>createGame('属性检查',283,0,{classId:1,raceId:1});
const value=(groups,title,label)=>groups.find(g=>g.title===title).rows.find(r=>r.label===label).value;
test('full and combat snapshots expose all attribute groups without changing character state',()=>{
 const c=make(),before=structuredClone(c);
 for(const data of [view(c),combatView(c)]){
  const groups=data.characterAttributes;
  assert.deepEqual(groups.map(g=>g.title),['基本属性','近战属性','远程属性','法术属性','防御属性','魔法抗性']);
  assert.equal(value(groups,'近战属性','命中加成'),'0.00%');
  assert.equal(value(groups,'近战属性','精准'),'不适用');
  assert.equal(value(groups,'远程属性','远程武器技能'),'—');
  const projected=projectClientSnapshot(c,data);
  assert.ok(JSON.stringify(projected).includes('characterAttributes'));
  for(const group of groups)for(const row of group.rows)assert.doesNotMatch(row.value,/NaN|undefined|Infinity/);
 }
 assert.deepEqual(c,before);
});
test('shield removal and broken shields disable block and block value',()=>{
 const c=make();c.level=60;c.learned.push(107);
 const shield=Object.values(items).find(i=>i.InventoryType===14&&i.block>0&&i.MaxDurability>0);
 c.equipment[17]={id:shield.entry,durability:shield.MaxDurability};
 assert.equal(value(characterAttributes(c),'防御属性','格挡'),'5.00%');
 assert.ok(Number(value(characterAttributes(c),'防御属性','格挡值'))>0);
 c.equipment[17].durability=0;
 assert.equal(value(characterAttributes(c),'防御属性','格挡'),'0.00%');
 assert.equal(value(characterAttributes(c),'防御属性','格挡值'),'0');
 delete c.equipment[17];assert.equal(value(characterAttributes(c),'防御属性','格挡'),'0.00%');
});
test('hit, spell hit, defense and active avoidance update and expire',()=>{
 const c=make(),base=stats(c);
 c.auras=[{type:54,amount:3,until:1000},{type:55,amount:4,until:1000},{type:49,amount:10,until:1000},{type:30,misc:95,amount:5,until:1000}];
 const groups=characterAttributes(c);
 assert.equal(value(groups,'近战属性','命中加成'),'3.00%');
 assert.equal(value(groups,'法术属性','法术命中加成'),'4.00%');
 assert.equal(value(groups,'防御属性','躲闪'),((base.dodge+.1+.002)*100).toFixed(2)+'%');
 c.time=c.clock=1000;
 assert.equal(value(characterAttributes(c),'近战属性','命中加成'),'0.00%');
 assert.equal(value(characterAttributes(c),'防御属性','躲闪'),(base.dodge*100).toFixed(2)+'%');
});
test('forms use level-based melee skill and school bonuses stay separate',()=>{
 const c=make();c.level=20;c.form='cat';c.auras=[{type:13,misc:4,amount:20,until:1000}];
 const groups=characterAttributes(c);
 assert.equal(value(groups,'近战属性','主手武器技能'),'100');
 assert.equal(value(groups,'近战属性','副手武器技能'),'—');
 assert.equal(value(groups,'法术属性','火焰法术强度'),'20');
 assert.equal(value(groups,'法术属性','冰霜法术强度'),'0');
});
test('combat playback refreshes the displayed attributes from the selected actor',()=>{
 const c=make();startCombat(c,[6]);
 c.auras=[{type:54,amount:7,until:1000}];
 const snapshot=playbackProjection(c),display=playbackPerspective(c,view(c),snapshot,1000);
 assert.equal(value(display.data.characterAttributes,'近战属性','命中加成'),'7.00%');
 c.time=c.clock=1000;
 const expired=playbackPerspective(c,display.data,playbackProjection(c),2000);
 assert.equal(value(expired.data.characterAttributes,'近战属性','命中加成'),'0.00%');
});
