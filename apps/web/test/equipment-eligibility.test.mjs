import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view} from '../../../packages/game-domain/src/rules/engine.js';
import {addItem} from '../../../packages/game-domain/src/rules/character.js';

test('inventory exposes equipment restrictions before submitting an equip command',()=>{
 let s=createGame('装备检查',283,0);
 for(const id of [6070,1376,25])addItem(s,id);
 const wrist=s.bag.find(i=>i.id===6070),cloak=s.bag.find(i=>i.id===1376),sword=s.bag.find(i=>i.id===25);
 const actions=view(s).inventoryActions;
 assert.equal(actions[wrist.uid].equippable,false);
 assert.match(actions[wrist.uid].equipBlockedReason,/职业、等级或熟练度/);
 assert.equal(actions[sword.uid].equippable,false);
 assert.equal(actions[cloak.uid].equippable,true);
 assert.equal(actions[cloak.uid].equipBlockedReason,'');
 assert.throws(()=>act(s,{type:'equip',uid:wrist.uid},0),/无法装备/);
 s=act(s,{type:'equip',uid:cloak.uid},0);
 assert.equal(s.equipment[15].uid,cloak.uid);
});

test('equipment owned by someone outside the party is unavailable to the player',()=>{
 const s=createGame('归属检查',283,0);addItem(s,1376);
 const cloak=s.bag.find(i=>i.id===1376);cloak.bound=true;cloak.ownerId='companion-mage';
 const action=view(s).inventoryActions[cloak.uid];
 assert.equal(action.equippable,false);assert.match(action.equipBlockedReason,/不属于可共享的队员/);
 assert.throws(()=>act(s,{type:'equip',uid:cloak.uid},0),/无法装备/);
});

test('an offhand item cannot replace a two-handed weapon through the default equip action',()=>{
 const s=createGame('副手检查',283,0);s.level=20;addItem(s,1131);
 const orb=s.bag.find(i=>i.id===1131),action=view(s).inventoryActions[orb.uid];
 assert.equal(action.equippable,false);assert.match(action.equipBlockedReason,/双手武器/);
 assert.throws(()=>act(s,{type:'equip',uid:orb.uid},0),/双手武器/);
});

 test('bound equipment from a present companion is available to the player',()=>{
 const s=createGame('共享检查',283,0);addItem(s,1376);
 const member=createGame('队友',284,0);member.id='companion-mage';member.party=[];s.party=[member];
 const cloak=s.bag.find(i=>i.id===1376);cloak.bound=true;cloak.ownerId=member.id;
 assert.equal(view(s).inventoryActions[cloak.uid].equippable,true);
 const result=act(s,{type:'equip',uid:cloak.uid},0);
 assert.equal(result.equipment[15].uid,cloak.uid);
 assert.equal(result.equipment[15].ownerId,s.id);
 });
