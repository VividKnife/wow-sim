import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {newCharacter} from '../src/rules/character.js';
import {startCombat,commandCombatCast,combatTick,executeCombatIntent} from '../src/rules/combat.js';
import {selectCombatPolicy} from '../src/rules/bot-strategies.js';
import {projectCombatObservation} from '../src/rules/combat-observation.js';
import {rescueTarget} from '../src/rules/combat-positioning.js';
import {selectCompanion,companionTarget} from '../src/rules/companion-combat.js';

function fixture(classId,seed=727){
 const spellId=classId===1?355:6795;
 const s=createGame('副坦',seed,0,{classId,raceId:classId===11?4:1});
 s.id='off';s.level=60;s.learned=[spellId,71];s.stance='defensive';if(classId===11)s.form='bear';
 s.rules=[{spell:spellId,enabled:true,condition:'always',value:0}];s.strategyPolicy={role:'tank',waitForTank:false};
 s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rage=1000;
 const main=newCharacter('主坦',1,60,1),healer=newCharacter('治疗',5,60,1);
 Object.assign(main,{id:'main',raidMainTank:true,strategyPolicy:{role:'tank'},hp:2000});
 Object.assign(healer,{id:'healer',strategyPolicy:{role:'healer'},hp:2000});
 s.party=[main,healer];startCombat(s,[636,636],true);delete s.combat.pull;
 for(const c of [s,...s.party])Object.assign(c,{position:0,positionY:0,nextSwing:999999});
 for(const e of s.combat.enemies)Object.assign(e,{position:3,positionY:0,target:'main',hp:1000000,maxHp:1000000,nextAttack:999999,nextSpell:999999,threat:{main:1000}});
 s.combat.raidEncounter={};s.raidTargetId=s.combat.enemies[0].id;main.raidTargetId=s.raidTargetId;
 return {s,spellId,main,healer,enemy:s.combat.enemies[0],add:s.combat.enemies[1]};
}

for(const classId of [1,11])test(`class ${classId} taunts rescue loose enemies without fighting the main tank`,()=>{
 const {s,spellId,main,enemy}=fixture(classId);
 assert.notEqual(selectCombatPolicy(s,s)?.spellId,spellId);
 enemy.target='healer';assert.equal(selectCombatPolicy(s,s)?.spellId,spellId);
 enemy.target='main';main.hp=0;assert.equal(selectCombatPolicy(s,s)?.spellId,spellId);
 main.hp=2000;main.raidMainTank=false;s.raidMainTank=true;
 const intent=selectCombatPolicy(s,s);assert.equal(intent.spellId,spellId);
 const observed=projectCombatObservation(s);assert.deepEqual(selectCombatPolicy(observed,observed),intent);
 s.strategyPolicy.role='melee';enemy.target='healer';assert.notEqual(selectCombatPolicy(s,s)?.spellId,spellId);
});

for(const classId of [1,11])test(`class ${classId} manual taunt can override tank assignment through normal validation`,()=>{
 const {s,spellId,enemy}=fixture(classId);commandCombatCast(s,s,spellId,enemy.id);
 assert.equal(enemy.tauntedBy,s.id);
 assert.equal(enemy.threat[s.id],1000);
 assert.throws(()=>commandCombatCast(s,s,spellId,enemy.id),/冷却/);
 s.clock=100;combatTick(s);
 assert.ok(s.logs.some(l=>l.kind==='cast'&&l.actorId===s.id&&l.spellId===spellId));
});

for(const classId of [1,11])test(`class ${classId} rechecks tank ownership when a delayed automatic taunt executes`,()=>{
 const {s,spellId,enemy}=fixture(classId);enemy.target='healer';
 const intent=selectCombatPolicy(s,s);assert.equal(intent.spellId,spellId);
 enemy.target='main';const before=structuredClone(s);
 assert.deepEqual(executeCombatIntent(s,s,intent),{accepted:false,reason:'tank-assignment'});
 assert.deepEqual(s,before);
});

test('manual growl rejects friendly targets and non-bear form without mutating combat',()=>{
 const {s,spellId,enemy,main}=fixture(11),before=structuredClone(s);
 assert.throws(()=>commandCombatCast(s,s,spellId,main.id),/目标类型/);assert.deepEqual(s,before);
 s.form=null;const humanoid=structuredClone(s);
 assert.throws(()=>commandCombatCast(s,s,spellId,enemy.id),/姿态/);assert.deepEqual(s,humanoid);
});

test('tank rescue targets a threatened healer before another tank',()=>{
 const {s,enemy,add}=fixture(1);delete s.combat.raidEncounter;add.target='healer';
 assert.equal(rescueTarget(s,s,[enemy,add]),add);
});

test('raid backups rescue loose adds while the main tank holds the boss; air-phase main tank can rescue too',()=>{
 const {s,enemy,add}=fixture(1);add.target='healer';add.summonedBy=enemy.id;
 assert.equal(companionTarget(s,s,[enemy,add]),add);
 s.raidMainTank=true;assert.equal(companionTarget(s,s,[enemy,add]),enemy);
 s.raidTargetId=add.id;assert.equal(companionTarget(s,s,[enemy,add]),add);
 const o=projectCombatObservation(s);
 assert.equal(companionTarget(o,o,o.combat.enemies).id,add.id);
});

test('unestablished personal threat is not a reason to rescue a mob held by an allied tank',()=>{
 const {s,enemy}=fixture(1);assert.equal(rescueTarget(s,s,[enemy]),null);
});

test('main tank continues building Sunder threat at five stacks while backup and DPS avoid redundant casts',()=>{
 const {s,enemy}=fixture(1);s.learned.push(11597);
 const rules=[{spell:11597,enabled:true,condition:'always',value:0}];
 enemy.sunder={stacks:5,until:30000,amount:450};s.raidMainTank=true;
 const select=()=>selectCompanion(s,s,[enemy],[s,...s.party],null,null,null,rules);
 assert.equal(select()?.spellId,11597);
 s.raidMainTank=false;assert.notEqual(select()?.spellId,11597);
 enemy.target=s.id;assert.equal(select()?.spellId,11597);
 s.strategyPolicy.role='melee';assert.notEqual(select()?.spellId,11597);
 s.strategyPolicy.role='tank';s.rage=0;assert.notEqual(select()?.spellId,11597);
});

for(const classId of [1,11])test(`class ${classId} builds threat during its taunt before chasing the next loose add`,()=>{
 const {s,spellId,enemy,add}=fixture(classId);
 enemy.target='healer';add.target='healer';enemy.summonedBy='boss';s.raidTargetId=enemy.id;
 commandCombatCast(s,s,spellId,enemy.id);
 assert.equal(enemy.target,s.id);assert.ok(enemy.tauntUntil>s.clock);
 assert.equal(companionTarget(s,s,[enemy,add]),enemy,'do not abandon the pickup before ordinary attacks build threat');
 const observation=projectCombatObservation(s);
 assert.equal(companionTarget(observation,observation,observation.combat.enemies).id,enemy.id);
 s.clock=enemy.tauntUntil;
 assert.equal(companionTarget(s,s,[enemy,add]),add,'the forced-focus window is bounded, then rescue the next ally');
});

test('a rescued add receives real Sunder threat before the tank starts another pickup',()=>{
 const {s,spellId,enemy,add}=fixture(1,2026);enemy.target=add.target='healer';enemy.summonedBy='boss';
 s.learned.push(11597);s.rules.push({spell:11597,enabled:true,condition:'always',value:0});
 commandCombatCast(s,s,spellId,enemy.id);const copiedThreat=enemy.threat[s.id];
 s.clock=1500;const intent=selectCombatPolicy(s,s);
 assert.equal(intent?.spellId,11597);assert.equal(intent?.targetId,enemy.id);
 assert.equal(executeCombatIntent(s,s,intent).accepted,true);
 assert.equal(enemy.threat[s.id],copiedThreat+261*1.3,'rank 5 adds its own source threat with Defensive Stance, not zero or rank 1 fallback');
 assert.equal(enemy.sunder.stacks,1);assert.equal(add.sunder,undefined);
 s.clock=enemy.tauntUntil;assert.equal(companionTarget(s,s,[enemy,add]),add);
});
