import {selectCombatPolicy} from '../src/rules/combat.js';
import {projectCombatObservation} from '../src/rules/combat-observation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {newCharacter,stats,spellInfo} from '../src/rules/character.js';
import {raidHealMetrics,selectRaidHealing,projectRaidHealingTargets} from '../src/rules/raid-healing-policy.js';

function fixture(classId,ids){
 const c=newCharacter('治疗',classId,60,classId===7?2:classId===11?4:1);
 Object.assign(c,{id:'healer',position:0,positionY:0,strategyPolicy:{role:'healer',waitForTank:false},learned:ids,rules:ids.map(spell=>({spell,enabled:true,condition:'always',value:0}))});
 c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;
 const target={id:'tank',name:'坦克',escortNpc:true,classId:1,level:60,hp:5000,maxHp:10000,position:0,positionY:0,auras:[],dots:[],threat:{}};
 const enemy={id:'enemy',hp:10000,maxHp:10000,level:60,position:10,positionY:0,auras:[],dots:[],threat:{tank:1000},target:'tank'};
 const s={clock:10000,party:[c],combat:{id:'raid',enemies:[enemy],raidEncounter:{command:{healingMode:'normal',plan:{cooldowns:{}},events:[]}}}};
 return {s,c,target,enemy,actors:[c,target]};
}

test('shaman chooses high HPS normally and high HPM on conservation at the same health',()=>{
 const {s,c,target,enemy,actors}=fixture(7,[25357,10468]);
 assert.equal(selectRaidHealing(s,c,enemy,actors).spellId,10468);
 s.combat.raidEncounter.command.healingMode='conserve';
 assert.equal(selectRaidHealing(s,c,enemy,actors).spellId,25357);
 target.hp=2000;
 assert.equal(selectRaidHealing(s,c,enemy,actors).spellId,10468,'critical allies get the faster direct heal even in HPM mode');
 c.cooldowns[8004]=s.clock+10000;
 assert.equal(selectRaidHealing(s,c,enemy,actors).spellId,25357,'cooldown prevents an otherwise preferable heal');
 c.mana=0;assert.equal(selectRaidHealing(s,c,enemy,actors),null);
});

test('paladin compares Holy Light and Flash of Light instead of rule order',()=>{
 const {s,c,target,enemy,actors}=fixture(2,[19943,25292]);
 assert.equal(selectRaidHealing(s,c,enemy,actors)?.spellId,25292);
 s.combat.raidEncounter.command.healingMode='conserve';
 assert.equal(selectRaidHealing(s,c,enemy,actors)?.spellId,19943);
 c.rules[0].enabled=false;
 assert.equal(selectRaidHealing(s,c,enemy,actors)?.spellId,25292,'disabled skills remain disabled');
});

test('priest and druid compare direct healing and HoTs with equipment and overhealing',()=>{
 for(const [classId,ids]of [[5,[25314,25315]],[11,[25297,25299]]]){
  const {s,c,target,enemy,actors}=fixture(classId,ids);
  // A fixed +healing item is unnecessary: exercise the estimator with the same
  // current sheet interface used for equipment/talent-derived healing power.
  const sheet={...stats(c),healing:1000};
  const hot=spellInfo(c,ids[1]);
  const base=raidHealMetrics(s,c,hot,target,actors);
  const boosted=raidHealMetrics(s,c,hot,target,actors,a=>a===c?sheet:stats(a));
  assert.ok(boosted.hpm>base.hpm);assert.equal(boosted.immediate,0);
  assert.ok(boosted.hps<boosted.effective/1.5,'HoT total is not treated as immediate burst');
  assert.equal(selectRaidHealing(s,c,enemy,actors)?.spellId,ids[0]);
  target.maxHp=2600;target.hp=1300;
  assert.equal(selectRaidHealing(s,c,enemy,actors)?.spellId,ids[0]);
  s.combat.raidEncounter.command.healingMode='conserve';
  assert.equal(selectRaidHealing(s,c,enemy,actors)?.spellId,ids[1],'HPM favors the efficient HoT at the same injury');
  target.hp=500;
  assert.equal(selectRaidHealing(s,c,enemy,actors)?.spellId,ids[0],'critical allies need direct healing');
  target.maxHp=10000;target.hp=9500;
  const capped=raidHealMetrics(s,c,spellInfo(c,ids[0]),target,actors);
  assert.equal(capped.effective,500,'overhealing is excluded');
 }
});

test('chain heal scores only living targets inside bounce range with jump attenuation',()=>{
 const {s,c,target,actors}=fixture(7,[10623]),sp=spellInfo(c,10623);
 const one=raidHealMetrics(s,c,sp,target,actors);
 const near={...target,id:'near',position:5},far={...target,id:'far',position:30},dead={...target,id:'dead',hp:0};
 const two=raidHealMetrics(s,c,sp,target,[...actors,near,far,dead]);
 assert.ok(Math.abs(two.effective/one.effective-1.5)<.00001);
});

test('ranking is read-only and is scoped to raid healers',()=>{
 const {s,c,enemy,actors}=fixture(7,[25357,10468]);
 const before=structuredClone({s,c,actors});
 selectRaidHealing(s,c,enemy,actors);
 assert.deepEqual({s,c,actors},before);
 delete s.combat.raidEncounter;assert.equal(selectRaidHealing(s,c,enemy,actors),null);
});


test('live policy and worker observation follow the same HPS/HPM order',()=>{
 const {s,c,target}=fixture(7,[25357,10468]);
 Object.assign(s,target);s.combat.participantIds=[s.id,c.id];
 // A just-finished cast keeps positioning from obscuring the next spell decision.
 c.cast={spell:25357,until:s.clock,commanded:true};
 for(const [mode,id]of [['normal',10468],['conserve',25357]]){
  s.combat.raidEncounter.command.healingMode=mode;
  const local=selectCombatPolicy(s,c),observation=projectCombatObservation(s);
  assert.equal(local?.spellId,id);
  assert.deepEqual(selectCombatPolicy(observation,observation.party[0]),local);
  assert.equal(observation.combat.raidEncounter.command.plan,undefined,'private encounter plans stay private');
 }
});

test('conservation leaves safe GCDs idle instead of falling through to filler casts',()=>{
 const {s,c,target}=fixture(2,[19943,25292,20217]);Object.assign(s,target);s.hp=9000;s.combat.participantIds=[s.id,c.id];
 s.combat.raidEncounter.command.healingMode='conserve';c.target='enemy';
 const before=structuredClone(c);
 for(let at=10000;at<18000;at+=200){s.clock=at;assert.equal(selectCombatPolicy(s,c),null);}
 assert.deepEqual(c,before,'waiting neither spends mana nor starts GCDs');
 s.hp=2000;assert.equal(selectCombatPolicy(s,c)?.kind,'cast','danger immediately interrupts waiting');
});

test('conservation cancels automatic healed-target casts but respects manual casts',()=>{
 const {s,c,target}=fixture(2,[25292]);Object.assign(s,target);s.hp=9000;s.combat.participantIds=[s.id,c.id];s.combat.raidEncounter.command.healingMode='conserve';c.target='enemy';
 c.cast={spell:25292,target:s.id,startedAt:9000,until:11500,policyControlled:true};
 assert.deepEqual(selectCombatPolicy(s,c),{kind:'cancel',spellId:25292,startedAt:9000});
 c.cast.commanded=true;assert.notEqual(selectCombatPolicy(s,c)?.kind,'cancel');
 c.cast.commanded=false;s.hp=2000;assert.notEqual(selectCombatPolicy(s,c)?.kind,'cancel');
});

test('observed incoming heals prevent duplicate mana spending and survive worker projection',()=>{
 const {s,c,target}=fixture(2,[25292]);Object.assign(s,target);s.hp=7500;
 const other={...structuredClone(c),id:'other',cast:{spell:25292,target:s.id,startedAt:8000,until:10500,policyControlled:true}};
 s.party=[c,other];c.target='enemy';s.combat.participantIds=[s.id,c.id,other.id];s.combat.raidEncounter.command.healingMode='conserve';
 assert.equal(selectCombatPolicy(s,c),null);
 const observation=projectCombatObservation(s);assert.equal(selectCombatPolicy(observation,observation.party[0]),null);
 other.cast=null;assert.equal(selectCombatPolicy(s,c)?.kind,'cast');
});
test('incoming chain healing reserves each recipient separately, never the whole group on one ally',()=>{
 const {s,c,target,actors}=fixture(7,[10623]);const near={...target,id:'near',position:5};
 c.cast={spell:10623,target:target.id,until:s.clock+1000};
 const group=[...actors,near],expected=raidHealMetrics(s,c,spellInfo(c,10623),target,group).directByTarget;
 const projected=projectRaidHealingTargets(s,c,group);
 assert.equal(projected[1].hp,target.hp+expected.tank);assert.equal(projected[2].hp,near.hp+expected.near);
 assert.ok(expected.tank>expected.near);assert.equal(target.hp,5000);
});
