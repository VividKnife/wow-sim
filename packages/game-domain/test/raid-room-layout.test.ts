import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {beginMoltenCoreBattle} from '../src/rules/molten-core-battle.js';
import {moltenCoreBosses,raidNodesFor} from '../src/rules/molten-core-content.js';
import {defaultRaidTactics,moltenCoreTick} from '../src/rules/molten-core-encounter.js';
import {extendedMoltenCoreTick} from '../src/rules/molten-core-mechanics.js';
import {combatMembers} from '../src/rules/combat-members.js';
import {summonClassPet,createClassTotem} from '../src/rules/class-spell-effects.js';
import {spells} from '../src/rules/catalog.js';
import {instancePresentation} from '../src/rules/instance-presentation.js';
import {requiredRaidRoom,raidPreparationBoss} from '../src/rules/raid-room-layout.js';
import {scenePointAllowed,clearSceneSegment} from '../../sim-core/src/scene-space.js';
import {fieldContains} from '../../sim-core/src/encounter-geometry.js';
import type {Rules} from '../src/model.ts';

const base=createMoltenCoreDemo().state;
const ids=[...moltenCoreBosses.map(b=>b.id),'onyxia'];
function fixture(id:string):Rules {
 const s=structuredClone(base);
 s.goldRaid={active:true,raidId:id==='onyxia'?'onyxias-lair':'molten-core',serial:1,locationId:id,cleared:[],clearedPacks:[],phase:'camp'};
 const hunter=s.party.find((c:Rules)=>c.classId===3);hunter.hunterPet={entry:113,level:60};
 summonClassPet(s,hunter,{...spells[883],durationMs:0});
 createClassTotem(s,s,{...spells[3599],durationMs:120000});
 return s;
}
function start(id:string):Rules {const s=fixture(id);beginMoltenCoreBattle(s,id,{...defaultRaidTactics});return s;}
const noDamage=()=>{};

test('every boss prepares and pulls the same compiled floor with forty members and legal companions',()=>{
 for(const id of ids){
  const s=fixture(id),before=JSON.stringify(s),preparation=instancePresentation(s)!;
  assert.equal(preparation.memberCount,40);assert.equal(JSON.stringify(s),before);
  assert.ok(preparation.units.some((c:Rules)=>c.petUnit&&!c.totemUnit));assert.ok(preparation.units.some((c:Rules)=>c.totemUnit));
  assert.equal(preparation.area.shape,'polygon');
  assert.equal(new Set(preparation.units.filter((c:Rules)=>!c.petUnit&&!c.totemUnit).map((c:Rules)=>`${c.position}:${c.positionY}`)).size,40);
  for(const c of preparation.units)assert.ok(scenePointAllowed(preparation.area,c),`${id} preparation ${(c as Rules).id}`);
  beginMoltenCoreBattle(s,id,{...defaultRaidTactics});assert.equal(s.combat.area.geometryHash,preparation.area.geometryHash);
  assert.ok(s.combat.area.navigation.triangles.length>0);
  for(const c of [...combatMembers(s),...s.combat.enemies])assert.ok(scenePointAllowed(s.combat.area,c),`${id} pull ${c.id}`);
  if(id!=='onyxia')assert.equal(new Set(s.combat.enemies.map((c:Rules)=>`${c.position}:${c.positionY}`)).size,s.combat.enemies.length);
 }
 assert.throws(()=>requiredRaidRoom('missing-boss'),/缺少/);
});

test('preparation follows current boss, boss ready to pull, and each route branch without mutation',()=>{
 for(const node of raidNodesFor('molten-core').filter(n=>n.kind==='boss')){
  const r={raidId:'molten-core',locationId:node.parent,activeBoss:node.id,cleared:[],clearedPacks:[]};
  assert.equal(raidPreparationBoss(r),node.id);
  delete (r as Rules).activeBoss;assert.equal(raidPreparationBoss({...r,destination:node.id}),node.id);
 }
 assert.equal(raidPreparationBoss({raidId:'molten-core',locationId:'entrance',cleared:[]}), 'lucifron');
 assert.equal(raidPreparationBoss({raidId:'molten-core',locationId:'magmadar',activeBoss:'garr',cleared:['magmadar']}),'garr');
});

test('Ragnaros terrain and sons fit the room and phase transitions retain their source timings',()=>{
 const s=start('ragnaros'),r=s.combat.raidEncounter,b=s.combat.enemies[0],a=s.combat.area;
 for(const field of r.fires.filter((f:Rules)=>f.terrain))for(const p of field.points||[])assert.ok(scenePointAllowed(a,p), 'lava outside floor');
 for(const c of combatMembers(s))assert.ok(!r.fires.some((f:Rules)=>fieldContains(f,c,1)),c.id);
 s.clock=r.nextSubmerge;moltenCoreTick(s,combatMembers(s),noDamage);
 const sons=s.combat.enemies.filter((e:Rules)=>e.id.startsWith('son-'));
 assert.equal(sons.length,8);assert.equal(r.emergeAt,s.clock+90000);assert.ok(r.submerged);
 for(const c of sons){assert.ok(scenePointAllowed(a,c));assert.ok(!r.fires.filter((f:Rules)=>f.terrain).some((f:Rules)=>fieldContains(f,c,1)));}
 const restored=JSON.parse(JSON.stringify(s));
 for(const state of [s,restored]){state.combat.enemies.filter((e:Rules)=>e.id.startsWith('son-')).forEach((e:Rules)=>e.hp=0);moltenCoreTick(state,combatMembers(state),noDamage);}
 assert.equal(r.submerged,false);assert.equal(r.nextSubmerge,s.clock+180000);assert.equal(b.stunUntil,0);assert.deepEqual(restored,s);
});

test('teleports use safe destinations and bomb evacuation stays on the authored floor',()=>{
 for(const id of ['shazzrah','majordomo']){
  const s=start(id),b=s.combat.enemies[0],a=s.combat.area;
  Object.assign(s,{position:a.anchors.entrance.x,positionY:a.anchors.entrance.y});
  const points=[];for(let x=a.minX+1;x<a.maxX;x+=2)for(let y=a.minY+1;y<a.maxY;y+=2)points.push({x,y});
  const acrossWall=points.find(p=>scenePointAllowed(a,p)&&!clearSceneSegment(a,s,p,.45));assert.ok(acrossWall);
  Object.assign(b,{position:acrossWall.x,positionY:acrossWall.y});
  s.combat.raidEncounter.timers={teleport:s.clock};
  extendedMoltenCoreTick(s,combatMembers(s),b,noDamage,()=>[s]);
  if(id==='shazzrah')assert.deepEqual({x:b.position,y:b.positionY},a.anchors.entrance);
  else assert.deepEqual({x:s.position,y:s.positionY},{x:b.position,y:b.positionY});
  for(const c of [s,b])assert.ok(scenePointAllowed(a,c));
 }
 const s=start('baron-geddon'),b=s.combat.enemies[0],r=s.combat.raidEncounter;
 r.bombs=[{actorId:s.id,at:s.clock+8000}];
 const restored=JSON.parse(JSON.stringify(s));
 for(let tick=0;tick<70;tick++)for(const state of [s,restored]){state.clock+=100;extendedMoltenCoreTick(state,combatMembers(state),state.combat.enemies[0],noDamage,()=>[]);assert.ok(scenePointAllowed(state.combat.area,state));}
 const anchor=s.combat.area.anchors[s.raidIndex%2?'bombEscapeNorth':'bombEscapeSouth'];
 assert.ok(Math.hypot(s.position-anchor.x,s.positionY-anchor.y)<1);assert.deepEqual(restored,s);assert.ok(b.hp>0);
});
