import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createGame,act,advance,view} from '../../../packages/game-domain/src/rules/engine.js';
import {makeItem,bagCapacity} from '../../../packages/game-domain/src/rules/character.js';
let Component,directory,bundle;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(join(web,'.hunt-ui-test-'));bundle=join(directory,'component.mjs');
 await build({absWorkingDir:web,entryPoints:['app/journey-activity.tsx'],outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 Component=(await import(pathToFileURL(bundle).href)).default;
});
after(async()=>{if(bundle)await unlink(bundle);if(directory)await rmdir(directory);});
const render=s=>renderToStaticMarkup(createElement(Component,{state:s,data:view(s),busy:false,send:async()=>true,activityLabel:'狩猎已暂停',onObserve:()=>{},onOpenBag:()=>{}}));
test('noncombat pause renders the reason, capacity, pending loot and recovery actions',()=>{
 let s=createGame('暂停界面',1,0);s=act(s,{type:'hunt',id:299},0);
 while(s.bag.length<bagCapacity(s))s.bag.push(makeItem(s,25));s.pending=[makeItem(s,25)];
 s=advance(s,100).state;const html=render(s);
 for(const text of ['因背包满暂停','待拾取 1 组','整理背包 / 丢弃灰色物品','拾取战利品','自动恢复原目标','停止狩猎'])assert.ok(html.includes(text),text);
});
test('combat stop is enabled during a hunt and renders the queued state after the command',()=>{
 let s=createGame('停止界面',1,0);s=act(s,{type:'hunt',id:299},0);s=advance(s,100).state;
 let html=render(s);assert.match(html,/<button(?![^>]* disabled=)[^>]*>本场结束后停止<\/button>/);
 s=act(s,{type:'stop'},s.wallAt);html=render(s);assert.match(html,/<button[^>]* disabled=""[^>]*>已排队：本场结束后停止<\/button>/);
});
