import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let directory,Frames,LiveFrames;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(web+'.raid-frames-test-');
 await build({absWorkingDir:web,entryPoints:['app/battle-raid-frames.tsx'],outfile:directory+'/frames.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 Frames=(await import(pathToFileURL(directory+'/frames.mjs').href)).default;
 await build({absWorkingDir:web,entryPoints:['app/live-raid-frames.tsx'],outfile:directory+'/live.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 LiveFrames=(await import(pathToFileURL(directory+'/live.mjs').href)).default;
});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const units=()=>Array.from({length:25},(_,i)=>({id:String(i),name:'成员'+i,classId:8,hp:i===6?0:600,maxHp:1000}));
const render=(members,views={})=>renderToStaticMarkup(createElement(Frames,{units:members,views,selectedId:'2',onSelect:()=>{},clock:1000,live:true}));
test('raid groups keep all 25 members in stable five-person columns and exclude summons and enemies',()=>{
 const members=units(),html=render([...members,{id:'pet',name:'宠物',petUnit:true},{id:'totem',name:'图腾',totemUnit:true},{id:'enemy',name:'敌人',foe:true}]);
 assert.equal((html.match(/role="group"/g)||[]).length,5);assert.equal((html.match(/<button /g)||[]).length,25);
 assert.match(html,/24\/25/);assert.match(html,/死亡/);assert.match(html,/aria-pressed="true" aria-label="成员2/);
 assert.doesNotMatch(html,/宠物|图腾|敌人/);assert.ok(html.indexOf('成员5')<html.indexOf('成员6')&&html.indexOf('成员6')<html.indexOf('成员7'));
});
test('frames use authoritative health and resource values and hide expired effects',()=>{
 const html=render(units().slice(0,1),{'0':{hp:200,maxHp:1000,color:'#3fc7eb',className:'法师',resource:{name:'法力',key:'mana',value:250,max:1000},effects:[{name:'寒冰护体',until:2000,spellId:1},{name:'已过期效果',until:999,spellId:2}]}});
 assert.match(html,/生命 200 \/ 1000/);assert.match(html,/法力 250 \/ 1000/);assert.match(html,/width:20%/);assert.match(html,/width:25%/);assert.match(html,/is-critical/);assert.match(html,/寒冰护体/);assert.doesNotMatch(html,/已过期效果/);
});
test('live HUD frames show recovered camp members instead of the last battle casualties',()=>{
 const hero={id:'hero',name:'团长',classId:8,hp:1000,mana:800,clock:5000,combat:null};
 const data={stats:{maxHp:1000,maxMana:1000},party:[{id:'tank',name:'坦克',classId:1,hp:2000,rage:500,stats:{maxHp:2000}}],battleView:{units:{hero:{hp:0,maxHp:1000},tank:{hp:0,maxHp:2000}}}};
 const html=renderToStaticMarkup(createElement(LiveFrames,{state:hero,data,selectedId:'tank',onSelect:()=>{}}));
 assert.match(html,/2\/2/);assert.match(html,/生命 1000 \/ 1000/);assert.match(html,/法力 800 \/ 1000/);assert.match(html,/怒气 50 \/ 100/);
 assert.match(html,/aria-pressed="true" aria-label="坦克/);assert.doesNotMatch(html,/死亡|战斗结束时/);
});
