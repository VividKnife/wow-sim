import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advanceOwned,stats} from '../src/rules/engine.js';
import {startCombat,executeCombatIntent} from '../src/rules/combat.js';
import {newCharacter} from '../src/rules/character.js';
import {combatCommandAction} from '../src/rules/combat-command.js';
import {teamMovementTask,stepTeamMovement,pruneTeamMovement} from '../src/rules/team-movement.js';
import {dungeonCharmTick} from '../src/rules/dungeon-boss-ai.js';
import {projectCombatObservation} from '../src/rules/combat-observation.js';
import {point,distance} from '../../sim-core/src/geometry.js';
import {clearSceneSegment} from '../../sim-core/src/scene-space.js';
import {moveToward} from '../src/rules/combat-space.js';
import {validateRuleAction} from '../../protocol/src/rule-action.ts';

function fixture(){
 const s=createGame('站位法师',281,0,{classId:8,raceId:1});s.id='mage';s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];
 const ally=newCharacter('站位战士',1,60,1);ally.id='ally';ally.hp=stats(ally).maxHp;ally.rules=[];s.party=[ally];
 startCombat(s,[636],true,null,{id:'orders-room',shape:'rectangle',minX:-25,maxX:25,minY:-15,maxY:15,navigationRevision:0,obstacles:[{x:0,y:0,radius:3}]});delete s.combat.pull;
 for(const c of [s,ally])Object.assign(c,{position:-10,positionY:0,nextSwing:999999,nextAction:0,strategyPolicy:{waitForTank:false}});
 for(const e of s.combat.enemies)Object.assign(e,{position:20,positionY:10,hp:100000,maxHp:100000,stunUntil:999999,nextSpell:999999,nextAttack:999999});
 return s;
}
function order(s,kind,extra={}){const action={type:'combatCommand',encounterId:s.combat.id,order:kind,...extra};validateRuleAction(action);return act(s,action,s.wallAt);}
const advance=(s,ms)=>advanceOwned(s,s.wallAt+ms).state;
const move=(s,ids=['mage'],destination={x:10,y:0})=>order(s,'moveTo',{memberIds:ids,destination});

test('group station tasks use bounded obstacle-safe movement, survive restore and hold without auto chasing',()=>{
 let s=move(fixture(),['mage','ally']);s=advance(s,800);const restored=JSON.parse(JSON.stringify(s));
 for(let n=0;n<90;n++){
  const previous=point(s);s=advance(s,100);advance(restored,100);
  assert.ok(distance(previous,s)<=.70000001);assert.ok(clearSceneSegment(s.combat.area,previous,s,.45));
 }
 assert.deepEqual(s,restored);
 for(const c of [s,...s.party]){assert.equal(teamMovementTask(s,c).status,'holding');assert.ok(distance(c,{x:10,y:0})<=.75000001);}
 const before=point(s);s=advance(s,1000);assert.deepEqual(point(s),before);
 const intent={kind:'move',mode:'toward',targetId:s.combat.enemies[0].id,range:0};
 assert.deepEqual(executeCombatIntent(s,s,intent),{accepted:false,reason:'assigned-position'});
 assert.equal(moveToward(s,s,{x:20,y:10},0,s.clock),false);
 assert.deepEqual(projectCombatObservation(s).combat.command.movementTasks,s.combat.command.movementTasks);
});

test('manual takeover cancels casts and queued inputs without undoing costs; auto and explicit spell cancel station tasks',()=>{
 let s=fixture();s.learned.push(133);s=order(s,'cast',{memberId:s.id,spellId:133,targetId:s.combat.enemies[0].id});
 s.cast={spell:133,until:3000};s.globalCooldowns={133:1500};const mana=s.mana;
 s=move(s);assert.equal(s.cast,null);assert.equal(s.mana,mana);assert.equal(s.globalCooldowns[133],1500);assert.equal(s.combat.command.inputs.length,0);
 s=move(s,['mage'],{x:-5,y:5});assert.equal(s.combat.command.movementTasks.length,1);assert.equal(s.combat.command.movementResults.at(-1).status,'cancelled');
 s=order(s,'cast',{memberId:s.id,spellId:133,targetId:s.combat.enemies[0].id});assert.equal(s.combat.command.movementTasks.length,0);
 s=move(s,['mage','ally']);s=order(s,'mode',{mode:'auto',memberId:'mage'});assert.equal(s.combat.command.movementTasks.length,1);
 s=order(s,'clearAll');assert.equal(s.combat.command.movementTasks.length,0);
});

test('pause, root, blocked route and navigation change retain an honest task cursor',()=>{
 let s=move(fixture());s=order(s,'pause');const before=point(s),time=s.clock;s=advance(s,1000);assert.deepEqual(point(s),before);assert.equal(s.clock,time);
 s=order(s,'resume');s.rootUntil=s.clock+500;s=advance(s,200);assert.deepEqual(point(s),before);assert.equal(teamMovementTask(s,s).status,'blocked');
 s.rootUntil=0;s.combat.area.obstacles=[{x:0,y:0,radius:16}];s.combat.area.navigationRevision++;
 s=advance(s,100);assert.equal(teamMovementTask(s,s).status,'blocked');assert.deepEqual(point(s),before);
 s.combat.area.obstacles=[];s.combat.area.navigationRevision++;s=advance(s,100);assert.equal(teamMovementTask(s,s).status,'moving');assert.ok(distance(before,s)>0);
 s.hp=0;s=advance(s,100);assert.equal(s.combat.command.movementTasks.length,0);assert.equal(s.combat.command.movementResults.at(-1).status,'failed');
});

test('invalid group or destination is rejected without mutation; receipts stay bounded',()=>{
 const s=fixture(),before=structuredClone(s);
 for(const extra of [{memberIds:['mage','mage']},{memberIds:['outsider']},{memberIds:[]},{destination:{x:0,y:0}},{destination:{x:NaN,y:0}},{destination:{x:100,y:0}},{destination:{x:1,y:1,hp:4}},{encounterId:'old'}]){
  assert.throws(()=>order(s,'moveTo',{memberIds:['mage'],destination:{x:10,y:0},...extra}));assert.deepEqual(s,before);
 }
 for(let i=0;i<80;i++)combatCommandAction(s,{order:'moveTo',encounterId:s.combat.id,memberIds:['mage'],destination:{x:10,y:0}});
 assert.equal(s.combat.command.movementTasks.length,1);assert.equal(s.combat.command.movementResults.length,40);assert.equal(s.combat.command.movementSequence,80);
});

test('holding permits legal stationary spell policy and forced movement can displace an assigned actor',()=>{
 let s=fixture();s.combat.area.obstacles=[];s.position=10;s.positionY=0;s.rules=[{spell:133,condition:'always',value:0,enabled:true}];
 s=move(s);s=advance(s,500);assert.equal(teamMovementTask(s,s).status,'holding');assert.equal(s.cast?.spell,133);
 assert.equal(moveToward(s,s,{x:5,y:5},0,s.clock,100,{source:'hazard'}),true);
 s=advance(s,100);assert.ok(['moving','holding'].includes(teamMovementTask(s,s).status));
});

test('only published hazards suspend a station task and explicitly assigned soaking is preserved',()=>{
 let s=move(fixture(),['mage'],{x:-5,y:5});
 const field={center:{x:-5,y:5},radius:2,startedAt:1000,until:5000};
 s.combat.raidEncounter={tactics:{avoidFire:true},fires:[field]};
 const before=point(s);stepTeamMovement(s,s);assert.ok(distance(before,s)>0,'unannounced fields cannot guide the task');
 field.startedAt=0;const safe=point(s);assert.equal(stepTeamMovement(s,s),false);assert.deepEqual(point(s),safe);
 assert.equal(teamMovementTask(s,s).reason,'站位点处于已公开危险区');
 field.soakActorId=s.id;stepTeamMovement(s,s);assert.ok(distance(safe,s)>0,'the assigned soak target may enter its field');
});

test('enemy charm retains forced movement authority over a player station task',()=>{
 const s=move(fixture());s.combat.dungeon='test';s.combat.area.obstacles=[];s.party[0].position=10;
 s.auras=[{type:6,until:5000,caster:s.combat.enemies[0].id,spell:1}];
 pruneTeamMovement(s,[s,...s.party]);assert.equal(teamMovementTask(s,s).reason,'成员被敌方控制');
 const before=point(s);assert.equal(dungeonCharmTick(s,s,[s,...s.party],()=>{}),true);assert.ok(distance(s,before)>0);
});
