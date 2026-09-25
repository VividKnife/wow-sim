import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {beginMoltenCoreBattle} from '../src/rules/molten-core-battle.js';
import {moltenCoreBosses} from '../src/rules/molten-core-content.js';
import {defaultRaidTactics,moltenCoreTick} from '../src/rules/molten-core-encounter.js';
import {raidFieldsTick,addRaidField,raidFieldPresentation} from '../src/rules/raid-battlefield.js';
import {fieldContains,fieldSafePoint,rectangleField,sectorField,spiralField} from '../../sim-core/src/encounter-geometry.js';
import {moveToward} from '../src/rules/combat-space.js';
import {battlePresentation} from '../src/rules/battle-presentation.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';
import type {Rules} from '../src/model.ts';
const base=createMoltenCoreDemo().state;
function start(id='ragnaros'){
 const s=structuredClone(base);if(id==='onyxia')s.guildRaid={active:true,raidId:'onyxias-lair'};
 beginMoltenCoreBattle(s,id,{...defaultRaidTactics});return s;
}
const noDamage=()=>{};

test('all shipped raid bosses initialize in a named encounter area',()=>{
 for(const id of [...moltenCoreBosses.map(b=>b.id),'onyxia']){
  const s=start(id);assert.ok(s.combat.area.name);assert.equal(s.combat.ground,id==='onyxia'?'onyxia':'molten');
  assert.doesNotThrow(()=>moltenCoreTick(s,[s,...s.party],noDamage));
 }
});
test('spiral geometry leaves a safe core approach and uses exactly the drawn polygon',()=>{
 const f=spiralField({x:30,y:0});assert.equal(fieldContains(f,{x:30,y:6}),true);
 assert.equal(fieldContains(f,{x:30,y:0}),false);assert.equal(fieldContains(f,{x:25,y:0}),false);
 const box=rectangleField(-20,50,-5,5);assert.equal(fieldContains(box,{x:49,y:0}),true);assert.equal(fieldContains(box,{x:49,y:6}),false);
 const cone=sectorField({x:30,y:0},40,Math.PI,Math.atan(.55)*2);assert.equal(fieldContains(cone,{x:20,y:2}),true);assert.equal(fieldContains(cone,{x:40,y:0}),false);
});
test('Ragnaros is anchored and all initial raid positions are outside permanent lava',()=>{
 const s=start(),r=s.combat.raidEncounter,b=s.combat.enemies[0];assert.equal(b.moveSpeed,0);assert.equal(r.fires.filter((f:Rules)=>f.terrain).length,2);
 for(const c of [s,...s.party])assert.ok(!r.fires.some((f:Rules)=>fieldContains(f,c,1)),c.name);
 const p={position:b.position,positionY:b.positionY};moveToward(s,b,s,0,s.clock);assert.equal(b.position,p.position);assert.equal(b.positionY,p.positionY);
});
test('lava damages only units standing in it and restores deterministically from JSON',()=>{
 const s=start();s.combat.raidEncounter.tactics.avoidFire=false;s.position=30;s.positionY=6;s.party[0].position=25;s.party[0].positionY=0;
 const copy=JSON.parse(JSON.stringify(s));
 const run=(v:Rules)=>{const hits:string[]=[];raidFieldsTick(v,[v,v.party[0]],v.combat.enemies[0],(_s:Rules,_b:Rules,c:Rules)=>hits.push(c.id));return hits;};
 assert.deepEqual(run(s),[s.id]);assert.deepEqual(run(copy),[s.id]);assert.deepEqual(s.combat.raidEncounter,copy.combat.raidEncounter);
});
test('warning, one-shot impact, cleanup and bounded avoidance share the field geometry',()=>{
 const s=start('gehennas'),r=s.combat.raidEncounter,b=s.combat.enemies[0];s.position=0;s.positionY=0;r.tactics.avoidFire=false;
 const f=addRaidField(s,rectangleField(-5,5,-5,5),{label:'测试火道',delay:2000,duration:500,once:true});
 let hits=0;const hit=()=>hits++;raidFieldsTick(s,[s],b,hit);assert.equal(hits,0);
 s.clock=f.armedAt;raidFieldsTick(s,[s],b,hit);assert.equal(hits,1);s.clock+=100;raidFieldsTick(s,[s],b,hit);assert.equal(hits,1);
 s.clock+=1000;raidFieldsTick(s,[s],b,hit);assert.equal(r.fires.length,0);
 const edge={center:{x:50,y:28},radius:8},safe=fieldSafePoint({x:49,y:27},[edge],s.combat.area);
 assert.ok(!fieldContains(edge,safe));assert.ok(safe.x<=s.combat.area.maxX&&safe.y<=s.combat.area.maxY);
});
test('automatic avoidance exits lava and normal approach does not walk back into it',()=>{
 const s=start(),b=s.combat.enemies[0];s.position=30;s.positionY=6;
 for(let i=0;i<40;i++){s.clock+=100;raidFieldsTick(s,[s],b,noDamage);}
 assert.ok(!s.combat.raidEncounter.fires.some((f:Rules)=>fieldContains(f,s)));
 s.combat.raidEncounter.fires=[{...rectangleField(0,2,-10,10),terrain:true,until:s.clock+10000}];s.position=-1;s.positionY=0;
 for(let i=0;i<20;i++)moveToward(s,s,{x:8,y:0},0,s.clock);
 assert.ok(!fieldContains(s.combat.raidEncounter.fires[0],s));
});
test('deep breath covers the whole lane, damages its far end, and clears on landing',()=>{
 const s=start('onyxia'),r=s.combat.raidEncounter,b=s.combat.enemies[0];b.hp=b.maxHp*.6;
 moltenCoreTick(s,[s,...s.party],noDamage);r.nextBreath=s.clock;r.tactics.avoidFire=false;
 moltenCoreTick(s,[s,...s.party],noDamage);const f=r.fires.find((f:Rules)=>f.label==='深呼吸');assert.ok(f?.points);
 s.position=49;s.positionY=r.breath.lane;s.party[0].position=49;s.party[0].positionY=r.breath.lane+6;s.clock=f.armedAt;
 const hits:string[]=[];moltenCoreTick(s,[s,s.party[0]],(_s:Rules,_b:Rules,c:Rules,_n:number,label:string)=>{if(label==='深呼吸')hits.push(c.id);});assert.deepEqual(hits,[s.id]);
 b.hp=b.maxHp*.39;moltenCoreTick(s,[s,...s.party],noDamage);assert.ok(!r.fires.some((f:Rules)=>f.label==='深呼吸'));assert.ok(r.fires.some((f:Rules)=>f.label==='熔岩裂隙'));
});
test('bomb markers follow actors, and client projection preserves authoritative lava points',()=>{
 const s=start('baron-geddon'),r=s.combat.raidEncounter;r.bombs=[{actorId:s.id,at:s.clock+7000}];s.position=12;s.positionY=-8;
 const marker=raidFieldPresentation(s.combat,[s],s.clock)[0];assert.equal(marker.radius,9);assert.deepEqual(marker.center,{x:12,y:-8});
 const lava=start(),presentation=battlePresentation(lava),snapshot=projectClientSnapshot(lava,{battleView:presentation});
 assert.deepEqual((snapshot.view.battleView as Rules).groundEffects[0].points,lava.combat.raidEncounter.fires[0].points);
});
test('Garr explosions, Geddon inferno and Shazzrah pulse publish damage fields',()=>{
 const g=start('garr');g.combat.enemies[1].hp=0;moltenCoreTick(g,[g,...g.party],noDamage);assert.ok(g.combat.raidEncounter.fires.some((f:Rules)=>f.label==='火誓者爆炸'&&f.armedAt>g.clock));
 for(const [id,label] of [['baron-geddon','地狱火'],['shazzrah','魔爆术']]){const s=start(id);s.clock=s.combat.raidEncounter.nextPulse;moltenCoreTick(s,[s,...s.party],noDamage);assert.ok(s.combat.raidEncounter.fires.some((f:Rules)=>f.label===label&&f.followId===s.combat.enemies[0].id));}
});
