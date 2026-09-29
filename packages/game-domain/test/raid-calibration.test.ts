import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {spellInfo} from '../src/rules/character.js';
import {items,spells,table} from '../src/rules/catalog.js';
import {raidCreatureStats} from '../src/rules/raid-scaling.js';
import {raidEnemy,moltenCoreBosses} from '../src/rules/molten-core-content.js';
import {onyxiaBoss} from '../src/rules/onyxia-content.js';
import {spellCoefficient,spellPowerBonus} from '../src/rules/spell-scaling.js';
import {binarySpell,resistanceCoefficient,partialResistFraction,partialResistThresholds} from '../../sim-core/src/spell-resistance.js';
import {weaponMissChance,meleeCritSuppression} from '../../sim-core/src/attack-table.js';
import {schoolImmune,addCombatAura,addMovementSlow} from '../../sim-core/src/combat-auras.js';
import {npcEquipmentValue} from '../src/rules/npc-equipment.js';
import {recordDamage,startCombat,hurtPlayer} from '../src/rules/combat.js';
import {spellResistance} from '../src/rules/spell-mitigation.js';
import {classEffect} from '../src/rules/class-mechanics.js';
import {activateRacial} from '../src/rules/racial-effects.js';
import {classMeleeProc,applyClassWeaponEnchant,classJudgement} from '../src/rules/class-spell-effects.js';
import {resolveSpellDamage} from '../src/rules/spell-resolution.js';

const actor=(classId=8)=>{const s:any=createGame('校准',147,0,{classId,raceId:classId===7?2:classId===11?4:1});s.level=60;s.equipment={};s.rules=[];s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;return s;};
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('every supported boss and summoned add uses source defenses and unscaled 40-player health',()=>{
 for(const boss of [...moltenCoreBosses,onyxiaBoss]){
  const e:any=raidEnemy({clock:123},'boss',boss.name,boss.entry);
  assert.equal(e.hp,e.sourceHp);assert.equal(e.hp,boss.hp);
  assert.equal(e.level,63);assert.notEqual(e.armor,3200);assert.equal(e.nextAttack,123);
  assert.equal(e.scaling.meleeDamage,1);close(e.low,e.sourceLow);close(e.high,e.sourceHigh);
 }
 const onyxia=raidCreatureStats(10184),lucifron=raidCreatureStats(12118);
 assert.equal(onyxia.sourceHp,1099230);assert.equal(onyxia.hp,1099230);assert.equal(onyxia.armor,4691);
 assert.equal(lucifron.hp,351780);assert.equal(lucifron.armor,3795);assert.equal(lucifron.resistances[5],186);
 close(lucifron.sourceLow,(33.1092+252/14)*2*16);
 close(lucifron.sourceHigh,(33.1092*1.5+252/14)*2*16);
 assert.equal(raidCreatureStats(12119).level,62);assert.notEqual(raidCreatureStats(11262).rank,3);
 assert.throws(()=>raidCreatureStats(999999),/缺少/);
});

test('boss school and control immunities survive factories and aura application',()=>{
 const e:any=raidEnemy({clock:0},'boss','炎魔',11502);
 assert.equal(schoolImmune(e,2,0),true);assert.equal(schoolImmune(e,4,0),false);
 addMovementSlow(e,{amount:.5,until:10000},0);assert.equal(e.movementSlows,undefined);
 addCombatAura(e,{type:26,mechanic:7,until:10000,positive:false},0);assert.equal(e.auras.length,0);
 assert.equal(raidCreatureStats(12056).damageSchool,2);
});

test('rank-specific coefficients cover nukes, channels, mixed spells and low ranks without double penalties',()=>{
 for(const [id,direct,dot] of [[11668,.2,.13],[11672,0,.167],[10947,.429,0],[18807,0,.15],[15208,.857,0],[10448,.214,.1],[9835,.15,.13],[116, .163,0],[143,.271,0]]){
  const sp=spells[id];assert.ok(sp,`${id}`);close(spellCoefficient(sp),direct);close(spellCoefficient(sp,{periodic:true}),dot);
 }
 close(spellPowerBonus({spellPower:100},spells[116]),16.3);
 close(spellPowerBonus({spellPower:100},spells[11668],{periodic:true}),13);
 close(spellCoefficient({...spells[11668],castMs:0}),.2);
 assert.equal(table('spell_bonus_data').length,141);
 close(spellCoefficient(spells[20424]),.29);
 close(spellCoefficient(spells[22048]),spellCoefficient(spells[3606]));
});

test('resistance bins, penetration, level floor, pure DOTs and binary spells follow Classic rules',()=>{
 const base={level:60,targetLevel:63,school:2};
 close(resistanceCoefficient(base),.08);
 close(resistanceCoefficient({...base,resistance:100,penetration:1000}),.08);
 close(resistanceCoefficient({...base,resistance:300,binary:true}),1);
 close(resistanceCoefficient({...base,resistance:300,pureDot:true}),.18);
 close(resistanceCoefficient({...base,school:1,resistance:300}),.08);
 close(resistanceCoefficient({...base,playerTarget:true}),0);
 assert.equal(binarySpell(spells[116]),true);assert.equal(binarySpell(spells[133]),false);
 assert.equal(binarySpell(spells[8056]),true);assert.equal(binarySpell(spells[172]),false);assert.equal(binarySpell(spells[348]),true);
 partialResistThresholds(1).forEach((n,i)=>close(n,[1,.96,.8][i]));
 const bins=new Set(Array.from({length:10000},(_,n)=>partialResistFraction(.5,n/10000)));
 assert.deepEqual([...bins].sort(),[0,.25,.5,.75]);
});

test('PvE direct and periodic damage share resistance, threat and reproducible random state',()=>{
 const s=actor(),e:any=raidEnemy(s,'boss','首领',12057);e.hp=e.maxHp=1e8;
 startCombat(s,[],true,[e] as any);const copy=JSON.parse(JSON.stringify(s));
 for(const state of [s,copy])for(let i=0;i<80;i++)recordDamage(state,state,state.combat.enemies[0],400,'火球术',1,{spellId:10149,school:2,periodic:i%2===0});
 assert.deepEqual(s,copy);
 const events=s.logs.filter((l:any)=>l.kind==='damage');assert.ok(events.some((l:any)=>l.resisted>0));
 assert.ok(events.every((l:any)=>[400,300,200,100].includes(l.amount)));
 assert.equal(e.threat[s.id],1e8-e.hp);
 const before=e.hp;recordDamage(s,s,e,400,'寒冰箭',1,{spellId:10181,school:4});assert.equal(before-e.hp,400);
});

test('target resistance debuffs and caster penetration affect the correct school',()=>{
 const s=actor(),e:any=raidEnemy(s,'boss','鲁西弗隆',12118);
 const initial=spellResistance(s,s,e,spells[686],{binary:false});
 e.auras=[{type:22,misc:32,amount:-186,until:10000}];
 close(spellResistance(s,s,e,spells[686],{binary:false}),.08);assert.ok(initial>.08);
 e.auras=[];s.auras=[{type:123,misc:32,amount:-186,until:10000}];
 close(spellResistance(s,s,e,spells[686],{binary:false}),.08);
 assert.ok(spellResistance(s,s,e,spells[133],{binary:false})>.08);
});

test('incoming magic mitigates before absorption and fire immune bosses take zero fire damage',()=>{
 const s=actor(),e:any=raidEnemy(s,'boss','炎魔',11502);startCombat(s,[],true,[e] as any);
 const before=e.hp;recordDamage(s,s,e,400,'火球术',1,{spellId:133,school:2});assert.equal(e.hp,before);
 s.auras=[{type:22,misc:4,amount:300,until:10000}];s.absorb={amount:10000,until:10000};
 const hp=s.hp;hurtPlayer(s,e,s,400,'火焰攻击',{school:2});assert.equal(s.hp,hp);assert.ok(s.absorb.amount>=9700);
});

test('holy weapon-class damage scales with spell power but uses melee critical damage',()=>{
 const s=actor(2),e:any=raidEnemy(s,'boss','首领',12057);s.auras=[{type:52,misc:1,amount:1000,until:10000}];
 let amount=0;const result=resolveSpellDamage(s,s,e,100,spells[20424],(_s:any,_c:any,_e:any,n:number)=>{amount=n;});
 assert.equal(result.critical,true);assert.equal(amount,200);
});

test('weapon hit has the first-percent penalty and skill-dependent caps; crit suppression is independent of bonus skill',()=>{
 close(weaponMissChance(300,315),.08);close(weaponMissChance(300,315,{hit:.01}),.08);
 close(weaponMissChance(300,315,{hit:.08}),.01);close(weaponMissChance(300,315,{hit:.09}),0);
 close(weaponMissChance(305,315,{hit:.06}),0);close(weaponMissChance(300,315,{dualWield:true,hit:.28}),0);
 close(meleeCritSuppression(60,63,.1),.048);close(meleeCritSuppression(60,63,0),.03);
});

test('NPC melee hybrids value strength and spell damage while caster spell schools guide upgrades',()=>{
 const ids=[9999901,9999902,9999903,9999904];
 const gear=(id:number,extra:any)=>{items[id]={entry:id,class:4,InventoryType:1,ItemLevel:0,...extra};};
 gear(ids[0],{stat_type1:4,stat_value1:20});gear(ids[1],{stat_type1:7,stat_value1:20});
 // Passive item spell effects are evaluated through the same stats path as combat.
 const saved={...spells[9999905]};spells[9999905]={Id:9999905,Effect1:6,EffectApplyAuraName1:13,EffectMiscValue1:4,EffectBasePoints1:39};
 gear(ids[2],{spellid_1:9999905,spelltrigger_1:1});
 try{
  for(const classId of [1,2,7]){const c=actor(classId);c.strategyPolicy={role:'melee'};assert.ok(npcEquipmentValue(c,{1:{id:ids[0]}})>npcEquipmentValue(c,{1:{id:ids[1]}}));}
  const mage=actor();mage.rules=[{spell:133,enabled:true}];assert.ok(npcEquipmentValue(mage,{1:{id:ids[2]}})>npcEquipmentValue(mage,{}));
  mage.rules=[{spell:116,enabled:true}];close(npcEquipmentValue(mage,{1:{id:ids[2]}}),npcEquipmentValue(mage,{}));
  const shaman=actor(7);shaman.strategyPolicy={role:'melee'};shaman.rules=[{spell:8050,enabled:true}];assert.ok(npcEquipmentValue(shaman,{1:{id:ids[2]}})>npcEquipmentValue(shaman,{}));
 }finally{for(const id of ids)delete items[id];if(Object.keys(saved).length)spells[9999905]=saved;else delete spells[9999905];}
});


test('Windfury uses physical extra swings and Flametongue adds spell power exactly once',()=>{
 const make=(id:number,power:number)=>{const s=actor(7);s.equipment={16:{id:11932,uid:'weapon'}};s.auras=[{type:13,misc:126,amount:power,until:100000}];
  const e:any=raidEnemy(s,'target','首领',12118);e.hp=e.maxHp=1e8;e.position=2;e.positionY=0;e.combatFacing=0;
  startCombat(s,[],true,[e] as any);applyClassWeaponEnchant(s,s,spellInfo(s,id));return {s,e};};
 const hits=(id:number,power:number)=>{const {s,e}=make(id,power),result:any[]=[];
  const api={lands:()=>true,damage:(_s:any,_c:any,_e:any,v:number,_l:any,_m:any,d:any)=>result.push({v,...d})};
  for(let i=0;i<100;i++){s.clock=i*2000;classMeleeProc(s,s,e,api);}return result;};
 const wind=hits(16362,0);assert.ok(wind.length>0);assert.deepEqual(wind,hits(16362,500));
 assert.ok(wind.every(h=>h.school===0&&h.weaponAttack));assert.ok(wind.some(h=>h.glancing));
 const plain=hits(16342,0),powered=hits(16342,500);assert.equal(plain.length,100);
 for(let i=0;i<plain.length;i++)close(powered[i].v-plain[i].v,50*(plain[i].critical?1.5:1));
 assert.ok(powered.every(h=>h.school===2));
});


test('direct stun paths preserve boss immunity while ordinary creatures can be stunned',()=>{
 const s=actor(2),boss:any=raidEnemy(s,'boss','首领',12118),normal:any={...boss,id:'normal',mechanicImmuneMask:0};
 const api={lands:()=>true,damage:()=>{},heal:()=>{}};
 for(const e of [boss,normal])classEffect(s,s,e,spellInfo(s,853),[s],api);
 assert.ok(!(boss.stunUntil>s.clock));assert.ok(normal.stunUntil>s.clock);
 normal.stunUntil=0;s.raceId=6;
 activateRacial(s,s,spells[20549],{enemies:[boss,normal]});
 assert.ok(!(boss.stunUntil>s.clock));assert.ok(normal.stunUntil>s.clock);
});


test('NPC scoring rewards hit and crit, but stops rewarding spell hit above the boss cap',()=>{
 const mage=actor(),value=()=>npcEquipmentValue(mage,{}),base=value();
 mage.auras=[{type:55,amount:1,until:10000}];assert.ok(value()>base);
 mage.auras[0].amount=16;const capped=value();mage.auras[0].amount=17;close(value(),capped);
 mage.auras=[{type:57,amount:1,until:10000}];assert.ok(value()>base);
 const warrior=actor(1);warrior.strategyPolicy={role:'melee'};const before=npcEquipmentValue(warrior,{});
 warrior.auras=[{type:54,amount:3,until:10000}];assert.ok(npcEquipmentValue(warrior,{})>before);
});


test('Judgement of Command uses half base damage on an unstunned boss, with spell scaling applied once',()=>{
 const value=(stunned:boolean,power:number)=>{const s=actor(2),e:any=raidEnemy(s,'boss','首领',12118);s.seal={spell:20920,until:10000};
  s.auras=[{type:52,amount:-100,until:10000},{type:13,misc:126,amount:power,until:10000}];e.stunUntil=stunned?10000:0;
  let dealt=0;classJudgement(s,s,e,spellInfo(s,20271),[s],{lands:()=>true,damage:(_s:any,_c:any,_e:any,v:number)=>dealt=v});return dealt;};
 close(value(true,0),2*value(false,0));close(value(false,100)-value(false,0),100*3/7);
});
