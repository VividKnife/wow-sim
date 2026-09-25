import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import {spells,talents} from '../../../packages/game-domain/src/rules/catalog.js';
import {startCombat,combatTick,commandCombatCast} from '../../../packages/game-domain/src/rules/combat.js';
import {beginSpellTiming,finishSpellTiming,cooldownUntil,gcdUntil,spellReady} from '../../../packages/game-domain/src/rules/spell-timing.js';
import {spellCoefficient,spellPowerBonus} from '../../../packages/game-domain/src/rules/spell-scaling.js';
import {weaponMissChance,rollAttackTable,glanceMultiplier,spellMissChance} from '../../../packages/sim-core/src/attack-table.js';
import {executeTalentActive,onTalentEvent,beginTalentCast} from '../../../packages/game-domain/src/rules/talent-runtime.js';
import {spellCritBonus} from '../../../packages/game-domain/src/rules/talent-effects.js';
import {agilityChances,intellectCrit,baseAttackPower} from '../../../packages/sim-core/src/class-stats.js';
import {battlePresentation} from '../../../packages/game-domain/src/rules/battle-presentation.js';

function actor(classId=8){const s=createGame('规则',283,0,{classId,raceId:classId===7?2:classId===11?4:1});s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];return s;}
function talent(c,name,rank){const t=Object.values(talents).find(t=>t.classId===c.classId&&t.name===name);assert.ok(t,name);c.talents[t.id]=rank;}
function arena(classId=8){const s=actor(classId);startCombat(s,[299]);const e=s.combat.enemies[0];e.hp=e.maxHp=1e7;e.nextAttack=e.nextSpell=1e9;e.rootUntil=1e9;s.nextSwing=1e9;return s;}

test('source GCD categories cover one second, 1.5 seconds and off-GCD abilities',()=>{
 for(const [classId,id,ms]of [[4,1752,1000],[4,2098,1000],[11,1082,1000],[8,2136,1500],[5,17,1500],[7,8042,1500],[1,355,0],[8,2139,0],[4,1856,0]]){
  const c=actor(classId),sp=spellInfo(c,id);c.rage=1000;c.energy=100;c.form=classId===11?'cat':null;
  assert.equal(sp.StartRecoveryTime,ms,sp.SpellName);beginSpellTiming(c,sp,100,{cost:0});assert.equal(gcdUntil(c,sp),ms?100+ms:0,sp.SpellName);
 }
});
test('off-GCD Counterspell works during another spell GCD and keeps its category cooldown',()=>{
 const s=arena(),e=s.combat.enemies[0];s.learned=[2136,2139];e.position=10;
 commandCombatCast(s,s,2136,e.id);assert.equal(s.globalCooldowns[133],1500);
 e.cast={spell:133,until:3000};s.clock=s.time=100;commandCombatCast(s,s,2139,e.id);
 assert.equal(e.cast,null);assert.equal(e.schoolLockouts[2],10100);assert.equal(s.globalCooldowns[133],1500);
 assert.equal(cooldownUntil(s,spells[2139]),30100);
 assert.throws(()=>commandCombatCast(s,s,2139,e.id));
});
test('rogue can use the second energy ability exactly at the one-second GCD boundary',()=>{
 const s=arena(4),e=s.combat.enemies[0];s.learned=[1752];s.rules=[{spell:1752,condition:'always',value:0,enabled:true}];e.position=s.position+3;e.positionY=s.positionY;
 combatTick(s);assert.equal(s.energy,55);s.clock=999;combatTick(s);assert.equal(s.energy,55);
 s.clock=1000;combatTick(s);assert.equal(s.energy,10);
});
test('shock category recovery locks other shocks and talent reduction applies to the shared timer',()=>{
 const c=actor(7);talent(c,'Reverberation',5);const earth=spellInfo(c,8042),frost=spellInfo(c,8056);
 beginSpellTiming(c,earth,0);assert.equal(cooldownUntil(c,frost),5000);assert.equal(spellReady(c,frost,4999),false);assert.equal(spellReady(c,frost,5000),true);
});
test('rank changes cannot bypass category recovery and the public view shows the actual timer',()=>{
 const s=arena();s.learned=[2136,2137];beginSpellTiming(s,spellInfo(s,2136),0);
 assert.equal(cooldownUntil(s,spells[2137]),8000);const view=battlePresentation(s).units[s.id];
 assert.equal(view.globalCooldown,1500);assert.equal(view.cooldowns.find(x=>x.spellId===2137).readyAt,8000);
});
test('cast success pays mana and starts cooldown; cancelling leaves only the elapsed GCD',()=>{
 const c=actor(),sp={...spellInfo(c,133),spellCooldownMs:6000,categoryCooldownMs:0},mana=c.mana;
 const timing=beginSpellTiming(c,sp,0);assert.equal(c.mana,mana);assert.equal(cooldownUntil(c,sp),0);assert.equal(gcdUntil(c,sp),1500);
 assert.equal(finishSpellTiming(c,timing,3500),true);assert.equal(c.mana,mana-sp.mana);assert.equal(c.lastManaUse,3500);assert.equal(cooldownUntil(c,sp),9500);
 finishSpellTiming(c,timing,4000);assert.equal(c.mana,mana-sp.mana);assert.equal(cooldownUntil(c,sp),9500);
 const other=actor(),cost=other.mana;beginSpellTiming(other,sp,0);other.cast=null;assert.equal(other.mana,cost);assert.equal(cooldownUntil(other,sp),0);
});
test('out-of-range cast cancellation does not spend reserved resources',()=>{
 const s=arena();s.learned=[133];s.rules=[{spell:133,condition:'always',value:0,enabled:true}];const mana=s.mana;
 combatTick(s);assert.equal(s.mana,mana);s.combat.enemies[0].positionY=200;s.rules=[];s.clock=s.cast.until;combatTick(s);
 assert.equal(s.mana,mana);assert.equal(s.combat.projectiles.length,0);assert.ok(s.logs.some(l=>l.kind==='cancel'));
});
test('free spells do not restart the five-second mana rule',()=>{
 const c=actor();c.lastManaUse=-5000;beginSpellTiming(c,{...spellInfo(c,2136),mana:0},2000);assert.equal(c.lastManaUse,-5000);
});
test('Cold Snap and Preparation clear category and spell timers without clearing GCD',()=>{
 const mage=actor();mage.learned=[122,12472,11958];beginSpellTiming(mage,spellInfo(mage,122),0);const gcd=mage.globalCooldowns[133];
 executeTalentActive({clock:100},mage,mage,spells[12472]);assert.equal(cooldownUntil(mage,spells[122]),0);assert.equal(mage.globalCooldowns[133],gcd);
 const rogue=actor(4);rogue.learned=[13877,14185];beginSpellTiming(rogue,spellInfo(rogue,13877),0);assert.ok(cooldownUntil(rogue,spells[13877])>0);
 executeTalentActive({clock:100},rogue,rogue,spells[14185]);assert.equal(cooldownUntil(rogue,spells[13877]),0);
});
test('spell power uses root-rank coefficients and is independent of instant/haste talents',()=>{
 const c=actor();assert.equal(spellCoefficient(spellInfo(c,143)),1);assert.ok(spellCoefficient(spellInfo(c,2136))>0);
 const plain=spellPowerBonus({spellPower:100},spellInfo(c,133));c.talentProcs={presenceOfMind:{until:10000}};
 assert.equal(spellInfo(c,133).castMs,0);assert.equal(spellPowerBonus({spellPower:100},spellInfo(c,133)),plain);
 assert.equal(spellCoefficient(spellInfo(c,133),{periodic:true}),0,'explicit zero Fireball DOT scaling must remain zero');
});
test('Renew and Rejuvenation receive per-tick healing scaling, including downrank penalty',()=>{
 for(const [classId,id,ticks]of [[5,139,5],[11,774,4]]){const c=actor(classId),sp=spellInfo(c,id),bonus=spellPowerBonus({healing:100},sp,{healing:true,periodic:true});assert.ok(bonus>0);assert.ok(bonus*ticks<100);}
});
test('Presence of Mind is consumed on launch, with its result retained on the in-flight cast',()=>{
 const s=arena();s.learned=[133];s.talentProcs={presenceOfMind:{until:10000,token:1}};s.rules=[{spell:133,condition:'always',value:0,enabled:true}];
 combatTick(s);assert.equal(s.cast,null);assert.equal(s.talentProcs.presenceOfMind,undefined);assert.ok(s.combat.projectiles[0].talentCast.procs.presenceOfMind);
 s.clock=s.time=1500;combatTick(s);assert.ok(s.cast?.until>s.clock,'a projectile still in flight must not grant a second instant cast');
});
test('attack tables have exclusive outcomes, a crit cap and no glancing on yellow attacks',()=>{
 const chances={miss:.09,dodge:.065,parry:.14,glancing:.4,block:0,critical:1,crushing:0};
 assert.equal(rollAttackTable(.01,chances),'miss');assert.equal(rollAttackTable(.1,chances),'dodge');assert.equal(rollAttackTable(.2,chances),'parry');assert.equal(rollAttackTable(.5,chances),'glancing');assert.equal(rollAttackTable(.99,chances),'critical');
 assert.equal(rollAttackTable(.5,{...chances,glancing:0}),'critical');
});
test('weapon skill, dual wield and spell hit use separate Classic probability rules',()=>{
 assert.ok(Math.abs(weaponMissChance(300,315)-.09)<1e-9);assert.ok(Math.abs(weaponMissChance(305,315)-.06)<1e-9);
 assert.ok(Math.abs(weaponMissChance(300,300,{dualWield:true})-.24)<1e-9);
 assert.ok(Math.abs(spellMissChance(60,63)-.17)<1e-9);assert.equal(spellMissChance(60,63,1),.01);
 assert.ok(glanceMultiplier(305,315,.5)>glanceMultiplier(300,315,.5));
 assert.equal(rollAttackTable(.99,{miss:.05,dodge:.05,parry:.05,block:1,critical:.05,crushing:.15}),'block');
});
test('school-specific equipment power does not leak into other schools or healing',()=>{
 const c=actor(),base=stats(c);c.equipment[11]={id:942};const st=stats(c);
 assert.equal(st.spellPower,base.spellPower);assert.equal(st.schoolPower16-base.schoolPower16,21);assert.equal(st.healing,base.healing);
});
test('pending casts and recovery clocks are deterministic across JSON and settlement batches',()=>{
 const s=arena();s.learned=[133,2136];s.rules=[{spell:2136,condition:'always',value:0,enabled:true},{spell:133,condition:'always',value:0,enabled:true}];
 const whole=advance(s,12000).state;let parts=s;for(let t=250;t<=12000;t+=250)parts=advance(JSON.parse(JSON.stringify(parts)),t).state;
 assert.deepEqual(parts,whole);
});

test('all nine classes derive crit and dodge from agility; caster intellect changes spell crit',()=>{
 for(const classId of [1,2,3,4,5,7,8,9,11]){const low=agilityChances(classId,60,100),high=agilityChances(classId,60,120);assert.ok(high.crit>low.crit);assert.ok(high.dodge>low.dodge);}
 for(const classId of [2,5,7,8,9,11])assert.ok(intellectCrit(classId,60,200)>intellectCrit(classId,60,100));
 assert.equal(agilityChances(4,60,290).crit,.1);assert.equal(agilityChances(3,60,530).crit,.1);
 assert.equal(baseAttackPower(7,60,100,50).attackPower,300);
 assert.equal(baseAttackPower(11,60,100,50,'bear').attackPower,360);
 assert.equal(baseAttackPower(1,60,100,50).rangedAttackPower,100);
});
test('Maul waits for its weapon swing, spends rage once and does not start a GCD',()=>{
 const s=arena(11),e=s.combat.enemies[0];s.form='bear';s.learned=[6807];s.rules=[{spell:6807,condition:'always',value:0,enabled:true}];s.rage=1000;s.position=e.position-3;s.positionY=e.positionY;s.nextSwing=1000;
 combatTick(s);assert.equal(s.queuedStrike,6807);assert.equal(s.rage,1000);assert.equal(s.globalCooldowns,undefined);
 s.clock=1000;combatTick(s);assert.ok(s.rage<1000);assert.equal(s.queuedStrike,null);assert.equal(s.nextSwing,3500);
 assert.equal(s.logs.filter(l=>l.kind==='cast'&&l.spellId===6807).length,1);
});
test('Adrenaline Rush doubles normal energy ticks without granting an immediate extra tick',()=>{
 const s=arena(4);s.energy=0;s.clock=1000;executeTalentActive(s,s,s,spells[13750]);
 s.clock=1500;combatTick(s);assert.equal(s.energy,0);s.clock=2000;combatTick(s);assert.equal(s.energy,40);s.clock=4000;combatTick(s);assert.equal(s.energy,80);
});
test('Flurry charges are consumed by swings, not by special ability damage',()=>{
 const c=actor(1);c.talentProcs={flurry:{until:10000,charges:3,stats:{meleeHastePct:.3}}};const s={clock:100};
 onTalentEvent(s,c,{type:'damage',melee:true,amount:10,spell:spells[7386]});assert.equal(c.talentProcs.flurry.charges,3);
 onTalentEvent(s,c,{type:'swing'});assert.equal(c.talentProcs.flurry.charges,2);
});
test('Arcane Concentration uses expiring proc state and cancelled casts retain the free spell',()=>{
 const s=arena();talent(s,'Arcane Concentration',5);onTalentEvent(s,s,{type:'damage',spell:spells[133],amount:1},{rng:()=>0});assert.ok(s.talentProcs.clearcasting);
 const sp=spellInfo(s,133),mana=s.mana;assert.equal(sp.mana,0);const timing=beginSpellTiming(s,sp,0);assert.equal(timing.cost,0);assert.equal(s.mana,mana);
 s.time=15001;assert.ok(spellInfo(s,133).mana>0);
});
test('a one-shot crit proc remains in the spell snapshot after its aura expires',()=>{
 const c=actor(7);c.talentProcs={elementalMastery:{until:100,token:1}};const sp=spellInfo(c,403),snapshot=beginTalentCast({clock:0},c,sp);
 c.time=1000;delete c.talentProcs.elementalMastery;assert.ok(spellCritBonus(c,{...sp,talentCast:snapshot})>=1);assert.ok(spellCritBonus(c,sp)<1);
});
