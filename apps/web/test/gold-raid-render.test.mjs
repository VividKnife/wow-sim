import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {buildGameResponse} from '../../../packages/game-domain/src/rules/server-response.js';
import {createMoltenCoreDemo} from '../../../packages/game-domain/src/molten-core-demo.ts';
import {enterGoldRaid,goldRaidAction} from '../../../packages/game-domain/src/rules/gold-raid.js';
let directory,GoldRaid;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(web+'.gold-raid-test-');
 await build({absWorkingDir:web,entryPoints:['app/gold-raid.tsx'],outfile:directory+'/raid.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 GoldRaid=(await import(pathToFileURL(directory+'/raid.mjs').href)).default;
});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const render=snapshot=>renderToStaticMarkup(createElement(GoldRaid,{state:snapshot.player,data:{...snapshot.view,items:{}},busy:false,send:async()=>true,onObserve:()=>{}}));
test('raid entry renders the actual server snapshot with phase-gated world boss choices',()=>{
 const snapshot=buildGameResponse(createGame('团本入口',42,0),1).snapshot;
 assert.deepEqual(snapshot.view.goldRaid.raids.map(r=>r.id),['molten-core-gold','onyxias-lair-gold','azuregos-gold','kazzak-gold']);
 const html=render(snapshot);assert.match(html,/熔火之心/);assert.match(html,/奥妮克希亚/);assert.equal((html.match(/创建金团/g)||[]).length,4);
});
test('missing raid list shows a recoverable error instead of crashing or inventing entry permissions',()=>{
 const snapshot=buildGameResponse(createGame('缺失列表',43,0),1).snapshot;
 delete snapshot.view.goldRaid.raids;
 const html=render(snapshot);assert.match(html,/role="alert"/);assert.match(html,/刷新页面/);assert.doesNotMatch(html,/创建金团/);
});
test('active raid with incomplete auction data shows a recoverable error',()=>{
 const snapshot=buildGameResponse(createGame('缺失竞拍',44,0),1).snapshot;
 snapshot.view.goldRaid={active:true,sales:[]};
 const html=render(snapshot);assert.match(html,/role="alert"/);assert.match(html,/竞拍数据暂未加载/);assert.match(html,/刷新页面/);
});
test('draft and recruitment render complete current server views',()=>{
 const state=createMoltenCoreDemo().state;state.party=[];state.growthPolicy='player';enterGoldRaid(state);
 assert.match(render(buildGameResponse(state,1).snapshot),/发布公告/);
 goldRaidAction(state,{type:'goldPublish'});
 const html=render(buildGameResponse(state,2).snapshot);assert.match(html,/冒险者名册/);assert.match(html,/查看装备与天赋/);
});

test('parallel auction rows render eligibility, caps, money, deadlines and recent outcomes',async()=>{
 const {GoldAuctionPanel}=await import(pathToFileURL(directory+'/raid.mjs').href);
 const lots=[
  {id:'ready',name:'可拍装备',itemId:19147,eligible:[{id:'hero',name:'团长'}]},
  {id:'capped',name:'上限装备',itemId:18820,playerLimit:50000,eligible:[{id:'hero',name:'团长'}]},
  {id:'restricted',name:'职业限制装备',itemId:16866,eligible:[]},
  {id:'leading',name:'领先装备',itemId:18814,leader:'player',eligible:[{id:'hero',name:'团长'}]},
  {id:'expired',name:'结束中装备',itemId:17103,endsAt:0,eligible:[{id:'hero',name:'团长'}]},
 ].map(a=>({count:1,price:100000,minimum:150000,step:50000,endsAt:8000,windowMs:12000,playerLimit:null,bids:[],...a}));
 const html=renderToStaticMarkup(createElement(GoldAuctionPanel,{state:{id:'hero',money:200000,clock:0},data:{items:{},goldRaid:{auctions:lots,sales:[{id:'sold',itemId:19147,name:'已成交装备',count:1,price:100000,winnerId:'npc',winner:'买家'}]}},busy:false,send:async()=>true}));
 for(const label of ['出价 15 G','已达上限','无法使用','你已领先','正在落槌','已成交','0:08','买家'])assert.ok(html.includes(label),label);
 assert.doesNotMatch(html,/<select|<option|NaN|推进一轮|为谁竞拍/);
 assert.equal((html.match(/role="progressbar"/g)||[]).length,5);
});

test('raid command panel renders hide controls and the current healing order',async()=>{
 const {beginMoltenCoreBattle}=await import('../../../packages/game-domain/src/rules/molten-core-battle.js');
 const {raidCommandAction}=await import('../../../packages/game-domain/src/rules/raid-command.js');
 const state=createMoltenCoreDemo().state;state.party=[];state.growthPolicy='player';enterGoldRaid(state);
 for(const type of ['goldPublish','goldRecommend','goldLaunch'])goldRaidAction(state,{type});
 beginMoltenCoreBattle(state,'lucifron',state.goldRaid.tactics);
 raidCommandAction(state,{type:'raidOrder',order:'conserveMana',encounterId:state.combat.id});
 const html=render(buildGameResponse(state,1).snapshot);
 for(const label of ['隐藏开荒指挥台','隐藏团队指挥','节约蓝量','正常治疗'])assert.ok(html.includes(label),label);
 assert.match(html,/aria-pressed="true"[^>]*disabled=""[^>]*>节约蓝量/);
 // Radix emits a hidden select for form semantics; visible choices use GameSelect.
 assert.doesNotMatch(html,/<select(?![^>]*aria-hidden="true")/);
});
