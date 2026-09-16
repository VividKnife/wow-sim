import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,act,view} from '../lib/game/engine.js';

test('new saves initialize storage and professions before their first simulation',()=>{
 const s=createGame('新角色',283,0),original=JSON.stringify(s);
 assert.deepEqual(s.auctions,[]);assert.deepEqual(s.bank,[]);assert.deepEqual(s.professions,{});
 assert.deepEqual(s.mounts,[]);assert.deepEqual(s.riding,{});assert.ok(s.potions);
 const continued=act(s,{type:'sync'},0);assert.deepEqual(continued,s);
 assert.equal(JSON.stringify(s),original);assert.ok(view(s).professions.length>0);
});

test('current save round trips preserve storage, professions and potion preferences',()=>{
 const s=createGame('工匠角色',283,0);
 s.professions={alchemy:{skill:52,cap:150}};s.bankUpgrades=2;s.potions={enabled:false,health:22};
 const result=advance(s,0).state;
 assert.deepEqual(result.professions,s.professions);assert.equal(result.bankUpgrades,2);assert.deepEqual(result.potions,s.potions);
});

test('new mage companions retain their learned skills on a save round trip',()=>{
 let s=createGame('小队检查',283,0);s.level=18;s=act(s,{type:'recruit',id:'mage'},0);
 assert.equal(s.party[0].learned.length,new Set(s.party[0].learned).size);
 const learned=[...s.party[0].learned];s=advance(s,0).state;
 assert.deepEqual(s.party[0].learned,learned);
});
