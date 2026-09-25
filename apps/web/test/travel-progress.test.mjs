import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createGame,act,view} from '../../../packages/game-domain/src/rules/engine.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';

let ActivityProgress,WorldMap,directory,bundle;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));
 directory=await mkdtemp(join(web,'.travel-ui-test-'));bundle=join(directory,'component.mjs');
 await build({absWorkingDir:web,stdin:{contents:"export {default} from './app/activity-progress'; export {default as WorldMap} from './app/world-map';",resolveDir:web,loader:'tsx'},outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 const components=await import(pathToFileURL(bundle).href);ActivityProgress=components.default;WorldMap=components.WorldMap;
});
after(async()=>{if(bundle)await unlink(bundle);if(directory)await rmdir(directory);});
const data={map:[{id:'northshire',name:'北郡'},{id:'goldshire',name:'闪金镇'}]};
const state={clock:6000,activity:{type:'travel',from:'northshire',to:'goldshire',startedAt:1000,endsAt:21000}};
const render=s=>renderToStaticMarkup(createElement(ActivityProgress,{state:s,data,running:false}));

test('travel renders route, real completion percentage, and remaining time',()=>{
 const html=render(state);
 assert.match(html,/北郡/);assert.match(html,/闪金镇/);assert.match(html,/aria-valuenow="25"/);assert.match(html,/15秒/);
});
test('flight uses the same progress and identifies flight mode',()=>{
 const html=render({...state,activity:{...state.activity,flight:true}});
 assert.match(html,/飞行中/);assert.match(html,/aria-valuenow="25"/);
});
test('elapsed travel waits for server confirmation and idle removes the progress',()=>{
 const html=render({...state,clock:22000});assert.match(html,/aria-valuenow="100"/);assert.match(html,/等待抵达确认/);
 assert.doesNotMatch(render({...state,activity:{type:'idle'}}),/role="progressbar"/);
});

test('public map renders the Northshire route through Goldshire and Crystal Lake as ordered waypoints',()=>{
 const s=act(createGame('路点',11,0),{type:'travel',to:'jasper'},0),snapshot=projectClientSnapshot(s,view(s));
 const html=renderToStaticMarkup(createElement(WorldMap,{state:snapshot.player,data:snapshot.view,busy:false,send:async()=>true}));
 assert.match(html,/aria-label="沿途路点"/);
 const waypoints=html.match(/<ol[^>]*aria-label="沿途路点"[^>]*>(.*?)<\/ol>/)?.[1]||'';
 assert.match(waypoints,/北郡修道院.*闪金镇.*水晶湖.*玉石矿洞/);
 assert.match(waypoints,/aria-current="step"/);
 assert.match(html,/改道前往/);
 assert.match(html,/data-travel-mode="walking"/);
 assert.match(html,/玩家位置：步行中/);
});

test('public map traveler switches from walking to the riding sprite while mounted',()=>{
 const base=createGame('骑手',12,0),activity={type:'travel',from:'northshire',to:'goldshire',startedAt:0,endsAt:20000};
 const player={...base,activity},data={...view(base),mounts:{...view(base).mounts,active:5656,activeName:'棕马'}};
 const html=renderToStaticMarkup(createElement(WorldMap,{state:player,data,busy:false,send:async()=>true}));
 assert.match(html,/data-travel-mode="riding"/);
 assert.match(html,/玩家位置：骑马中/);
 assert.match(html,/class="horse-body"/);
});

test('corpse recovery exposes its actual duration and clears progress after resurrection',async()=>{
 const {advance}=await import('../../../packages/game-domain/src/rules/engine.js');
 for(const raceId of [1,4]){
  const fallen=createGame('灵魂',13,0,{raceId,classId:1});fallen.hp=0;fallen.activity={type:'dead'};
  const recovering=act(fallen,{type:'revive'},0),a=recovering.activity;
  assert.equal(a.startedAt,recovering.clock);assert.ok(a.endsAt>a.startedAt);
  const snapshot=projectClientSnapshot(recovering,view(recovering));
  const html=render({...snapshot.player,clock:a.startedAt+(a.endsAt-a.startedAt)/2});
  assert.match(html,/跑尸中 · 返回尸体/);assert.match(html,/aria-valuenow="50"/);
  const alive=advance(recovering,recovering.wallAt+a.endsAt-recovering.clock).state;
  assert.ok(alive.hp>0);assert.equal(alive.activity.type,'idle');
  assert.doesNotMatch(render(alive),/跑尸中/);
 }
});
