import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {classDefinitions} from '../../../packages/game-domain/src/rules/catalog.js';
import {stats,spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {classEffect} from '../../../packages/game-domain/src/rules/class-mechanics.js';
import {finishCombat} from '../../../packages/game-domain/src/rules/combat-metrics.js';

let components,directory,bundle;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));
 directory=await mkdtemp(join(web,'.battle-ui-test-'));bundle=join(directory,'components.mjs');
 await build({absWorkingDir:web,entryPoints:['app/battle-class-panel.tsx'],outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 components=await import(pathToFileURL(bundle).href);
});
after(async()=>{if(bundle)await unlink(bundle);if(directory)await rmdir(directory);});
const game=id=>{const def=classDefinitions.find(c=>c.id===id),s=createGame('职业界面',93,0,{classId:id,raceId:def.races[0]});s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;startCombat(s,[299]);return s;};
const render=(s,unit=s)=>renderToStaticMarkup(createElement(components.BattleUnitStatus,{unit,ui:view(s).battleView.units[unit.id],clock:s.combat?s.clock:s.lastCombat.endedAt,live:!!s.combat}));

test('nine class panels render the resource and mechanism from the public game view',()=>{
 for(const id of [1,2,3,4,5,7,8,9,11]){const s=game(id);if(id===4){s.combo=3;s.comboTarget=s.combat.enemies[0].id;}
  const html=render(s);assert.match(html,/职业界面/);assert.match(html,new RegExp(id===1?'怒气':id===4?'能量':'法力'));
  if(id===1)assert.match(html,/战斗姿态/);if(id===4)assert.match(html,/连击点 3 \/ 5/);if(id===7)for(const label of ['大地','火焰','水流','空气'])assert.ok(html.includes(label));if(id===9)assert.match(html,/灵魂碎片/);
 }
});
test('druid panel renders both pools, target combo and a frozen battle result',()=>{
 const s=game(11);s.form='cat';s.energy=37;s.mana=444;s.combo=2;s.comboTarget=s.combat.enemies[0].id;
 assert.match(render(s),/猎豹形态/);assert.match(render(s),/能量 37/);assert.match(render(s),/保留法力 444/);assert.match(render(s),/连击点 2/);
 finishCombat(s);s.form=null;s.energy=100;s.mana=999;s.clock=100000;
 const html=render(s);assert.match(html,/猎豹形态/);assert.match(html,/能量 37/);assert.match(html,/本场结束时的状态/);
});
test('pet control buttons render only enabled for a living owned pet during combat',()=>{
 const s=game(3);s.hunterPet={entry:299,level:10,learned:[]};classEffect(s,s,s,spellInfo(s,883),[s],{});
 const renderPets=()=>{const d=view(s),b=s.combat||s.lastCombat,units=[...(s.combat?[s,s.pet]:b.actorsSnapshot),...b.enemies.map(e=>({...e,foe:true}))];return renderToStaticMarkup(createElement(components.BattleCompanions,{state:s,data:d,busy:false,send:async()=>true,units,clock:b.endedAt??s.clock,live:!!s.combat,targetId:b.enemies[0].id}));};
 let html=renderPets();assert.match(html,/集中值/);assert.match(html,/宠物指令/);assert.match(html,/攻击 /);assert.doesNotMatch(html,/<button[^>]* disabled=/);
 finishCombat(s);html=renderPets();assert.equal((html.match(/<button[^>]* disabled=/g)||[]).length,6);
});
test('priest absorb, target damage over time and shaman totem lifetimes reach rendered markup',()=>{
 const priest=game(5);classEffect(priest,priest,priest,spellInfo(priest,17),[priest],{});assert.match(render(priest),/吸收剩余/);assert.match(render(priest),/虚弱灵魂/);
 const enemy=priest.combat.enemies[0];enemy.dots=[{caster:priest.id,spellId:172,next:2000,interval:2000,remaining:3}];assert.match(render(priest,enemy),/腐蚀术/);assert.match(render(priest,enemy),/6秒/);
 const shaman=game(7);classEffect(shaman,shaman,shaman,spellInfo(shaman,3599),[shaman],{});assert.match(render(shaman),/灼热图腾/);assert.match(render(shaman),/四元素图腾/);
});
