import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {itemView} from '../../../packages/game-domain/src/rules/client-content.js';
let directory,bundle,Tooltip;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(web+'.item-tooltip-test-');bundle=directory+'/tooltip.mjs';
 await build({absWorkingDir:web,entryPoints:['app/game-ui.tsx'],outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 Tooltip=(await import(pathToFileURL(bundle).href)).ItemTooltip;
});
after(async()=>{if(bundle)await unlink(bundle);if(directory)await rmdir(directory);});
test('original set tooltip renders the class restriction, all eight pieces and bonuses',()=>{
 const html=renderToStaticMarkup(createElement(Tooltip,{item:itemView(16800),auction:true}));
 assert.match(html,/奥术师便鞋/);assert.match(html,/职业：法师/);assert.match(html,/奥术师（8 件）/);
 for(const n of [3,5,8])assert.match(html,new RegExp(`\\(${n}\\) 套装：`));
 assert.match(html,/奥术师衬肩/);assert.doesNotMatch(html,/非套装装备|没有套装加成/);
});
test('non-set legendary material does not claim set membership or equipment stats',()=>{
 const html=renderToStaticMarkup(createElement(Tooltip,{item:itemView(17204),auction:true}));
 assert.match(html,/萨弗拉斯之眼/);assert.match(html,/quality-5/);assert.doesNotMatch(html,/套装：|点护甲|classic-item-set/);
});
