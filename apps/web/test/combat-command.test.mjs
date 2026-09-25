import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,view} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {combatCommandView,commandDamageRules,commandOrder} from '../../../packages/game-domain/src/rules/combat-command.js';
import {strategyAllows} from '../../../packages/game-domain/src/rules/combat-strategy.js';
import {companionTarget} from '../../../packages/game-domain/src/rules/companion-combat.js';
import {positionPartyMember,rescueTarget} from '../../../packages/game-domain/src/rules/combat-positioning.js';
import {spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {recruitForTest} from './support/party-fixture.mjs';
import {distance} from '../../../packages/sim-core/src/geometry.js';

function group(classId=8){
 let s=createGame('指挥验证',747,0,{classId,raceId:classId===3?3:1});s.level=20;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 s=recruitForTest(s,{type:'recruit',id:'warrior'},0);s.settings.commandCombat=true;
 if(classId===8)s.learned=[...new Set([...s.learned,118,116,122,2139])];
 startCombat(s,[636,636,636],true);s.combat.pull={startsAt:3000,engagedAt:null};
 for(const e of s.combat.enemies){e.hp=e.maxHp=100000;e.nextSpell=e.nextAttack=100000;e.rootUntil=100000;}
 return s;
}
function order(s,order,extra={}){return act(s,{type:'combatCommand',order,encounterId:s.combat?.id,...extra},s.wallAt);}
test('live commands do not pause; output modes stay temporary and single target blocks damage AoE',()=>{
 let s=group();delete s.combat.command;s.learned.push(1449);s.strategyPolicy={waitForTank:false};
 s=order(s,'focus',{targetId:s.combat.enemies[0].id});assert.equal(s.combat.command.paused,false);assert.equal(s.combat.command.marks[s.combat.enemies[0].id],'skull');
 s=order(s,'mode',{mode:'single'});assert.equal(strategyAllows(s,s,s.combat.enemies[0],spellInfo(s,1449)),false);assert.equal(strategyAllows(s,s,s.combat.enemies[0],spellInfo(s,116)),true);
 s=order(s,'mode',{mode:'aoe',memberId:s.id});assert.ok(commandDamageRules(s,s).some(r=>r.spell===1449));assert.equal(strategyAllows(s,s,s.combat.enemies[0],spellInfo(s,1449)),true);
 s=order(s,'mode',{mode:'auto'});assert.equal(s.combat.command.mode,'auto');assert.deepEqual(s.combat.command.memberModes,{});assert.equal(s.strategyPolicy.waitForTank,false);
});
test('one-shot control preserves a member kite assignment',()=>{
 let s=group();s=order(s,'kite',{targetId:s.combat.enemies[1].id,memberId:s.id});
 s=order(s,'control',{targetId:s.combat.enemies[0].id,memberId:s.id,spellId:2139});
 assert.equal(s.combat.command.orders.length,2);assert.ok(s.combat.command.orders.some(o=>o.kind==='kite'));
 assert.equal(commandOrder(s,s).kind,'kite');s.combat.enemies[0].cast={spell:133,until:10000};assert.equal(commandOrder(s,s).kind,'interrupt');
 s=order(s,'mode',{mode:'auto',memberId:s.id});assert.equal(s.combat.command.orders.length,0);
});
test('area output mode actually casts a learned area spell and keeps reserved sheep safe',()=>{
 let s=group();s.learned.push(1449);s.rules=[];s.position=26;s.strategyPolicy={waitForTank:false};s.combat.pull.engagedAt=3000;
 s=order(s,'mode',{mode:'aoe',memberId:s.id});assert.ok(!commandDamageRules(s,s).some(r=>r.spell===122));s=order(s,'resume');s.clock=3000;combatTick(s);
 assert.ok(s.logs.some(l=>l.kind==='cast'&&l.spellId===1449));assert.ok(s.logs.some(l=>l.kind==='damage'&&l.spellId===1449));
 s=order(s,'control',{memberId:s.id,targetId:s.combat.enemies[1].id,spellId:118});
 assert.equal(strategyAllows(s,s,s.combat.enemies[0],spellInfo(s,1449)),false);
});
test('preselected command opens frozen, survives reload, and resumes without advancing timers',()=>{
 let s=group();assert.equal(s.combat.command.paused,true);
 const clock=s.clock,hp=s.hp,rng=s.rngState,pull=s.combat.pull.startsAt;
 s=advance(s,60000).state;assert.equal(s.clock,clock);assert.equal(s.wallAt,60000);assert.equal(s.commandPausedMs,60000);assert.equal(s.hp,hp);assert.equal(s.rngState,rng);
 s=order(JSON.parse(JSON.stringify(s)),'resume');s=advance(s,61000).state;assert.equal(s.clock,1000);assert.equal(s.combat.pull.startsAt,pull);
 s=order(s,'pause');s=advance(s,66000).state;assert.equal(s.clock,1000);assert.equal(s.commandPausedMs,65000);
});
test('advance stops at a newly commanded encounter inside a large catchup batch',()=>{
 let s=group();s.combat=null;s.activity={type:'hunt',target:299};s.nextPull=0;
 // Exercise the transition through onStep without relying on a particular dungeon route.
 s=advance(s,20000,{onStep:state=>{if(state.combat&&!state.combat.command)state.combat.command={paused:true,marks:{},orders:[]};}}).state;
 assert.equal(s.clock,100);assert.equal(s.wallAt,20000);assert.equal(s.commandPausedMs,19900);
});
test('focus, unique marks, snapshot projection and stale encounter validation',()=>{
 let s=group();const [a,b]=s.combat.enemies;
 s=order(s,'focus',{targetId:b.id});s=order(s,'mark',{targetId:a.id,mark:'skull'});s=order(s,'mark',{targetId:b.id,mark:'skull'});
 assert.equal(companionTarget(s,s,s.combat.enemies).id,b.id);assert.deepEqual(s.combat.command.marks,{[b.id]:'skull'});
 const client=projectClientSnapshot(s,view(s));assert.equal(client.player.combat.command.focusId,b.id);assert.ok(client.view.combatCommand.skills.length);
 assert.throws(()=>act(s,{type:'combatCommand',order:'pause',encounterId:'old'},0),/变化/);
 assert.throws(()=>order(s,'mark',{targetId:b.id,mark:'invalid'}),/标记/);
});
test('only learned control skills can be assigned; pending control protects from AoE even with protection disabled',()=>{
 const hunter=group(3);hunter.learned.push(2649);assert.ok(!combatCommandView(hunter).skills.some(skill=>skill.memberId===hunter.id&&skill.spellId===2649));
 let s=group();const target=s.combat.enemies[1];
 const skills=combatCommandView(s).skills;assert.ok(skills.some(x=>x.spellId===118));assert.ok(!skills.some(x=>x.name==='冰冻陷阱'));
 assert.throws(()=>order(s,'control',{targetId:target.id,memberId:s.id,spellId:6770}),/没有学会/);
 s=order(s,'control',{targetId:target.id,memberId:s.id,spellId:118});s.strategyPolicy={protectCC:false,waitForTank:false};s.position=target.position;
 assert.equal(strategyAllows(s,s,s.combat.enemies[0],spellInfo(s,1449)),false);
 assert.notEqual(companionTarget(s,s,s.combat.enemies).id,target.id);
 s=order(s,'focus',{targetId:target.id});assert.equal(s.combat.command.orders.length,0);
 s.strategyPolicy={waitForTank:false,protectCC:true};s.combat.enemies[1].polyUntil=10000;assert.equal(strategyAllows(s,s,s.combat.enemies[1],spellInfo(s,116)),true);
});
test('assigned polymorph casts on the exact target after preparation, uses real mana and protects it',()=>{
 let s=group();const target=s.combat.enemies[1];
 s=order(s,'control',{targetId:target.id,memberId:s.id,spellId:118});s=order(s,'resume');
 const mana=s.mana;s.rules=[];
 for(s.clock=3000;s.clock<=5000;s.clock+=100)combatTick(s);
 assert.ok(s.logs.some(l=>l.spellId===118&&l.targetId===target.id&&l.kind==='cast'));
 assert.ok(s.combat.enemies[1].polyUntil>5000);assert.ok(s.mana<mana);
 assert.notEqual(companionTarget(s,s.party[0],s.combat.enemies).id,target.id);
});
test('hard control is a single queued cast, then returns to AI',()=>{
 let s=group(2);s.learned.push(853);s.position=30;s.rules=[];s.combat.pull.engagedAt=3000;
 const target=s.combat.enemies[0];s=order(s,'control',{targetId:target.id,memberId:s.id,spellId:853});s=order(s,'resume');
 for(s.clock=3000;s.clock<4000;s.clock+=100)combatTick(s);
 assert.equal(s.logs.filter(l=>l.spellId===853&&l.kind==='cast').length,1);assert.equal(s.combat.command.orders.length,0);assert.ok(s.combat.enemies[0].stunUntil>4000);
});
test('assigned interrupt waits for an enemy cast before spending its cooldown',()=>{
 let s=group();s.rules=[];s.combat.pull.engagedAt=3000;s.position=10;
 const target=s.combat.enemies[0];s=order(s,'control',{targetId:target.id,memberId:s.id,spellId:2139});s=order(s,'resume');
 s.clock=3000;combatTick(s);assert.equal(s.logs.filter(l=>l.spellId===2139&&l.kind==='cast').length,0);assert.equal(s.combat.command.orders.length,1);
 s.combat.enemies[0].cast={spell:133,until:10000,target:s.id};s.cast=null;s.nextAction=3100;s.clock=3100;combatTick(s);
 assert.ok(s.logs.some(l=>l.spellId===2139&&l.kind==='cast'&&l.targetId===target.id),JSON.stringify(s.logs));assert.equal(s.combat.enemies[0].cast,null);
});
test('kite selects assigned target, retreats from its pursuer, and tank does not steal it',()=>{
 let s=group();const e=s.combat.enemies[1];s=order(s,'kite',{targetId:e.id,memberId:s.id});
 const enemy=s.combat.enemies[1];s.clock=4000;s.position=20;s.positionY=0;enemy.position=24;enemy.positionY=0;enemy.target=s.id;
 const before=distance(s,enemy);assert.equal(companionTarget(s,s,s.combat.enemies).id,e.id);assert.ok(positionPartyMember(s,s));assert.ok(distance(s,enemy)>before);
 assert.notEqual(rescueTarget(s,s.party[0],s.combat.enemies)?.id,e.id);
 assert.equal(strategyAllows(s,s,enemy,spellInfo(s,116)),true);
});
test('hold fire gates automatic damage, dead assignments clear, last controlled enemy is released',()=>{
 let s=group();s=order(s,'holdFire',{enabled:true});assert.equal(strategyAllows(s,s,s.combat.enemies[0],spellInfo(s,116)),false);
 s=order(s,'control',{targetId:s.combat.enemies[1].id,memberId:s.id,spellId:118});s=order(s,'resume');
 s.combat.enemies[0].hp=s.combat.enemies[2].hp=0;s.clock=3000;combatTick(s);assert.equal(s.combat.command.orders.length,0);
});
test('sap prepares learned stealth and controls the assigned humanoid before the tank pull',()=>{
 let s=group(4);s.learned.push(1784,6770);s.rules=[];s.energy=100;
 const target=s.combat.enemies[1];s=order(s,'control',{targetId:target.id,memberId:s.id,spellId:6770});s=order(s,'resume');
 for(s.clock=3000;s.clock<11000;s.clock+=100)combatTick(s);
 assert.ok(s.logs.some(l=>l.spellId===1784&&l.kind==='cast'));
 assert.ok(s.logs.some(l=>l.spellId===6770&&l.targetId===target.id&&l.kind==='cast'));
 assert.ok(s.combat.enemies[1].auras.some(a=>a.spell===6770&&a.until>s.clock));
});
test('freezing trap prepares at the assigned enemy and actually triggers its control effect',()=>{
 let s=group(3);s.learned.push(1499);s.rules=[];
 const target=s.combat.enemies[1];s=order(s,'control',{targetId:target.id,memberId:s.id,spellId:1499});s=order(s,'resume');
 for(s.clock=3000;s.clock<11000;s.clock+=100)combatTick(s);
 assert.ok(s.logs.some(l=>l.spellId===1499&&l.kind==='cast'));
 assert.ok(s.combat.enemies[1].auras.some(a=>a.type===12&&a.until>s.clock));
});
