import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

let component,directory,bundle;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(join(web,'.damage-meter-test-'));bundle=join(directory,'component.mjs');
 await build({absWorkingDir:web,entryPoints:['app/damage-meter.tsx'],outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 component=await import(pathToFileURL(bundle).href);
});
after(async()=>{if(bundle)await unlink(bundle);if(directory)await rmdir(directory);});

test('all playable classes render an image in damage statistics',()=>{
 const actors=Object.fromEntries([1,2,3,4,5,7,8,9,11].map(classId=>[`class-${classId}`,{actorId:`class-${classId}`,name:`职业${classId}`,classId,damage:10,healing:0,hits:1,crits:0,periodicDamage:0,periodicHits:0,healHits:0,healCrits:0,spells:{}}]));
 const html=renderToStaticMarkup(createElement(component.default,{battle:{startedAt:0,metrics:{startedAt:0,durationMs:1000,actors}},clock:1000}));
 assert.equal((html.match(/class="dm-class-icon"/g)||[]).length,9);
 assert.doesNotMatch(html,/dm-class-letter/);
});

test('damage source icons cover attacks, pets and missing historical spell metadata',()=>{
 assert.match(component.damageSourceIcon({spellId:0,label:'近战攻击'},[]),/ability_meleedamage/);
 assert.match(component.damageSourceIcon({spellId:0,label:'灰牙 · 撕咬'},[]),/ability_hunter_pet_wolf/);
 assert.match(component.damageSourceIcon({spellId:123,label:'历史技能'},[]),/spell_holy_magicalsentry/);
 assert.equal(component.damageSourceIcon({spellId:'133',label:'火球术'},[{spellId:133,icon:'/fireball.png'}]),'/fireball.png');
});

test('damage statistics display hunter and warlock totals including their pets',()=>{
 const actors={};
 for(const classId of [3,9]){
  const actorId=`class-${classId}`,petId=`${actorId}-pet`;
  actors[actorId]={actorId,name:`职业${classId}`,classId,damage:70,healing:0,spells:{}};
  actors[petId]={actorId:petId,name:classId===3?'灰牙':'Imp',classId:0,petUnit:true,ownerId:actorId,kind:classId===3?'beast':'imp',damage:30,healing:0,spells:{}};
 }
 const html=renderToStaticMarkup(createElement(component.default,{battle:{startedAt:0,endedAt:1000,metrics:{startedAt:0,actors}},clock:1000}));
 assert.equal((html.match(/class="dm-row /g)||[]).length,2);
 for(const classId of [3,9])assert.ok(html.includes(`职业${classId}，伤害 100，DPS 100.0，占比 50.0%，其中宠物 30`));
 assert.doesNotMatch(html,/dm-class-letter/);
});
