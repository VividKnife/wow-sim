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
});
