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
import {clientContent} from '../../../packages/game-domain/src/rules/client-content.js';
let components,directory,bundle;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(join(web,'.npc-ui-test-'));bundle=join(directory,'component.mjs');
 await build({absWorkingDir:web,stdin:{contents:"export {default as Hud} from './app/player-hud'; export {default as World} from './app/world'; export {default as LocalNpcs,NpcConversation,NpcPortrait,QuestConversation} from './app/local-npcs';",resolveDir:web,loader:'tsx'},outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});components=await import(pathToFileURL(bundle).href);
});
after(async()=>{if(bundle)await unlink(bundle);if(directory)await rmdir(directory);});
const props=s=>({state:s,data:{...clientContent(),...view(s)},busy:false,send:async()=>true});
const render=(component,p)=>renderToStaticMarkup(createElement(component,p));
test('NPCs and monster cards display full-body model images',async()=>{
 const p=props(createGame('贴图',42,0)),html=render(components.World,p);
 assert.equal((html.match(/creature-portrait monster-portrait/g)||[]).length,p.data.monsters.length);
 for(const npc of p.data.interactions.filter(n=>n.entry)){
  const markup=render(components.NpcPortrait,{npc});
  assert.match(markup,/\/creatures\//);
  assert.doesNotMatch(markup,/<svg/);
 }
});
test('world has clickable NPCs but no accept, purchase or training action before conversation',()=>{
 const html=render(components.World,props(createGame('勇士',42,0)));
 assert.match(html,/附近人物/);assert.match(html,/<button[^>]*class="npc-card"/);assert.match(html,/任务日志/);
 assert.doesNotMatch(html,/>接受任务</);assert.doesNotMatch(html,/>[^<]*· 购买</);assert.doesNotMatch(html,/id="local-shop"/);
 assert.match(html,/<details class="panel travel-toolbox">/);
});
test('nearby people shows all five category tabs and city service NPCs',()=>{
 const s=createGame('旅人',42,0);s.location='stormwind';
 const p=props(s),merchant=p.data.interactions.find(n=>n.roles.includes('shop'));
 assert.ok(merchant);
 const html=render(components.LocalNpcs,p);
 assert.match(html,/aria-label="人物分类"/);
 for(const label of ['全部','任务','训练师','商人','旅店'])assert.match(html,new RegExp(`>${label}<\\/button>`));
 assert.match(html,new RegExp(merchant.name));
 for(const [entry,label] of [[1303,'草药商'],[1257,'材料商'],[6740,'旅店老板'],[1289,'武器商'],[1291,'护甲商']]){
  const npc=p.data.interactions.find(n=>n.entry===entry);
  assert.equal(npc.merchantType,label);
  assert.ok(html.includes(`<strong>${npc.name}</strong><small>${label}</small>`));
 }
 assert.doesNotMatch(html,/旅店老板 · 旅店老板/);
});
test('NPC quest exclamation turns green at five levels below the player',()=>{
 const p=props(createGame('勇士',42,0));p.state.level=10;
 const npc={key:'test-giver',name:'任务发布者',roles:['quests'],accepts:[1],turnIns:[]};
 p.data.interactions=[npc];p.data.quests=[{id:1,level:6}];
 assert.match(render(components.LocalNpcs,p),/class="quest-mark">!<\/span>/);
 p.data.quests=[{id:1,level:5}];
 assert.match(render(components.LocalNpcs,p),/class="quest-mark low-level">!<\/span>/);
 p.data.interactions=[{...npc,accepts:[1,2]}];p.data.quests.push({id:2,level:6});
 assert.match(render(components.LocalNpcs,p),/class="quest-mark">!<\/span>/);
 p.data.interactions=[{...npc,turnIns:[3]}];p.data.quests.push({id:3,level:5,complete:false});
 assert.match(render(components.LocalNpcs,p),/class="quest-mark incomplete">\?<\/span>/);
});
test('quest interaction changes from giver to the proper turn-in NPC',()=>{
 let s=createGame('勇士',42,0),p=props(s),npc=p.data.interactions.find(n=>n.entry===823);
 assert.match(render(components.NpcConversation,{...p,npc}),/>接受任务</);
 s=act(s,{type:'accept',id:783},0);p=props(s);npc=p.data.interactions.find(n=>n.entry===197);
 assert.match(render(components.NpcConversation,{...p,npc}),/>完成任务</);
});
test('completed quest choices are directly selectable from their item rows',()=>{
 const p=props(createGame('勇士',42,0));
 const quest={id:999,name:'奖励选择',level:2,description:'选择一件奖励。',objectives:[],xp:170,money:0,rewards:[],choices:[{id:80,count:1},{id:79,count:1}],canAccept:false,complete:true};
 const html=render(components.QuestConversation,{...p,quest});
 assert.match(html,/role="radiogroup" aria-label="选择一件任务奖励"/);
 assert.equal((html.match(/type="radio"/g)||[]).length,2);
 assert.match(html,/class="reward-option"/);
 assert.match(html,/点击选择/);
 assert.doesNotMatch(html,/<select/);
 assert.match(html,/<button[^>]*disabled[^>]*>完成任务</);
});
test('trainer and merchant conversation render their scoped services',()=>{
 const p=props(createGame('勇士',42,0));
 const trainer=p.data.interactions.find(n=>n.roles[0]==='trainer');
 assert.match(render(components.NpcConversation,{...p,npc:trainer}),/学习/);
 const merchant=p.data.interactions.find(n=>n.roles[0]==='shop');
 const html=render(components.NpcConversation,{...p,npc:merchant});assert.match(html,/购买/);
 const stock=p.data.shop.filter(i=>merchant.stockIds.includes(i.id));assert.ok(stock.length);assert.ok(html.includes(stock[0].name));
});
test('flight masters appear among nearby people and own flight point interactions',()=>{
 for(const [location,entry] of [['stormwind',352],['sentinel',523]]){
  const s=createGame('旅人',42,0);s.location=location;const p=props(s);
  const npc=p.data.interactions.find(n=>n.entry===entry);
  assert.ok(npc);assert.ok(npc.roles.includes('flight'));
  assert.match(render(components.World,p),new RegExp(npc.name));
  const html=render(components.NpcConversation,{...p,npc});
  assert.match(html,/发现飞行点/);assert.match(html,/需要先发现两端飞行点/);
 }
});
test('public snapshot keeps NPC interactions and HUD shows current resource values',()=>{
 const s=createGame('勇士',42,0),d=view(s),snapshot=projectClientSnapshot(s,d);
 assert.ok(snapshot.view.interactions.length);
 const html=render(components.Hud,{state:snapshot.player,data:{...d,...snapshot.view}});
 assert.match(html,/aria-label="玩家状态"/);assert.match(html,/aria-label="生命/);assert.match(html,/aria-label="法力/);assert.match(html,/aria-label="经验/);assert.match(html,/勇士/);
});

test('inn conversation offers hearth binding and recovery only after interaction',()=>{
 const s=createGame('旅人',42,0);s.location='goldshire';const p=props(s),npc=p.data.interactions.find(n=>n.roles.includes('inn'));
 assert.ok(npc);const html=render(components.NpcConversation,{...p,npc:{...npc,roles:['inn']}});
 assert.match(html,/将炉石绑定在这里/);assert.match(html,/自然恢复生命与法力/);
});
test('traveling locks conversation actions until arrival',()=>{
 const s=act(createGame('旅人',42,0),{type:'travel',to:'goldshire'},0),p=props(s),npc=p.data.interactions.find(n=>n.entry===823);
 const html=render(components.NpcConversation,{...p,npc});assert.match(html,/抵达并脱离战斗/);assert.match(html,/<button[^>]*disabled[^>]*>接受任务</);
});

test('quest conversation shows full localized narrative, objectives and reward quantities',()=>{
 for(const [gender,salutation] of [['male','亲爱的先生'],['female','尊贵的女士']]){
  const s=createGame('旅人',42,0,{gender});s.location='goldshire';s.level=4;
  const p=props(s),quest=p.data.quests.find(q=>q.id===60);
  assert.ok(quest);assert.ok(quest.details.includes(salutation));
  assert.doesNotMatch(quest.details,/\$[gG]/);
  const html=render(components.QuestConversation,{...p,quest});
  assert.match(html,/最低接受等级 3/);
  assert.ok(html.includes(quest.details.split('\n').filter(Boolean)[1]));
  assert.ok(html.includes(quest.description));
  assert.match(html,/class="quest-reward-count">×5</);
 }
});

test('quest log exposes the confirmed green-quest batch action and marks matching titles',()=>{
 const s=createGame('绿色任务',42,0);s.level=27;
 s.quests[166]={kills:{},event:false};s.quests[168]={kills:{},event:false};
 const p={...props(s),surface:'quests'};
 const html=render(components.World,p);
 assert.match(html,/一键放弃绿色任务（2）/);
 assert.equal((html.match(/quest-low-level-title/g)||[]).length,2);
 s.level=22;
 const lower=render(components.World,{...props(s),surface:'quests'});
 assert.match(lower,/<button[^>]*disabled[^>]*>一键放弃绿色任务（0）/);
});

test('quest navigation becomes an enabled NPC conversation at the receiver',()=>{
 const s=createGame('直接交谈',42,0);s.level=30;s.location='sentinel';s.completed[155]=1;
 s.quests[166]={kills:{},event:false};s.bag.push({uid:'head',id:3637,count:1});
 const html=render(components.World,{...props(s),surface:'quests'});
 const button=html.match(/<button[^>]*>与 治安官格里安·斯托曼 交谈<\/button>/)?.[0];
 assert.ok(button);assert.doesNotMatch(button,/ disabled(?:=|\s|>)/);
 s.activity={type:'travel'};
 const traveling=render(components.World,{...props(s),surface:'quests'});
 assert.doesNotMatch(traveling,/>与 治安官格里安·斯托曼 交谈</);
});
