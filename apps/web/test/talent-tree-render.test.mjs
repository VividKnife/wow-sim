import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {classTalentTrees,talents} from '../../../packages/game-domain/src/rules/catalog.js';
let directory,Tree;
const web=fileURLToPath(new URL('../',import.meta.url));
before(async()=>{directory=await mkdtemp(web+'.talent-test-');await build({absWorkingDir:web,entryPoints:['app/talent-tree.tsx'],outfile:directory+'/tree.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});Tree=(await import(pathToFileURL(directory+'/tree.mjs').href)).default;});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const render=(trees,nodes,available=51)=>renderToStaticMarkup(createElement(Tree,{title:'天赋',trees,nodes,available,busy:false,onLearn:()=>{}}));
test('all 27 trees render every source node, dependency and local background',async()=>{
 for(const tree of classTalentTrees){
  const nodes=Object.values(talents).filter(t=>t.tree===tree.id).map(t=>({...t,rank:0,canLearn:t.row===0}));
  const html=render([tree],nodes);
  assert.equal((html.match(/class="classic-talent-node /g)||[]).length,nodes.length,tree.name);
  for(const node of nodes)for(const prerequisite of node.prerequisites||[])assert.ok(html.includes(`data-prerequisite="${prerequisite.talentId}-${node.id}"`),`${tree.name}: ${node.id}`);
  const backgrounds=[...html.matchAll(/url\((\/interface\/classic\/talentframe\/[^)]+)\)/g)].map(m=>m[1]);
  assert.equal(backgrounds.length,4,tree.name);for(const url of backgrounds)await access(web+'public'+url);
  assert.doesNotMatch(html,/<select|<option|NaN|undefined/);
 }
});
test('earned, maximum and locked ranks retain distinct states with accessible names',()=>{
 const tree={id:1,name:'武器'},base={tree:1,row:0,requiredTreePoints:0,maxRank:3,prerequisites:[]};
 const html=render([tree],[{...base,id:1,col:0,name:'部分投入',rank:2,canLearn:true},{...base,id:2,col:1,name:'已点满',rank:3,canLearn:false},{...base,id:3,col:2,name:'未解锁',rank:0,canLearn:false}],1);
 assert.match(html,/classic-talent-node available/);assert.match(html,/classic-talent-node maxed/);assert.match(html,/classic-talent-node locked/);
 for(const [name,rank] of [['部分投入',2],['已点满',3],['未解锁',0]])assert.ok(html.includes(`${name}，等级 ${rank}/3`));
 assert.match(html,/剩余天赋点数/);assert.match(html,/已分配 5 点/);
});
