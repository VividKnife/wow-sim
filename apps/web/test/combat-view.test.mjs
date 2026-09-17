import test from 'node:test';
import assert from 'node:assert/strict';
import {actionProgress,recentCombatEvents} from '../lib/combat-view.js';
import * as combatView from '../lib/combat-view.js';

test('new polling batches preserve active effects without replaying duplicates',()=>{
 assert.equal(typeof combatView.mergeCombatEffects,'function');
 const old=[{id:1,shownAt:1000},{id:2,shownAt:2100}];
 const result=combatView.mergeCombatEffects(old,[{id:2},{id:3}],2600);
 assert.deepEqual(result.map(e=>[e.id,e.shownAt]),[[2,2100],[3,2600]]);
});

test('battle anchors preserve two dimensional distance on a compact equal scale field',()=>{
 assert.equal(typeof combatView.battleLayout,'function');
 const allies=[{id:'a0',position:0,positionY:0},{id:'a1',position:3,positionY:4}];
 const enemies=Array.from({length:6},(_,i)=>({id:'e'+i,position:23,positionY:i}));
 const layout=combatView.battleLayout(allies,enemies);
 assert.ok(layout.height<=480);
 const a=layout.units.a0,b=layout.units.a1;
 assert.ok(Math.abs(Math.hypot((b.left-a.left)*10,b.top-a.top)-5*layout.scale)<.00001);
 assert.equal(combatView.battleLayout(allies,[...enemies,...enemies]).height,layout.height);
 assert.ok(layout.units.a0.left<layout.units.a1.left);
});
test('vertical separation prevents a false ready melee meter',()=>{
 const actor={hp:30,position:0,positionY:0,nextSwing:0};
 assert.equal(combatView.meleeStatus(actor,{enemies:[{hp:20,position:0,positionY:8}]},1000).kind,'approaching');
});
test('control timer describes the displayed control rather than a longer unrelated slow',()=>{
 const unit={hp:50,rootUntil:3000,slowUntil:10000,slow:.5};
 assert.equal(combatView.conditionRemaining?.(unit,2000),1000);
 assert.equal(combatView.unitCondition(unit,4000),'减速');
 assert.equal(combatView.conditionRemaining?.(unit,4000),6000);
 const stacked={hp:50,movementSlows:[{amount:.5,until:7000}]};
 assert.equal(combatView.unitCondition(stacked,4000),'减速');
 assert.equal(combatView.conditionRemaining(stacked,4000),3000);
});
test('projectile display follows authoritative flight time without mutating combat',()=>{
 const projectile={from:{x:0,y:0},to:{x:10,y:20},startedAt:1000,landsAt:2000};
 assert.equal(typeof combatView.projectilePoint,'function');
 assert.deepEqual(combatView.projectilePoint(projectile,1500),{x:5,y:10});
 assert.equal(projectile.landsAt,2000);
 assert.deepEqual(combatView.projectilePoint(projectile,5000),{x:10,y:20});
});
test('short flights completed between polls replay once before same-batch damage feedback',()=>{
 const launch={id:1,kind:'launch',projectileId:'p1',actorId:'a',targetId:'b',spellId:133,from:{x:0,y:0},to:{x:10,y:0},startedAt:1000,landsAt:1500};
 const damage={id:2,kind:'damage',actorId:'a',targetId:'b',spellId:133,amount:20};
 const effects=combatView.mergeCombatEffects([], [launch,damage],5000,[]);
 assert.equal(typeof combatView.presentationProjectiles,'function');
 assert.equal(effects.find(e=>e.kind==='damage').shownAt,5500);
 const flights=combatView.presentationProjectiles([],effects,2600,5250);
 assert.equal(flights.length,1);
 assert.deepEqual(combatView.projectilePoint(flights[0],2600),{x:5,y:0});
 assert.equal(combatView.presentationProjectiles([],effects,2900,5600).length,0);
 const live=combatView.mergeCombatEffects([], [launch],5000,[{...launch,id:'p1'}]);
 assert.equal(combatView.presentationProjectiles([],live,2600,5250).length,0);
});
test('live and replayed projectile endpoints follow moving targets without rewriting authority',()=>{
 const flight={id:'p1',actorId:'a',targetId:'b',from:{x:0,y:0},to:{x:10,y:0},startedAt:1000,landsAt:2000};
 const original=structuredClone(flight),targets=[{id:'b',position:20,positionY:6}];
 const shown=combatView.presentationProjectiles([flight],[],1500,5000,targets)[0];
 assert.deepEqual(shown.to,{x:20,y:6});
 assert.equal(shown.landsAt,2000);
 assert.deepEqual(combatView.projectilePoint(shown,1500),{x:10,y:3});
 assert.deepEqual(flight,original);
 const replay={...flight,replayFlight:true,shownAt:5000};
 const replayOriginal=structuredClone(replay);
 assert.deepEqual(combatView.presentationProjectiles([],[replay],3000,5250,targets)[0].to,{x:20,y:6});
 assert.deepEqual(replay,replayOriginal);
 assert.deepEqual(combatView.presentationProjectiles([flight],[],1500,5000,[])[0].to,original.to);
});
test('cast and swing progress remains bounded while waiting for authoritative updates',()=>{assert.equal(actionProgress(1000,3000,500),0);assert.equal(actionProgress(1000,3000,2000),.5);assert.equal(actionProgress(1000,3000,9000),1)});

test('enemy attack meter follows its actual target and stops during non-attacking phases',()=>{
 assert.equal(typeof combatView.enemyMeleeProgress,'function');
 const actors=[{id:'tank',hp:100,position:25},{id:'mage',hp:100,position:0}];
 const enemy={hp:100,position:29,target:'tank',swing:2000,swingStartedAt:1000,nextAttack:4000};
 assert.equal(combatView.enemyMeleeProgress(enemy,actors,2500),.5);
 for(const patch of [{target:'mage'},{target:'missing'},{cast:{}},{hp:0},{stunUntil:6000},{fleeing:true},{smite:{stage:'running'}}])
  assert.equal(combatView.enemyMeleeProgress({...enemy,...patch},actors,5000),0);
 assert.equal(combatView.enemyMeleeProgress(enemy,[{...actors[0],hp:0}],5000),0);
 assert.equal(combatView.enemyMeleeProgress(enemy,actors,5000),1);
});

test('healer companions do not advertise a ready melee attack they never perform',()=>{
 const priest={classId:5,hp:100,position:0,nextSwing:0};
 const battle={enemies:[{hp:50,position:4}]};
 assert.equal(combatView.meleeStatus(priest,battle,1000).kind,'nonMelee');
 assert.equal(combatView.meleeProgress(priest,battle,1000),0);
 assert.equal(combatView.meleeStatus({...priest,cast:{}},battle,1000).kind,'casting');
});
test('melee meter stays empty during casting, approach and combat end even with an elapsed swing timer',()=>{
 const actor={hp:30,position:0,swingStartedAt:1000,nextSwing:3000};
 const battle={enemies:[{hp:20,position:4}]};
 assert.equal(typeof combatView.meleeProgress,'function');
 assert.equal(combatView.meleeProgress(actor,battle,2000),.5);
 assert.equal(combatView.meleeProgress(actor,battle,4000),1);
 assert.equal(combatView.meleeProgress({...actor,cast:{}},battle,4000),0);
 assert.equal(combatView.meleeProgress({...actor,position:-20},battle,4000),0);
 assert.equal(combatView.meleeProgress({...actor,hp:0},battle,4000),0);
 assert.equal(combatView.meleeProgress(actor,null,4000),0);
});
test('reconnected combat views do not replay historical combat events',()=>{const logs=[{id:1,at:100,kind:'cast',actorId:'player'},{id:2,at:200,kind:'damage',amount:15},{id:3,at:5100,kind:'incoming',amount:2}];assert.deepEqual(recentCombatEvents(logs,3,5200),[]);assert.deepEqual(recentCombatEvents(logs,2,5200).map(x=>x.id),[3]);assert.deepEqual(recentCombatEvents(logs,0,10000),[])});

test('effective healing is displayed as a recent combat event',()=>{const heal={id:4,at:100,kind:'heal',amount:25};assert.deepEqual(recentCombatEvents([heal],3,200),[heal]);});

test('active control effects explain stopped action meters and expire with the simulation clock',()=>{
 const actor={hp:30,position:0,nextSwing:0,auras:[{type:12,until:3000}]},battle={enemies:[{hp:20,position:4}]};
 assert.equal(combatView.meleeStatus(actor,battle,2000).kind,'stunned');
 assert.equal(combatView.meleeProgress(actor,battle,2000),0);
 assert.equal(combatView.unitCondition(actor,2000),'击晕');
 assert.equal(combatView.unitCondition(actor,3000),'');
});

test('melee status distinguishes closing distance from a ready swing and never targets corpses',()=>{
 const actor={hp:30,position:0,nextSwing:1000};
 const battle={enemies:[{hp:0,position:1},{hp:20,position:20}]};
 assert.deepEqual(combatView.meleeStatus(actor,battle,1200),{kind:'approaching',remaining:0});
 battle.enemies[1].position=4;
 assert.deepEqual(combatView.meleeStatus(actor,battle,1200),{kind:'ready',remaining:0});
 assert.deepEqual(combatView.meleeStatus(actor,battle,500),{kind:'waiting',remaining:500});
 assert.equal(combatView.meleeStatus({...actor,cast:{}},battle,1200).kind,'casting');
 assert.equal(combatView.meleeStatus({...actor,hp:0},battle,1200).kind,'dead');
 assert.equal(combatView.meleeStatus(actor,null,1200).kind,'ended');
});


test('automatic camera fits distant units and follows the group instead of world origin',()=>{
 const units=[{id:'a',position:1000,positionY:-300,hp:100},{id:'b',position:1300,positionY:400,hp:100},{id:'c',position:1100,positionY:50,hp:0}];
 const layout=combatView.battleLayout(units,[]);
 for(const u of units){const p=layout.units[u.id];assert.ok(p.left>=8&&p.left<=92&&p.top>=80&&p.top<=360);}
 const shifted=combatView.battleLayout(units.map(u=>({...u,position:u.position+4000,positionY:u.positionY-7000})),[]);
 for(const u of units){assert.ok(Math.abs(layout.units[u.id].left-shifted.units[u.id].left)<1e-9);assert.ok(Math.abs(layout.units[u.id].top-shifted.units[u.id].top)<1e-9);}
 const zoomed=combatView.battleLayout(units,[],2);
 assert.equal(zoomed.scale,layout.scale*2);
 assert.deepEqual(combatView.battleLayout(units,[],1),layout);
 assert.ok(Number.isFinite(combatView.battleLayout([],[]).scale));
});


test('target arrows follow healing casts and threat changes, then return to the attack target',()=>{
 const units=[{id:'healer',hp:100,target:'mob',cast:{target:'tank',until:2000}}, {id:'tank',hp:100,target:'mob'}, {id:'dps',hp:100,target:'mob'}, {id:'mob',hp:100,foe:true,target:'tank'}];
 const layout=combatView.battleLayout(units.map((u,i)=>({...u,position:i*8})),[]);
 let links=combatView.battleTargetLinks(units,layout,1000);
 assert.equal(links.length,4);
 assert.equal(links.find(l=>l.actorId==='healer').targetId,'tank');
 assert.equal(links.find(l=>l.actorId==='healer').friendly,true);
 assert.equal(links.find(l=>l.actorId==='mob').targetId,'tank');
 units[3].target='dps';
 links=combatView.battleTargetLinks(units,layout,2000);
 assert.equal(links.find(l=>l.actorId==='mob').targetId,'dps');
 assert.equal(links.find(l=>l.actorId==='healer').targetId,'mob');
 assert.equal(links.find(l=>l.actorId==='healer').friendly,false);
 for(const link of links){assert.ok([link.x1,link.y1,link.x2,link.y2].every(Number.isFinite));}
});

test('target arrows omit dead, removed, missing and self targets without guessing another target',()=>{
 const units=[{id:'a',hp:100,target:'b'},{id:'b',hp:100,target:'a'}];
 const layout=combatView.battleLayout(units.map((u,i)=>({...u,position:i*8})),[]);
 for(const change of [{hp:0},{removed:true},{target:'a'},{target:'missing'},{cast:{target:'missing',until:2000}},{cast:{target:'a',until:2000}}]){
  const changed=[{...units[0],...change},units[1]];
  assert.equal(combatView.battleTargetLinks(changed,layout,1000).some(l=>l.actorId==='a'),false);
 }
 units[1].hp=0;
 assert.deepEqual(combatView.battleTargetLinks(units,layout,1000),[]);
});
