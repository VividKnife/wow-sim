import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {createNpcMember} from '../src/rules/party.js';
import {raidConsumableChecks,useRaidConsumable} from '../src/rules/raid-consumables.js';
import {beginPartyBuffs,partyBuffTick,partyBuffCheckView} from '../src/rules/party-buffs.js';
import {stats,makeItem} from '../src/rules/character.js';
import {marketPrice} from '../src/rules/inventory.js';
import {restoreRaidMember} from '../src/rules/raid-recovery.js';
import {useBagItem,itemUseView} from '../src/rules/utility-actions.js';
import {weaponEnhancementStats} from '../src/rules/weapon-enhancement-stats.js';
import {weaponDamage} from '../src/rules/companion-combat.js';
import type {Rules} from '../src/model.ts';

function fixture(){
 const s:Rules=createGame('消耗品检查',620,0);s.level=60;s.dungeon={};s.learned=[];
 const c:Rules=createNpcMember(s,'priest',{role:'healer'});c.id='member';c.npcPlayer=true;c.learned=[];c.money=1000000000;c.bag=[];c.goldProfile={personality:'whale',consumableSpent:0,elixirsUsed:0};s.party=[c];
 return {s,c};
}
test('rebuff uses owned flasks before buying, charges only the member, and does not repeat',()=>{
 const {s,c}=fixture(),id=13511,price=marketPrice(id).buy,leaderMoney=s.money,beforeMana=stats(c).maxMana;
 c.bag=[makeItem(s,id,2)];const before=JSON.stringify(s);assert.equal(raidConsumableChecks(s,c)[0].status,'missing');assert.equal(JSON.stringify(s),before);
 beginPartyBuffs(s);partyBuffTick(s);
 assert.equal(c.bag[0].count,1);assert.equal(c.money,1000000000);assert.equal(stats(c).maxMana,beforeMana+2000);
 assert.equal(partyBuffCheckView(s)!.completedItems,1);partyBuffTick(s);assert.equal(s.activity.type,'idle');
 beginPartyBuffs(s);partyBuffTick(s);assert.equal(c.bag[0].count,1);
 s.clock=c.itemBuffs[0].until;c.bag=[];beginPartyBuffs(s);partyBuffTick(s);
 assert.equal(c.money,1000000000-price);assert.equal(c.goldProfile.consumableSpent,price);assert.equal(s.money,leaderMoney);
 c.hp=0;restoreRaidMember(c,s);assert.equal(stats(c).maxMana,beforeMana+2000);
});
test('missing supplies and insufficient funds remain visible and never block completion',()=>{
 const {s,c}=fixture();c.money=0;
 assert.equal(raidConsumableChecks(s,c)[0].status,'funds');assert.equal(raidConsumableChecks(s,s)[0].status,'materials');
 beginPartyBuffs(s);partyBuffTick(s);assert.equal(s.activity.type,'idle');assert.equal(c.money,0);
 const check=partyBuffCheckView(s)!;assert.ok(check.members[1].entries.some(e=>e.status==='funds'));assert.ok(check.missing>=2);
});
test('weapon checks cover both hands, preserve coatings and expire on weapon replacement',()=>{
 const {s,c}=fixture();c.classId=4;c.strategyPolicy={role:'melee'};c.equipment={16:makeItem(s,2092,1),17:makeItem(s,2092,1)};
 const checks=raidConsumableChecks(s,c).filter(r=>r.kind==='stone');assert.equal(checks.length,2);
 const base=stats(c).crit,wallet=c.money;
 for(const row of checks)assert.equal(useRaidConsumable(s,c,row),true);
 assert.ok(Math.abs(stats(c).crit-base-.04)<1e-9);assert.equal(c.money,wallet-2*marketPrice(18262).buy);
 assert.ok(raidConsumableChecks(s,c).filter(r=>r.kind==='stone').every(r=>r.status==='ready'));
 c.equipment[16]=makeItem(s,2092,1);assert.ok(Math.abs(stats(c).crit-base-.02)<1e-9);
 c.weaponEnchants[16]={spell:8679,until:s.clock+10000,weaponUid:c.equipment[16].uid,charges:10};
 assert.equal(useRaidConsumable(s,c,checks[0]),false);
 c.equipment[17].locked=true;c.weaponEnchants[17].until=s.clock;assert.equal(raidConsumableChecks(s,c).find(r=>r.slot===17)!.status,'materials');
});
test('flasks choose roles and manual use shares the same effects without stacking',()=>{
 const {s,c}=fixture();c.classId=8;c.strategyPolicy={role:'ranged'};
 const row=raidConsumableChecks(s,c)[0];assert.equal(row.itemId,13512);const base=stats(c).spellPower;
 useRaidConsumable(s,c,row);assert.equal(stats(c).spellPower,base+150);
 s.bag=[makeItem(s,13511,1),makeItem(s,13510,1)];const mana=stats(s).maxMana,hp=stats(s).maxHp;
 assert.equal(itemUseView(s,s.bag[0])!.canUse,true);useBagItem(s,s.bag[0].uid);assert.equal(stats(s).maxMana,mana+2000);
 s.clock+=3000;useBagItem(s,s.bag[0].uid);assert.equal(s.itemBuffs.length,1);assert.equal(stats(s).maxHp,hp+1200);
 c.level=49;assert.deepEqual(raidConsumableChecks(s,c),[]);
});
test('personality and buying power select two tiers and preserve active economy supplies',()=>{
 const {s,c}=fixture();c.goldProfile.personality='saver';c.talents={};c.raceId=4;
 let row=raidConsumableChecks(s,c)[0];assert.equal(row.itemId,13447);assert.equal(row.tier,'economy');
 const base=stats(c),money=c.money;assert.equal(useRaidConsumable(s,c,row),true);
 assert.equal(c.money,money-marketPrice(13447).buy);assert.equal(stats(c).int,base.int+18);assert.equal(stats(c).spi,base.spi+18);
 c.goldProfile.personality='whale';row=raidConsumableChecks(s,c)[0];assert.equal(row.itemId,13447);assert.equal(row.status,'ready');assert.equal(useRaidConsumable(s,c,row),false);
 c.itemBuffs=[];row=raidConsumableChecks(s,c)[0];assert.equal(row.tier,'premium');
 c.money=marketPrice(13511).buy;assert.equal(raidConsumableChecks(s,c)[0].tier,'economy');
 c.bag=[makeItem(s,13511,1)];c.money=0;assert.equal(raidConsumableChecks(s,c)[0].itemId,13511);
});
test('economy weapon stones add damage to their own weapon and expire',()=>{
 const {s,c}=fixture();c.goldProfile.personality='saver';c.classId=4;c.strategyPolicy={role:'melee'};
 c.equipment={16:makeItem(s,2092,1),17:makeItem(s,36,1)};
 const rows=raidConsumableChecks(s,c).filter(r=>r.kind==='stone');assert.equal(rows.length,2);
 assert.equal(rows[0].itemId,12404);assert.equal(rows[1].itemId,12643);
 const seed=s.rngState,base=weaponDamage(s,c);s.rngState=seed;
 useRaidConsumable(s,c,rows[0]);assert.equal(weaponDamage(s,c),base+8);
 assert.equal(weaponEnhancementStats(c,17,s.clock).weaponDamage,undefined);
 useRaidConsumable(s,c,rows[1]);assert.equal(weaponEnhancementStats(c,17,s.clock).weaponDamage,8);
 s.clock=c.weaponEnchants[16].until;c.time=s.clock;assert.equal(weaponEnhancementStats(c,16,s.clock).weaponDamage,undefined);
 c.hp=0;assert.ok(raidConsumableChecks(s,c).every(r=>r.status==='dead'));
});
