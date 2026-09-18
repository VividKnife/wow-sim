import {recruitForTest} from './support/party-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,view} from '../../../packages/game-domain/src/rules/engine.js';
import {combatTick,commandCombatCast} from '../../../packages/game-domain/src/rules/combat.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {distance} from '../../../packages/sim-core/src/geometry.js';

function room(){
 let s=createGame('开怪倒计时',283,0);s.level=20;s.learned.push(116);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},0);
 s.location='deadmines';s=act(s,{type:'enterDungeon'},0);
 return act(s,{type:'dungeonNext'},0);
}
const positions=s=>[s,...s.party,...s.combat.enemies].map(c=>[c.id,c.position,c.positionY,c.hp,c.mana]);

test('advance creates the room immediately and both sides wait through 3, 2, 1',()=>{
 const s=room(),before=positions(s),sequence=s.logSequence;
 assert.equal(s.clock,0);assert.equal(s.activity.type,'idle');assert.equal(s.combat.routeId,'dm-entry-01');
 for(const [at,count] of [[0,3],[999,3],[1000,2],[1999,2],[2000,1],[2999,1]]){
  s.clock=at;combatTick(s);assert.equal(Math.ceil((s.combat.pull.startsAt-s.clock)/1000),count);
  assert.deepEqual(positions(s),before);assert.equal(s.logSequence,sequence);assert.equal(s.combat.pull.engagedAt,null);
 }
 assert.throws(()=>commandCombatCast(s,s,116,s.combat.enemies[0].id),/倒计时/);
 const snapshot=projectClientSnapshot(s,view(s));assert.deepEqual(snapshot.player.combat.pull,s.combat.pull);
});

test('tank without opening skills walks first while the enemies and party hold position',()=>{
 const s=room(),tank=s.party[0];tank.rules=[];
 const enemies=s.combat.enemies.map(e=>[e.position,e.positionY]),party=positions(s).filter(row=>row[0]!==tank.id);
 s.clock=3000;combatTick(s);assert.ok(tank.position>20);assert.equal(s.combat.pull.engagedAt,null);
 assert.deepEqual(positions(s).filter(row=>row[0]!==tank.id),party);
 assert.deepEqual(s.combat.enemies.map(e=>[e.position,e.positionY]),enemies);
 for(s.clock=3100;s.clock<=5000&&s.combat.pull.engagedAt==null;s.clock+=100)combatTick(s);
 assert.ok(s.combat.pull.engagedAt>=3000);assert.ok(s.combat.enemies.some(e=>distance(tank,e)<=5));
});

test('a configured tank opening skill cannot fire until countdown completes',()=>{
 const s=room(),tank=s.party[0];tank.learned.push(100);tank.stance='battle';tank.rules=[{spell:100,condition:'combatTimeBelow',value:2,enabled:true}];
 s.clock=2999;combatTick(s);assert.equal(s.logs.some(l=>l.actorId===tank.id&&l.kind==='cast'),false);
 s.clock=3000;combatTick(s);
 assert.ok(s.logs.some(l=>l.actorId===tank.id&&l.kind==='cast'&&l.spellId===100&&l.at===3000));
 assert.equal(s.combat.pull.engagedAt,3000);
});

test('countdown survives serialization and chunked runner ticks',()=>{
 const s=room(),whole=advance(s,7000).state;
 let chunk=JSON.parse(JSON.stringify(advance(s,1500).state));
 for(const at of [2000,2999,3000,4000,7000])chunk=advance(chunk,at).state;
 assert.deepEqual(chunk,whole);
});

test('retry starts a fresh countdown and low resources do not delay room entry',()=>{
 let s=room();s=act(s,{type:'abandonCombat',encounterId:s.combat.id},0);s=act(s,{type:'revive'},0);s=advance(s,10000).state;
 s.hp=1;s.mana=0;s=act(s,{type:'dungeonNext'},s.wallAt);
 assert.equal(s.combat.pull.startsAt,s.clock+3000);assert.equal(s.combat.pull.engagedAt,null);assert.equal(s.rest,null);
});

test('a party without a living tank still starts when countdown ends',()=>{
 const s=room();s.party[0].strategyPolicy={role:'melee'};
 s.clock=3000;combatTick(s);assert.equal(s.combat.pull.engagedAt,3000);
});
