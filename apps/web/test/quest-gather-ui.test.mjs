import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

let ActivityProgress,directory;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));
 directory=await mkdtemp(join(web,'.quest-gather-ui-test-'));
 const bundle=join(directory,'component.mjs');
 await build({absWorkingDir:web,entryPoints:['app/activity-progress.tsx'],outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 ActivityProgress=(await import(pathToFileURL(bundle).href)).default;
});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

test('quest gathering displays collection and search bars with their actual durations',()=>{
 for(const quartz of [false,true])for(const [target,label,duration] of [[3640,'采集中',3000],[null,'寻找中',10000]]){
  const state={clock:0,activity:{type:'gather',target,startedAt:0,endsAt:duration}};
  const html=renderToStaticMarkup(createElement(ActivityProgress,{state,data:{},running:false,quartz}));
  assert.match(html,new RegExp(`aria-label="${label}"`));
  assert.ok(html.includes((duration/1000).toFixed(1)));
  assert.doesNotMatch(html,/刷新/);
 }
});
