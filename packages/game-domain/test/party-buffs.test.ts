import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,act} from '../src/rules/engine.js';
import {createNpcMember,roles} from '../src/rules/party.js';
import {beginPartyBuffs} from '../src/rules/party-buffs.js';
import {stats} from '../src/rules/character.js';
import {spells} from '../src/rules/catalog.js';
import {drinkPotion} from '../src/rules/consumables.js';
import {prepareGoldNpc,goldNpcTick} from '../src/rules/gold-raid-npcs.js';
import {restoreRaidMember} from '../src/rules/raid-recovery.js';
import type {Rules} from '../src/model.ts';
function fixture(){
 const s:Rules=createGame('补给测试',9101,0);s.level=60;
 s.party=[5,8,11,2,2].map((classId,index)=>{const c=createNpcMember(s,roles.find(r=>r.classId===classId)!.id,{role:classId===8?'ranged':'healer'});c.id='buff-'+index;return c;});
 // Kings is a talent: only the assigned paladin has it.
 s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.party[3].learned.push(20217);s.goldRaid={active:true,phase:'camp',auctions:[],rules:{supportBonus:10,dpsBonus:10}};
 return s;
}
test('real potions restore one resource and share item-template two-minute cooldown across recovery',()=>{
 const s=fixture(),c=s.party[0];c.hp=1;c.mana=0;
 assert.equal(drinkPotion(s,c,13446),true);assert.ok(c.hp>=1051&&c.hp<=1751);assert.equal(c.mana,0);
 assert.equal(drinkPotion(s,c,13444),false);restoreRaidMember(c,s);c.mana=0;
 s.clock=119999;assert.equal(drinkPotion(s,c,13444),false);
 s.clock=120000;assert.equal(drinkPotion(s,c,13444),true);assert.ok(c.mana>=1350&&c.mana<=2250);
});
test('NPC purchases real named supplies from its wallet and keeps cooldown on another pull',()=>{
 const s=fixture(),c=s.party[0];c.goldNpc=true;c.money=100000;c.goldProfile={skill:'expert',personality:'value',consumableSpent:0,potionsUsed:0,elixirsUsed:0};
 const before=stats(c).maxHp;prepareGoldNpc(s,c);assert.equal(stats(c).maxHp,before+120);assert.equal(c.itemBuffs[0].item,3825);
 c.hp=1;c.mana=0;goldNpcTick(s,[c]);assert.equal(c.goldProfile.potionsUsed,1);assert.equal(c.mana,0);assert.equal(c.money+c.goldProfile.consumableSpent,100000);
 prepareGoldNpc(s,c);goldNpcTick(s,[c]);assert.equal(c.goldProfile.potionsUsed,1);assert.equal(c.goldProfile.elixirsUsed,1);
});
test('buff order casts learned ranks with mana/GCD, assigns complementary blessings, persists and survives pull preparation',()=>{
 let s=fixture();const base=stats(s);beginPartyBuffs(s);
 s=advance(s,100).state;assert.equal(s.activity.type,'partyBuffs');assert.equal(s.activity.completed,1);
 s=JSON.parse(JSON.stringify(s));s=advance(s,600000,{stopWhen:(state:Rules)=>state.activity.type==='idle'}).state;
 assert.equal(s.activity.type,'idle',JSON.stringify(s.activity));
 for(const c of [s,...s.party]){
  const names=(c.classBuffs||[]).map((b:Rules)=>spells[b.spell].SpellName);
  assert.ok(names.includes('Power Word: Fortitude'),c.name);assert.ok(names.includes('Mark of the Wild'));
  assert.ok(names.includes('Blessing of Kings'));assert.ok(names.includes('Blessing of Wisdom'));
  assert.equal(new Set(c.classBuffs.filter((b:Rules)=>b.name.startsWith('Blessing')).map((b:Rules)=>b.caster)).size,2);
  assert.ok(c.buffs.int);
 }
 assert.ok(stats(s).sta>base.sta);assert.ok(stats(s).int>base.int);
 const before=stats(s);restoreRaidMember(s,s);assert.equal(stats(s).sta,before.sta);assert.equal(stats(s).int,before.int);
 const casts=s.logs.filter((l:Rules)=>l.kind==='buff').length;beginPartyBuffs(s);s=advance(s,s.wallAt+200).state;
 assert.equal(s.activity.type,'idle');assert.ok(s.logs.filter((l:Rules)=>l.kind==='buff').length<=casts+2);
});
test('orders require a stopped instance and block a pull until completed or stopped',()=>{
 const s:Rules=createGame('命令校验',9211,0);assert.throws(()=>beginPartyBuffs(s),/副本/);
 const g=fixture();beginPartyBuffs(g);assert.throws(()=>act(g,{type:'goldStart',bossId:'lucifron'},0),/补 Buff/);
 g.combat={};assert.throws(()=>beginPartyBuffs(g),/副本/);
});

test('five-player dungeon dispatch accepts the same order and pauses automatic progression',()=>{
 const s:Rules=createGame('地下城指挥',9311,0);s.dungeon={autoAdvance:true};
 const next=act(s,{type:'partyBuffs'},0);assert.equal(next.activity.type,'partyBuffs');assert.equal(next.dungeon.autoAdvance,false);
});
