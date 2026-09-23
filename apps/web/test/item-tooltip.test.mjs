import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {itemView} from '../../../packages/game-domain/src/rules/client-content.js';
let directory,bundle,Tooltip,Item;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(web+'.item-tooltip-test-');bundle=directory+'/tooltip.mjs';
 await build({absWorkingDir:web,entryPoints:['app/game-ui.tsx'],outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 const ui=await import(pathToFileURL(bundle).href);Tooltip=ui.ItemTooltip;Item=ui.Item;
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
test('item rows show the icon and name without expanded attributes or stack text',()=>{
 const html=renderToStaticMarkup(createElement(Item,{item:itemView(16800),instance:{count:3,durability:0,bound:true},details:'掉落率 12%'}));
 assert.match(html,/奥术师便鞋/);assert.match(html,/<img/);assert.match(html,/tabindex="0"/);
 assert.doesNotMatch(html,/<details|<summary|点护甲|需要等级|耐久度|已绑定|掉落率|×3|数量：3/);
});
test('shared tooltip preserves instance status, enchantment and contextual details',()=>{
 const html=renderToStaticMarkup(createElement(Tooltip,{item:itemView(16800),instance:{count:3,durability:0,bound:true,locked:true,enchant:'test',enchantDescription:'附魔：次级速度'},details:'掉落率 12%'}));
 for(const text of ['数量：3','已绑定','已锁定','已损坏','耐久度 0 /','附魔：次级速度','掉落率 12%'])assert.ok(html.includes(text),text);
});
