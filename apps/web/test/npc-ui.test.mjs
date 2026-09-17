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
 await build({absWorkingDir:web,stdin:{contents:"export {default as Hud} from './app/player-hud'; export {default as World} from './app/world'; export {NpcConversation} from './app/local-npcs';",resolveDir:web,loader:'tsx'},outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});components=await import(pathToFileURL(bundle).href);
});
after(async()=>{if(bundle)await unlink(bundle);if(directory)await rmdir(directory);});
const props=s=>({state:s,data:{...clientContent(),...view(s)},busy:false,send:async()=>true});
const render=(component,p)=>renderToStaticMarkup(createElement(component,p));
test('world has clickable NPCs but no accept, purchase or training action before conversation',()=>{
 const html=render(components.World,props(createGame('勇士',42,0)));
 assert.match(html,/附近人物/);assert.match(html,/<button[^>]*class="npc-card"/);assert.match(html,/任务日志/);
 assert.doesNotMatch(html,/>接受任务</);assert.doesNotMatch(html,/>[^<]*· 购买</);assert.doesNotMatch(html,/id="local-shop"/);
 assert.match(html,/<details class="panel travel-toolbox">/);
});
test('quest interaction changes from giver to the proper turn-in NPC',()=>{
 let s=createGame('勇士',42,0),p=props(s),npc=p.data.interactions.find(n=>n.entry===823);
 assert.match(render(components.NpcConversation,{...p,npc}),/>接受任务</);
 s=act(s,{type:'accept',id:783},0);p=props(s);npc=p.data.interactions.find(n=>n.entry===197);
 assert.match(render(components.NpcConversation,{...p,npc}),/>完成任务</);
});
test('trainer and merchant conversation render their scoped services',()=>{
 const p=props(createGame('勇士',42,0));
 const trainer=p.data.interactions.find(n=>n.roles[0]==='trainer');
 assert.match(render(components.NpcConversation,{...p,npc:trainer}),/学习/);
 const merchant=p.data.interactions.find(n=>n.roles[0]==='shop');
 const html=render(components.NpcConversation,{...p,npc:merchant});assert.match(html,/购买/);
 const stock=p.data.shop.filter(i=>merchant.stockIds.includes(i.id));assert.ok(stock.length);assert.ok(html.includes(stock[0].name));
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
