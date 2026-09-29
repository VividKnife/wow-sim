import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let directory,Panel;
before(async()=>{const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(web+'.buff-check-test-');await build({absWorkingDir:web,entryPoints:['app/party-buffs.tsx'],outfile:directory+'/panel.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});Panel=(await import(pathToFileURL(directory+'/panel.mjs').href)).PartyBuffOrder;});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const render=check=>renderToStaticMarkup(createElement(Panel,{state:{activity:{type:'partyBuffs'},hp:100,logs:[]},data:{partyBuffCheck:check},busy:false,send:async()=>true}));
test('active checklist renders member gaps, exact cast counts and meaningful reasons',()=>{
 const html=render({active:true,completed:0,remainingCasts:2,present:12,total:20,missing:5,lastCast:null,unavailable:[{name:'王者祝福'}],members:[{id:'hero',name:'团长',squad:1,missing:2,entries:[{name:'真言术：韧',status:'mana',reason:'艾琳 等待回蓝（300/3400）'},{name:'王者祝福',status:'unavailable',reason:'无存活成员掌握此增益'}]}]});
 for(const text of ['团长','真言术：韧','王者祝福','等待回蓝','剩余 2 次施法','已施放 0 次','待补 5 项','阵容暂无法补齐'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/待补 …/);assert.match(html,/aria-expanded="true"/);assert.match(html,/团队增益覆盖率/);
 assert.equal(html.split('王者祝福').length-1,1);assert.doesNotMatch(html,/无存活成员掌握此增益|详情见成员清单|缺 2 项/);assert.match(html,/缺 1 项/);
 const unavailableOnly=render({completed:0,remainingCasts:0,present:0,total:1,missing:0,unavailable:[{name:'王者祝福'}],members:[{id:'hero',name:'团长',squad:1,missing:1,entries:[{name:'王者祝福',status:'unavailable',reason:'无存活成员掌握此增益'}]}]});
 assert.match(unavailableOnly,/阵容暂无法补齐：王者祝福/);assert.doesNotMatch(unavailableOnly,/buff-check-member-title/);assert.match(unavailableOnly,/所有存活成员可由团队提供的增益均已齐全/);
});
test('missing inspection data shows a loading explanation instead of fake zero progress',()=>{
 const html=render(null);assert.match(html,/正在读取团队增益检查结果/);assert.doesNotMatch(html,/已施放 0/);
});
test('consumable tiers, funding gaps and item progress remain visible per member',()=>{
 const html=render({completed:1,remainingCasts:0,completedItems:2,remainingItems:1,present:2,total:4,missing:2,unavailable:[],members:[{id:'npc',name:'队员',squad:1,missing:2,entries:[{name:'先知药剂',status:'funds',tier:'economy',reason:'金币不足，需 2.00 金'},{name:'元素磨刀石（主手）',status:'missing',tier:'premium',reason:'按拍卖行价自费补充'}]}]});
 for(const text of ['经济补给','强化补给','金币不足','先知药剂','元素磨刀石（主手）','已用道具 2 件','剩余 1 件','缺 2 项'])assert.ok(html.includes(text),text);
});
