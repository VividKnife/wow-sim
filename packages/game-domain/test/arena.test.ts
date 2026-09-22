import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../src/rules/engine.js';
import {arenaView} from '../src/rules/arena.js';
import {recruit,companionSkills} from '../src/rules/party.js';
import {stats,spellInfo,clone} from '../src/rules/character.js';
import {spells} from '../src/rules/catalog.js';
import {pvpApplyControl,pvpAbilityAllowed,unitCreatureType,pvpTriggeredControl} from '../src/rules/pvp-runtime.js';
import {effectiveArmor} from '../src/rules/companion-combat.js';
import {canPolymorph} from '../src/rules/polymorph.js';
import {addCombatAura,controlled,rooted} from '../../sim-core/src/combat-auras.js';
import {pvpControlRemaining,syncPvpDiminishing,breakPvpControls} from '../../sim-core/src/pvp-control.js';
import {arenaMaps,arenaPath,clearArenaSegment,arenaClipMove,arenaSight} from '../../sim-core/src/arena-space.js';
import {distance,point} from '../../sim-core/src/geometry.js';
import {moveToward} from '../src/rules/combat-space.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Rules} from '../src/model.ts';

function roster(size=3,level=20):Rules{
 const s:Rules=createGame('竞技队长',123,0);s.level=level;s.learned=companionSkills(s);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 for(const [id,role]of [['rogue','melee'],['priest','healer'],['warrior','melee'],['hunter','ranged']].slice(0,size-1))recruit(s,id,{role});return s;
}
function prepare(size=3,mapId='courtyard',opponentId='rmp',level=20){const s=roster(size,level);return act(s,{type:'arenaPrepare',size,mapId,opponentId,memberIds:[s.id,...s.party.map((c:Rules)=>c.id)]},0) as Rules;}
function start(s:Rules){return act(s,{type:'arenaStart',matchId:s.arena.id,revision:s.arena.planRevision,plan:s.arena.teams[0].plan},s.wallAt) as Rules;}

test('preparation is unlimited, frozen, serializable and starts only after explicit validated command',()=>{
 const s=prepare(),frozen=JSON.stringify(s.arena),later=advance(s,7*86400000,{maxTicks:1});
 assert.equal(later.complete,true);assert.equal(JSON.stringify(later.state.arena),frozen);
 assert.equal(later.state.activity.type,'arenaPrepare');assert.equal(start(later.state).arena.phase,'countdown');
 const invalid=clone(s.arena.teams[0].plan);invalid.focusId=invalid.controlId;
 assert.throws(()=>act(s,{type:'arenaStart',matchId:s.arena.id,revision:0,plan:invalid},0),/不同/);
 assert.equal(s.arena.phase,'preparing');
 assert.throws(()=>act(s,{type:'hunt',id:1},0),/竞技场/);
 assert.equal(act(s,{type:'arenaCancel',matchId:s.arena.id},0).activity.type,'idle');
});
test('preparation validates roster ownership, strategy members, stale revisions and map positions',()=>{
 const s=roster();assert.throws(()=>act(s,{type:'arenaPrepare',size:3,mapId:'courtyard',opponentId:'rmp',memberIds:[s.id,s.id,'other']},0),/不重复/);
 const prepared=prepare(),plan=clone(prepared.arena.teams[0].plan);
 plan.assignments[0].actorId='not-owned';assert.throws(()=>act(prepared,{type:'arenaSave',matchId:prepared.arena.id,revision:0,plan},0),/成员/);
 assert.throws(()=>act(prepared,{type:'arenaSave',matchId:prepared.arena.id,revision:5,plan:prepared.arena.teams[0].plan},0),/其他页面/);
 const positions={...prepared.arena.teams[0].plan,positions:[{id:'arena:0:0',x:0,y:-8}]};assert.throws(()=>act(prepared,{type:'arenaStart',matchId:prepared.arena.id,revision:0,plan:positions},0),/出生区/);
});
test('battle countdown freezes actors and NPC combat uses character spells with no PvE state changes',()=>{
 const initial=prepare(),s=start(initial),before=JSON.stringify(s.arena.teams);
 assert.equal(JSON.stringify(advance(s,2900).state.arena.teams),before);
 const result=advance(s,30000).state;
 assert.ok(Object.values(result.arena.metrics.actors).some((r:any)=>r.actorId.startsWith('arena:1:')&&r.damage>0));
 assert.ok(result.arena.teams[1].members.every((c:Rules)=>c.classId&&c.pvp&&!c.entry));
 assert.equal(result.hp,initial.hp);assert.equal(result.mana,initial.mana);assert.deepEqual(result.party,initial.party);assert.deepEqual(result.bag,initial.bag);assert.equal(result.money,initial.money);assert.deepEqual(result.totals,initial.totals);
 assert.ok(result.arena.teams.flatMap((t:Rules)=>t.members).every((c:Rules)=>Number.isFinite(c.hp)&&!Object.hasOwn(c,'combat')&&!Object.hasOwn(c,'party')));
});
test('split advancement and serialization preserve arena decisions and RNG',()=>{
 const s=start(prepare(3,'four-pillars','casters'));
 const direct=advance(s,12000).state;
 let split=advance(s,5100).state;split=advance(JSON.parse(JSON.stringify(split)),12000).state;
 assert.deepEqual(split.arena,direct.arena);
});
test('all formats and NPC rosters run, including summons, without illegal numerical state',()=>{
 for(const size of [2,3,5])for(const opponent of ['rmp','cleave','casters']){
  let s=start(prepare(size,'courtyard',opponent));s=advance(s,18000).state;
  for(const team of s.arena.teams)for(const c of team.members){assert.ok(Number.isFinite(c.hp)&&c.hp>=0,`${size}/${opponent}/${c.name}`);assert.ok(Number.isFinite(c.mana));}
  assert.ok(s.arena.metrics.actors['arena:1:0']);
 }
});
test('surrender concludes once and leaves adventuring health and inventory untouched',()=>{
 const s=start(prepare()),result=act(s,{type:'arenaSurrender',matchId:s.arena.id},0);
 assert.equal(result.arena.result.winner,1);assert.equal(result.activity.type,'idle');assert.equal(result.hp,s.hp);
 assert.throws(()=>act(result,{type:'arenaSurrender',matchId:s.arena.id},0),/没有正在/);
});
test('pillars block both line of sight and swept movement; paths go around inflated obstacles',()=>{
 const map=arenaMaps[0],from={x:-10,y:-8},to={x:10,y:-8};
 assert.equal(clearArenaSegment(map,from,to),false);const end=arenaClipMove(map,from,to);assert.ok(end.x<-3);
 const path=arenaPath(map,from,to);assert.ok(path.length>1);let previous=from;
 for(const next of path){assert.equal(clearArenaSegment(map,previous,next,.45),true);previous=next;}assert.deepEqual(previous,to);
 assert.equal(arenaSight({pvp:true,arenaArea:map,...from},to),false);
});
test('a warrior pinned at a pillar corner reaches melee range and resumes attacks',()=>{
 const s=roster(1,60);recruit(s,'warrior',{role:'tank'});recruit(s,'priest',{role:'healer'});
 const ready=act(s,{type:'arenaPrepare',size:3,mapId:'courtyard',opponentId:'rmp',memberIds:[s.id,...s.party.map((c:Rules)=>c.id)]},0);
 const started=start(ready),[captain,warrior,healer]=started.arena.teams[0].members,[rogue,mage,priest]=started.arena.teams[1].members;
 // Coordinates captured from the stalled preview battle. The nearest graph
 // node is less than .8 yards away, but skipping it cuts through the pillar.
 captain.hp=rogue.hp=0;
 Object.assign(warrior,{position:-1.20237757014271,positionY:11.233695738331349});
 Object.assign(mage,{position:-6.824879156133078,positionY:4.83475098539979});
 for(const c of [healer,mage,priest]){c.nextAction=100000;c.nextSwing=100000;c.rootUntil=100000;}
 for(const a of started.arena.teams[0].plan.assignments){a.retreatBelow=0;a.leash=50;}
 const result=advance(started,8000).state,actor=result.arena.teams[0].members[1],target=result.arena.teams[1].members[1];
 assert.ok(distance(actor,target)<=5,'warrior must reach the new focus after the first target dies');
 assert.ok(result.arena.logs.some((e:Rules)=>e.actorId===actor.id&&e.targetId===target.id&&e.kind==='damage'&&e.amount>0),'warrior must resume dealing damage');
});

test('pillar steering stays collision-free across corners, cached paths and both maps',()=>{
 for(const area of arenaMaps)for(const obstacle of area.obstacles)for(const angle of [0,.6,1.5,2.7,4.2]){
  const radius=obstacle.radius+2;
  const from={x:obstacle.x+Math.cos(angle)*radius,y:obstacle.y+Math.sin(angle)*radius};
  const target={x:obstacle.x-Math.cos(angle)*radius,y:obstacle.y-Math.sin(angle)*radius};
  const unit:Rules={pvp:true,arenaArea:area,position:from.x,positionY:from.y,moveSpeed:7,talents:{},auras:[]};
  // An obsolete direct path must be discarded immediately, not retried into collision.
  unit.arenaPath={target,until:60000,points:[target]};
  for(let clock=0;clock<10000&&distance(unit,target)>.01;clock+=100){
   const before=point(unit);moveToward({combat:{pvp:true,area}},unit,target,0,clock);
   assert.ok(clearArenaSegment(area,before,unit,.45),'movement must never cross a pillar');
  }
  assert.ok(distance(unit,target)<.01,`${area.id}: path around pillar at ${obstacle.x},${obstacle.y}, angle ${angle}`);
 }
});

test('PvP polymorph accepts humanoid characters but rejects druid animal forms',()=>{
 const s=prepare(),target=s.arena.teams[1].members[0],sp=spellInfo(s.arena.teams[0].members[0],12824);
 assert.equal(canPolymorph(target,sp),true);target.classId=11;target.form='bear';assert.equal(unitCreatureType(target),1);assert.equal(canPolymorph(target,sp),false);
 target.form=null;assert.equal(canPolymorph(target,sp),true);target.totemUnit=true;assert.equal(canPolymorph(target,sp),false);
});
test('control DR is shared across casters, serialized and reset only after control ended',()=>{
 const s=prepare(),c=s.arena.teams[0].members[0],target=s.arena.teams[1].members[0],sp=spellInfo(c,118);
 for(let i=0;i<3;i++){pvpApplyControl({clock:i*100}, {...c,id:'caster'+i},target,sp,5,8000);assert.equal(target.auras.at(-1).until-i*100,8000/2**i);target.auras=[];syncPvpDiminishing(target,i*100);}
 assert.equal(pvpControlRemaining(target,118,400,8000),0);assert.equal(pvpControlRemaining(JSON.parse(JSON.stringify(target)),118,15201,8000),8000);
});
test('damage breaks polymorph while root does not silence or stun its victim',()=>{
 const s=prepare(),c=s.arena.teams[0].members[0],target=s.arena.teams[1].members[0];
 pvpApplyControl({clock:0},c,target,spellInfo(c,118),5,8000);assert.equal(controlled(target,10),true);
 breakPvpControls(target,20,1,()=>1);assert.equal(controlled(target,20),false);
 pvpApplyControl({clock:30},c,target,spellInfo(c,122),26,8000);assert.equal(rooted(target,40),true);assert.equal(controlled(target,40),false);
});
test('mechanic immunity prevents control without consuming DR, taunt cannot direct NPC arena players',()=>{
 const s=prepare(),c=s.arena.teams[0].members[0],target=s.arena.teams[1].members[0],sp=spellInfo(c,118);
 addCombatAura(target,{spell:999,effect:1,type:77,misc:sp.Mechanic||sp.EffectMechanic1,until:5000},0);
 pvpApplyControl({clock:0},c,target,sp,5,8000);assert.equal(controlled(target,1),false);assert.deepEqual(target.diminishing,{});
 assert.equal(pvpAbilityAllowed(c,target,spells[355],0),false);
});
test('public snapshot exposes preparation and combat projection but not internal NPC strategies or random state',()=>{
 const s=prepare(),view=arenaView(s),snapshot=projectClientSnapshot(s,{arena:view});
 assert.ok((snapshot.view as any).arena.match);assert.equal(snapshot.player.arena,undefined);
 const text=JSON.stringify((snapshot.view as any).arena.match);assert.equal(text.includes('rngState'),false);assert.equal(text.includes('baseRules'),false);
});


test('triggered stuns and roots use separate shared DR; character armor auras apply once',()=>{
 const s=prepare(),c=s.arena.teams[0].members[0],target=s.arena.teams[1].members[0];
 pvpTriggeredControl({clock:0},c,target,12355,12,2000);
 assert.equal(target.auras.at(-1).until,2000);
 target.auras=[];syncPvpDiminishing(target,10);
 pvpTriggeredControl({clock:20},c,target,18093,12,3000);
 assert.equal(target.auras.at(-1).until,1520);
 pvpTriggeredControl({clock:20},c,target,12494,26,5000);
 assert.equal(target.auras.at(-1).until,5020);
 addCombatAura(target,{spell:999,type:22,misc:1,amount:100,until:5000},20);
 target.time=20;target.armor=stats(target).armor;
 assert.equal(effectiveArmor(target,20),stats(target).armor);
 target.classId=5;target.form='shadow';assert.equal(canPolymorph(target,spellInfo(c,118)),true);
});
test('service persists preparation, survives restart, accepts local checkpoints and restores world state',async()=>{
 const store=new MemoryStore();let now=1000;
 let service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>283});
 const save=await service.createSave('arena-user',{name:'Arena captain',classId:8,raceId:1,raidReady:true},'arena');
 const original=await service.snapshot(save.id);
 const prepared=await service.command(save.id,{type:'arenaPrepare',size:5,mapId:'four-pillars',opponentId:'casters',memberIds:[original.state.id,...original.state.party.map((c:Rules)=>c.id)],requestId:'prepare'});
 const frozen=clone(prepared.state.arena);
 now+=86400000;service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>283});
 const restored=await service.snapshot(save.id);assert.deepEqual(restored.state.arena,frozen);
 const started=await service.command(save.id,{type:'arenaStart',matchId:frozen.id,revision:0,plan:frozen.teams[0].plan,requestId:'start'});
 assert.equal(started.state.arena.phase,'countdown');
 const base={ownerId:started.localSimulation!.ownerId,characterId:started.state.id,clientId:'arena-browser',contentVersion:'test'};
 const session=await service.localSimulation(save.id,{...base,type:'claim',requestId:'claim'});
 now+=12000;const expected=advance(session.state,now).state;
 const saved=await service.localSimulation(save.id,{...base,type:'checkpoint',sessionId:session.session.id,sequence:1,state:expected,requestId:'checkpoint'});
 assert.deepEqual(saved.state.arena,expected.arena);
 const finished=await service.command(save.id,{type:'arenaSurrender',matchId:frozen.id,localClientId:base.clientId,localSessionId:saved.session.id,requestId:'surrender'});
 assert.equal(finished.state.activity.type,'idle');assert.equal(finished.state.hp,original.state.hp);assert.deepEqual(finished.state.equipment,original.state.equipment);
 assert.equal(finished.state.arena.result.winner,1);
});
