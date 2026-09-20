import {recruitForTest} from './support/party-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,view} from '../../../packages/game-domain/src/rules/engine.js';
import {dungeonRoute as routeFor} from '../../../packages/game-domain/src/rules/dungeon.js';
const dungeonRoute=routeFor('deadmines');
import {addItem,bagCapacity,countItem,makeItem} from '../../../packages/game-domain/src/rules/character.js';
import {resurrectionFor} from '../../../packages/game-domain/src/rules/recovery.js';

function group(){
 let s=createGame('连续推进',283,0);s.level=20;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 s.completed[900001]=true;s.location='stormwind';
 for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},0);
 s.location='deadmines';s.settings.autoLoot=true;
 return act(s,{type:'enterDungeon'},0);
}
const step=(s,ms=100)=>advance(s,s.wallAt+ms).state;
// Controlled victory fixtures isolate orchestration from combat balance.
function victory(s){for(const e of s.combat.enemies){e.hp=0;e.rewarded=true;}s.combat.pull.startsAt=s.clock;s.combat.pull.engagedAt=s.clock;return step(s);}
function atRoute(s,id){s.dungeon.cursor=dungeonRoute.findIndex(e=>e.id===id);const e=dungeonRoute[s.dungeon.cursor];if(e.activation?.afterDeathEntry)s.dungeon.defeatedBosses[e.activation.afterDeathEntry]=true;if(e.activation?.afterInteraction)s.dungeon.interactions[e.activation.afterInteraction]=true;return e;}

test('one command chains real encounters and automatically loots without client commands',()=>{
 let s=act(group(),{type:'dungeonNext'},0),pulls=1,last=s.combat.id;
 for(let i=0;i<180&&pulls<2;i++){
  s=step(s,1000);
  if(!s.combat)assert.equal(s.pending.length,0);
  if(s.combat&&s.combat.id!==last){pulls++;last=s.combat.id;}
 }
 assert.equal(pulls,2);assert.ok(s.totals.kills>=2);assert.equal(s.dungeon.cursor,1);
 assert.equal(s.combat.pull.startsAt,s.combat.startedAt+3000);
});

test('automatic dungeon loot is collected before starting the next encounter',()=>{
 let s=act(group(),{type:'dungeonNext'},0);const first=s.combat.id;
 const drop={...makeItem(s,2589,2),lootBattleId:first};s.pending.push(drop);
 s=victory(s);
 assert.equal(s.pending.length,0);assert.ok(s.bag.some(i=>i.uid===drop.uid));
 for(let i=0;i<180&&!s.combat;i++)s=step(s,1000);
 assert.ok(s.combat);assert.notEqual(s.combat.id,first);assert.equal(s.dungeon.autoAdvance,true);
});

test('a fallen priest disarms during combat and healing cannot silently restart it',()=>{
 let s=act(group(),{type:'dungeonNext'},0);const id=s.combat.id,priest=s.party.find(c=>c.classId===5);priest.hp=0;s=step(s);
 assert.equal(s.dungeon.autoAdvance,false);assert.equal(s.combat.id,id);assert.match(view(s).dungeon.advanceReason,/复活/);
 s.party.find(c=>c.id===priest.id).hp=stats(priest).maxHp;s=victory(s);s=step(s,1000);
 assert.equal(s.combat,null);assert.equal(s.dungeon.cursor,1);
 s=act(s,{type:'dungeonNext'},s.wallAt);assert.equal(s.dungeon.autoAdvance,true);assert.ok(s.combat);assert.equal(s.dungeon.advanceReason,'');
});

test('a living priest resurrects a fallen ally after combat with the real cast and mana cost',()=>{
 let s=act(group(),{type:'dungeonNext'},0);const target=s.party[0].id,priest=s.party.find(c=>c.classId===5);
 s.party[0].hp=0;s=step(s);assert.equal(s.dungeon.autoAdvance,true);assert.equal(s.activity.type,'idle');assert.ok(s.combat);
 s=victory(s);const {info}=resurrectionFor(s,target,priest.id),caster=s.party.find(c=>c.id===priest.id),mana=caster.mana;
 assert.equal(s.activity.type,'resurrect');assert.equal(s.activity.caster,priest.id);assert.equal(s.activity.target,target);
 assert.equal(s.activity.endsAt-s.activity.startedAt,info.castMs);assert.equal(view(s).dungeon.rescuing,true);
 // Isolate spell payment from passive regeneration during this cast.
 s.nextRegen=s.activity.endsAt+2000;const end=s.activity.endsAt;
 s=advance(s,end-1).state;assert.equal(s.party.find(c=>c.id===target).hp,0);
 s=advance(s,end).state;assert.ok(s.party.find(c=>c.id===target).hp>0);assert.equal(s.party.find(c=>c.id===priest.id).mana,mana-info.mana);
 for(let i=0;i<240&&!s.combat;i++)s=step(s,1000);
 assert.ok(s.combat);assert.equal(s.dungeon.cursor,1);assert.equal(s.dungeon.autoAdvance,true);
});

test('a dead leader and several allies are resurrected one at a time before the next pull',()=>{
 let s=act(group(),{type:'dungeonNext'},0);s.hp=0;s.party[0].hp=0;s.party[2].hp=0;
 s=victory(s);assert.equal(s.activity.type,'resurrect');assert.equal(s.activity.target,s.id);
 for(let i=0;i<360&&!s.combat;i++)s=step(s,1000);
 assert.ok(s.combat);assert.ok([s,...s.party].every(c=>c.hp>0));assert.equal(s.dungeon.autoAdvance,true);
 assert.equal(s.logs.filter(l=>l.text.includes('接受复活')).length,3);
 assert.equal(s.logs.some(l=>l.text.includes('返回尸体')),false);
});

test('an out-of-mana priest recovers for resurrection even above the normal recovery threshold',()=>{
 let s=act(group(),{type:'dungeonNext'},0);s.party[0].hp=0;const priest=s.party.find(c=>c.classId===5);priest.mana=0;
 s.settings.mana=1;const water=s.totals.water;s=victory(s);
 assert.equal(s.activity.type,'idle');assert.equal(s.dungeon.autoAdvance,true);assert.equal(view(s).dungeon.rescuing,true);
 assert.ok(s.party.find(c=>c.id===priest.id).rest);assert.ok(s.totals.water>water);
 for(let i=0;i<240&&s.activity.type!=='resurrect';i++)s=step(s,1000);
 assert.equal(s.activity.type,'resurrect');assert.equal(s.dungeon.autoAdvance,true);
});

test('a wipe pauses without automatically running back to corpses',()=>{
 let s=act(group(),{type:'dungeonNext'},0);for(const c of [s,...s.party])c.hp=0;s=step(s,4000);
 assert.equal(s.dungeon.autoAdvance,false);assert.match(s.dungeon.advanceReason,/全队阵亡/);
 s=step(s,15000);assert.ok([s,...s.party].every(c=>c.hp===0));assert.notEqual(s.activity.type,'revive');
});

test('pausing during resurrection finishes the current cast but does not resurrect another ally',()=>{
 let s=act(group(),{type:'dungeonNext'},0);s.party[0].hp=0;s.party[2].hp=0;s=victory(s);
 const target=s.activity.target,end=s.activity.endsAt;s=act(s,{type:'dungeonPause'},s.wallAt);s=advance(s,end+2000).state;
 assert.ok(s.party.find(c=>c.id===target).hp>0);assert.equal(s.party[2].hp,0);assert.equal(s.dungeon.autoAdvance,false);assert.equal(s.combat,null);
});

test('resurrection survives serialization and final-route allies are rescued before automation completes',()=>{
 let s=group();atRoute(s,dungeonRoute.at(-1).id);s=act(s,{type:'dungeonNext'},0);s.party[0].hp=0;s=victory(s);
 assert.equal(s.dungeon.cursor,dungeonRoute.length);assert.equal(s.dungeon.autoAdvance,true);assert.equal(s.activity.type,'resurrect');
 const end=s.activity.endsAt,whole=advance(s,end+1000).state;
 let chunk=JSON.parse(JSON.stringify(advance(s,s.wallAt+1000).state));chunk=advance(chunk,end+1000).state;
 assert.deepEqual(chunk,whole);assert.ok(whole.party[0].hp>0);assert.equal(whole.dungeon.autoAdvance,false);assert.equal(whole.combat,null);
});

test('full bags and manual loot stop advancing without losing drops',()=>{
 for(const full of [false,true]){
  let s=act(group(),{type:'dungeonNext'},0);s.settings.autoLoot=full;
  if(full)while(s.bag.length<bagCapacity(s))s.bag.push(makeItem(s,25));
  s.pending.push({...makeItem(s,2589,2),lootBattleId:s.combat.id});const drops=structuredClone(s.pending);
  s=victory(s);assert.equal(s.combat,null);assert.equal(s.dungeon.autoAdvance,false);assert.deepEqual(s.pending,drops);assert.match(s.dungeon.advanceReason,/背包/);
 }
});

test('automatic recovery uses real supplies and waits before the next countdown',()=>{
 let s=group();addItem(s,159,20);const water=countItem(s,159);s=act(s,{type:'dungeonNext'},0);s.mana=0;
 s=victory(s);assert.equal(s.combat,null);assert.ok(s.rest);assert.equal(s.dungeon.autoAdvance,true);assert.ok(countItem(s,159)<water);
 const afterFight=s.clock;s=step(s,1000);assert.equal(s.combat,null);
 for(let i=0;i<180&&!s.combat;i++)s=step(s,1000);
 assert.ok(s.combat);assert.ok(s.combat.startedAt>afterFight+1000);assert.equal(s.rest,null);
});

test('pause and generic stop finish the current encounter but never start another',()=>{
 for(const type of ['dungeonPause','stop']){
  let s=act(group(),{type:'dungeonNext'},0),id=s.combat.id;
  s=act(s,{type},0);assert.equal(s.combat.id,id);assert.equal(s.dungeon.autoAdvance,false);
  s=victory(s);s=step(s,2000);assert.equal(s.combat,null);assert.equal(s.dungeon.cursor,1);
 }
});

test('automatic powder and cannon use the real item, door delay and gate',()=>{
 let s=group();const e=atRoute(s,'dm-gunpowder');for(const guid of e.sourceGuids)s.dungeon.defeated[guid]=true;
 s=act(s,{type:'dungeonNext'},0);assert.equal(countItem(s,5397),1);assert.equal(s.dungeon.interactions['dm-gunpowder'],true);
 for(let i=0;i<20&&s.activity.type!=='dungeonCannon';i++)s=s.combat?victory(s):step(s);
 assert.equal(s.activity.type,'dungeonCannon');assert.equal(countItem(s,5397),0);assert.equal(s.dungeon.interactions['dm-cannon'],undefined);
 const end=s.activity.endsAt;s=advance(s,end-1).state;assert.equal(s.dungeon.interactions['dm-cannon'],undefined);
 s=advance(s,end).state;assert.equal(s.dungeon.interactions['dm-cannon'],true);assert.equal(s.dungeon.autoAdvance,true);
 s=step(s);assert.ok(s.combat);
});

test('pausing a lit cannon preserves its completion but prevents the next pull',()=>{
 let s=group();atRoute(s,'dm-cannon');addItem(s,5397);s=act(s,{type:'dungeonNext'},0);
 const end=s.activity.endsAt;s=act(s,{type:'dungeonPause'},0);s=advance(s,end+1000).state;
 assert.equal(s.dungeon.interactions['dm-cannon'],true);assert.equal(countItem(s,5397),0);assert.equal(s.combat,null);
});

test('missing cannon supplies and closed gates stop with a reason instead of crashing ticks',()=>{
 for(const id of ['dm-cannon','dm-sneed']){
  let s=group();atRoute(s,id);s.dungeon.autoAdvance=true;
  // Use a guaranteed gate fixture for the second case.
  if(id==='dm-sneed'){const gated=dungeonRoute.find(e=>e.activation?.afterDeathEntry);s.dungeon.cursor=dungeonRoute.indexOf(gated);delete s.dungeon.defeatedBosses[gated.activation.afterDeathEntry];}
  s=step(s);assert.equal(s.dungeon.autoAdvance,false);assert.ok(s.dungeon.advanceReason);assert.equal(s.combat,null);
 }
});

test('optional bosses are not skipped and route completion disarms automatic advance',()=>{
 let s=group();atRoute(s,'dm-cookie');s=act(s,{type:'dungeonNext'},0);assert.equal(s.combat.routeId,'dm-cookie');
 s=group();const last=dungeonRoute.at(-1);atRoute(s,last.id);s=act(s,{type:'dungeonNext'},0);s=victory(s);
 assert.equal(s.dungeon.cursor,dungeonRoute.length);assert.equal(s.dungeon.autoAdvance,false);assert.ok(s.dungeon.completedAt);assert.equal(s.combat,null);
});

test('automatic state survives serialization and chunking, but leaving disarms it',()=>{
 const initial=act(group(),{type:'dungeonNext'},0),whole=advance(initial,45000).state;
 let chunk=JSON.parse(JSON.stringify(initial));for(const at of [3000,11000,21000,45000])chunk=advance(chunk,at).state;
 assert.deepEqual(chunk,whole);
 let s=group();s.dungeon.autoAdvance=true;s=act(s,{type:'leaveDungeon'},0);assert.equal(s.dungeonSaves?.deadmines.autoAdvance,false);
 s=act(s,{type:'enterDungeon'},0);s=step(s,1000);assert.equal(s.dungeon.autoAdvance,false);assert.equal(s.combat,null);
});
