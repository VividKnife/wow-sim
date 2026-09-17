import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view} from '../../../packages/game-domain/src/rules/engine.js';

test('nearby NPCs separate the quest giver from the turn-in NPC',()=>{
 let s=createGame('交谈',42,0),d=view(s);
 assert.ok(d.interactions?.some(n=>n.entry===823&&n.accepts.includes(783)));
 s=act(s,{type:'accept',id:783},0);d=view(s);
 assert.ok(d.interactions.some(n=>n.entry===197&&n.turnIns.includes(783)));
 assert.ok(!d.interactions.find(n=>n.entry===823)?.turnIns.includes(783));
});

test('merchant stock and class training are exposed through local service interactions',()=>{
 const d=view(createGame('服务',42,0));
 assert.ok(d.interactions?.some(n=>n.roles.includes('trainer')));
 const vendors=d.interactions?.filter(n=>n.roles.includes('shop'))||[];
 assert.ok(vendors.length>0);assert.ok(vendors.every(n=>n.stockIds.length>0));
});

test('every available shop item remains accessible through a nearby service',()=>{
 for(const location of ['northshire','goldshire','stormwind']){
  const s=createGame('库存',42,0);s.location=location;const d=view(s),ids=new Set(d.interactions.flatMap(n=>n.stockIds));
  for(const item of d.shop)assert.ok(ids.has(item.id),`${location}: missing ${item.id}`);
 }
});
