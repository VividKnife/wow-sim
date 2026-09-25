import test from 'node:test';
import assert from 'node:assert/strict';
import {talents,spells} from '../../../packages/game-domain/src/rules/catalog.js';
import * as effects from '../../../packages/game-domain/src/rules/talent-effects.js';
const character=(classId,names,extra={})=>({classId,raceId:1,level:60,time:0,equipment:{},talents:Object.fromEntries(Object.entries(names).map(([name,rank])=>{const t=Object.values(talents).find(t=>t.classId===classId&&t.name===name);assert.ok(t,name);return[t.id,rank];})),...extra});
const spell=name=>Object.values(spells).find(s=>s.SpellName===name&&s.SpellFamilyName>0);
test('Heart of the Wild affects intellect and correct form stat only',()=>{
 const c=character(11,{'Heart of the Wild':5});
 assert.equal(effects.talentModifiers(c).intPct,.2);
 assert.equal(effects.talentModifiers({...c,form:'bear'}).staPct,.2);
 assert.equal(effects.talentModifiers({...c,form:'cat'}).strPct,.2);
 assert.equal(effects.talentModifiers(c).staPct,0);
});
test('same named talents retain their class-specific effect',()=>{
 assert.equal(effects.talentModifiers(character(3,{'Lightning Reflexes':5})).agiPct,.15);
 assert.equal(effects.talentModifiers(character(3,{'Lightning Reflexes':5})).dodge,0);
 assert.equal(effects.talentModifiers(character(4,{'Lightning Reflexes':5})).dodge,.05);
});
test('source family masks modify only selected spells and do not stack ranks',()=>{
 assert.equal(typeof effects.talentSpellValue,'function');
 const c=character(1,{'Improved Sunder Armor':3});
 assert.equal(effects.talentSpellValue(c,spell('Sunder Armor'),14,150),120);
 assert.equal(effects.talentSpellValue(c,spell('Heroic Strike'),14,150),150);
});
test('late healing and critical talents affect actual multipliers',()=>{
 assert.equal(effects.healingMultiplier(character(11,{'Gift of Nature':5}),spell('Healing Touch')),1.1);
 assert.equal(effects.spellCritBonus(character(11,{'Improved Regrowth':5}),spell('Regrowth')),.5);
});
test('rank-specific source values are honored for non-linear talent ranks',()=>{
 const c=character(1,{'Improved Rend':3});
 assert.equal(effects.abilityDamageMultiplier(c,spell('Rend'),{},true),1.35);
});

test('talent events persist deterministic Nightfall and consume it only on Shadow Bolt',async()=>{
 const runtime=await import('../../../packages/game-domain/src/rules/talent-runtime.js').catch(()=>({}));
 assert.equal(typeof runtime.onTalentEvent,'function');
 const c=character(9,{Nightfall:2},{hp:100,mana:0});const s={clock:100,rngState:1};
 runtime.onTalentEvent(s,c,{type:'damage',periodic:true,spell:spell('Corruption'),amount:10},{rng:()=>0});
 assert.ok(c.talentProcs.nightfall.until>s.clock);
 assert.equal(effects.modifySpell({...c,time:s.clock},spell('Shadow Bolt'),{mana:50,castMs:3000}).castMs,0);
 runtime.onTalentEvent(s,c,{type:'cast',spell:spell('Corruption')},{});assert.ok(c.talentProcs.nightfall);
 runtime.onTalentEvent(s,c,{type:'cast',spell:spell('Shadow Bolt')},{});assert.equal(c.talentProcs.nightfall,undefined);
});
test('Swiftmend consumes one owned heal over time and heals its correct duration',async()=>{
 const runtime=await import('../../../packages/game-domain/src/rules/talent-runtime.js').catch(()=>({}));assert.equal(typeof runtime.executeTalentActive,'function');
 const c=character(11,{Swiftmend:1},{id:'druid'}),target={id:'ally',hp:100,hots:[{name:'Rejuvenation',caster:'druid',amount:20,interval:3000,until:20000},{name:'Regrowth',caster:'other',amount:99,interval:3000,until:20000}]};
 let healed=0;assert.equal(runtime.executeTalentActive({clock:0},c,target,spell('Swiftmend'),{healAmount:(s,c,t,amount)=>{healed=amount;}}),true);
 assert.equal(healed,80);assert.equal(target.hots.length,1);assert.equal(target.hots[0].caster,'other');
});
test('incoming talent proc does not recursively trigger itself',async()=>{
 const runtime=await import('../../../packages/game-domain/src/rules/talent-runtime.js').catch(()=>({}));assert.equal(typeof runtime.onTalentEvent,'function');
 const c=character(2,{'Eye for an Eye':2},{hp:100});let damage=0;
 runtime.onTalentEvent({clock:0},c,{type:'incoming',spell:spell('Fireball'),target:{hp:100},amount:100,critical:true,talentProc:true},{damage:()=>damage++});
 assert.equal(damage,0);
});

test('spell-affect masks inherited from first talent rank support zero client masks',()=>{
 const c=character(7,{Convection:5});assert.equal(effects.talentSpellValue(c,spell('Lightning Bolt'),14,100),90);
 assert.equal(effects.talentSpellValue(c,spell('Healing Wave'),14,100),100);
});
test('Elemental Warding reduces elemental incoming damage but not shadow',async()=>{
 const {onTalentEvent}=await import('../../../packages/game-domain/src/rules/talent-runtime.js');const c=character(7,{'Elemental Warding':3});
 assert.equal(onTalentEvent({clock:0},c,{type:'incoming',spell:{School:2},amount:100},{}),90);
 assert.equal(onTalentEvent({clock:0},c,{type:'incoming',spell:{School:5},amount:100},{}),100);
});
test('pet Frenzy, Intimidation and owner Spirit Bond produce combat changes',async()=>{
 const runtime=await import('../../../packages/game-domain/src/rules/talent-runtime.js');assert.equal(typeof runtime.onPetTalentEvent,'function');
 const owner=character(3,{Frenzy:5,Intimidation:1},{id:'owner'}),pet={id:'pet',hp:100,maxHp:100,talentProcs:{intimidation:{until:10000}}},target={hp:100,threat:{}};
 runtime.onPetTalentEvent({clock:0,rngState:1},owner,pet,{type:'damage',critical:true,target,amount:20},{rng:()=>0});
 assert.equal(pet.talentProcs.frenzy.stats.meleeHastePct,.3);assert.equal(target.stunUntil,3000);
});
test('mechanic resistance and offhand damage use source talent ranks',()=>{
 assert.equal(typeof effects.talentControlResistance,'function');assert.equal(typeof effects.talentOffhandMultiplier,'function');
 assert.equal(effects.talentControlResistance(character(1,{'Iron Will':5}),12),.15);
 assert.equal(effects.talentOffhandMultiplier(character(4,{'Dual Wield Specialization':5})),1.5);
});
test('cast snapshot consumes old proc charges and preserves procs created by this cast',async()=>{
 const runtime=await import('../../../packages/game-domain/src/rules/talent-runtime.js');assert.equal(typeof runtime.beginTalentCast,'function');
 const c=character(9,{Nightfall:2},{talentProcs:{nightfall:{until:10000,token:1}},talentProcSequence:1});const s={clock:0};
 const first=runtime.beginTalentCast(s,c,spell('Shadow Bolt'));
 runtime.onTalentEvent(s,c,{type:'damage',spell:spell('Corruption'),periodic:true,amount:1},{rng:()=>0});
 runtime.endTalentCast(s,c,spell('Shadow Bolt'),first,{});assert.equal(c.talentProcs.nightfall.token,2);
 const second=runtime.beginTalentCast(s,c,spell('Shadow Bolt'));runtime.endTalentCast(s,c,spell('Shadow Bolt'),second,{});assert.equal(c.talentProcs.nightfall,undefined);
});
test('Spirit of Redemption delays lethal damage for ten seconds and then expires',async()=>{
 const {onTalentEvent}=await import('../../../packages/game-domain/src/rules/talent-runtime.js');const c=character(5,{'Spirit of Redemption':1},{hp:20});const s={clock:0};
 assert.equal(onTalentEvent(s,c,{type:'incoming',amount:100,spell:{School:0}},{}),0);
 assert.equal(c.hp,1);assert.equal(effects.modifySpell(c,spell('Heal'),{mana:100,castMs:1000}).mana,0);
 s.clock=10000;onTalentEvent(s,c,{type:'tick'},{});assert.equal(c.hp,0);
});

test('all 27 trees support real level-60 51-point builds including their capstones',async()=>{
 const {classTalentTrees,classDefinitions}=await import('../../../packages/game-domain/src/rules/catalog.js');const {createGame,act,view}=await import('../../../packages/game-domain/src/rules/engine.js');
 for(const tree of classTalentTrees){
  const definition=classDefinitions.find(c=>c.id===tree.classId);let s=createGame('天赋60',178,0,{classId:tree.classId,raceId:definition.races[0]});s.level=60;
  const capstones=tree.talents.filter(t=>t.row===6);assert.ok(capstones.length);
  const prereqIds=new Set(capstones.flatMap(t=>t.prerequisites.map(p=>p.talentId)));
  for(let point=0;point<51;point++){
   const nodes=view(s).talents.filter(t=>t.canLearn),preferred=nodes.filter(t=>t.tree===tree.id);
   const node=preferred.find(t=>t.row===6)||preferred.find(t=>prereqIds.has(t.id))||preferred.sort((a,b)=>a.row-b.row)[0]||nodes[0];
   assert.ok(node,`${tree.classId}/${tree.name} point ${point+1}`);s=act(s,{type:'talent',id:node.id},0);
  }
  assert.equal(Object.values(s.talents).reduce((n,v)=>n+v,0),51);
  assert.ok(capstones.some(t=>s.talents[t.id]>0),`${tree.classId}/${tree.name} must learn capstone`);
 }
});
test('wand and ranged weapon talents do not amplify unrelated spells or melee crit',async()=>{
 const {items}=await import('../../../packages/game-domain/src/rules/catalog.js');const wand=Object.values(items).find(i=>i.class===2&&i.subclass===19),bow=Object.values(items).find(i=>i.class===2&&i.subclass===2);assert.ok(wand&&bow);
 const mage=character(8,{'Wand Specialization':5},{equipment:{18:{id:wand.entry}}});assert.equal(effects.abilityDamageMultiplier(mage,spell('Fireball'),{}),1);
 const hunter=character(3,{'Lethal Shots':5},{equipment:{18:{id:bow.entry}}});assert.equal(effects.talentModifiers(hunter).crit,0);assert.equal(effects.talentModifiers(hunter).rangedCrit,.05);
});
test('coverage ledger explicitly reconciles every talent node to an executor',async()=>{
 const {talentExecutionCoverage}=await import('../../../packages/game-domain/src/rules/class-support.js');const missing=Object.values(talents).filter(t=>!talentExecutionCoverage(t).supported).map(t=>`${t.classId}:${t.name}`);assert.deepEqual(missing,[]);
});
test('remaining defensive talents modify real detection and resistance hooks',async()=>{
 const {detectsTarget}=await import('../../../packages/game-domain/src/rules/combat-space.js');const observer=character(1,{}, {position:0}),rogue=character(4,{}, {position:4,stealthed:true});assert.equal(detectsTarget(observer,rogue,0),true);rogue.talents=character(4,{'Master of Deception':5}).talents;assert.equal(detectsTarget(observer,rogue,0),false);
 const defenses=effects.talentCombatDefense(character(4,{'Sleight of Hand':2,'Heightened Senses':2}));assert.equal(defenses.meleeCritReduction,.02);assert.equal(defenses.spellAvoidance,.04);assert.equal(defenses.stealthDetection,6);
});
test('Magic Absorption returns source mana with a one-second cooldown',async()=>{
 const {onTalentEvent}=await import('../../../packages/game-domain/src/rules/talent-runtime.js');const c=character(8,{'Magic Absorption':5},{mana:0}),s={clock:0},api={stats:()=>({maxMana:1000})};onTalentEvent(s,c,{type:'resist'},api);assert.equal(c.mana,50);s.clock=500;onTalentEvent(s,c,{type:'resist'},api);assert.equal(c.mana,50);s.clock=1000;onTalentEvent(s,c,{type:'resist'},api);assert.equal(c.mana,100);
});
test('Master Demonologist shares physical mitigation with its living voidwalker',async()=>{
 const {onTalentEvent}=await import('../../../packages/game-domain/src/rules/talent-runtime.js');const c=character(9,{'Master Demonologist':5},{hp:1000,pet:{hp:100,kind:'voidwalker'}}),pet={classId:0,petUnit:true,kind:'voidwalker',ownerMasterDemonologist:5,hp:100},s={clock:0};assert.equal(onTalentEvent(s,c,{type:'incoming',spell:{School:0},amount:100},{}),90);assert.equal(onTalentEvent(s,pet,{type:'incoming',spell:{School:0},amount:100},{}),90);assert.equal(onTalentEvent(s,c,{type:'incoming',spell:{School:2},amount:100},{}),100);
});
test('Shield Block and Enslave Demon consume their source talent operations in execution',async()=>{
 const {createGame}=await import('../../../packages/game-domain/src/rules/engine.js'),{classEffect}=await import('../../../packages/game-domain/src/rules/class-mechanics.js'),{spellInfo}=await import('../../../packages/game-domain/src/rules/character.js');
 const warrior=createGame('盾牌',17,0,{classId:1,raceId:1});warrior.level=60;warrior.talents=character(1,{'Improved Shield Block':3}).talents;classEffect(warrior,warrior,warrior,spellInfo(warrior,2565),[warrior],{});assert.equal(warrior.auras.find(a=>a.type===51).charges,2);
 const warlock=createGame('奴役',17,0,{classId:9,raceId:1});warlock.level=60;const target={id:'demon',hp:100,threat:{}};classEffect(warlock,warlock,target,spellInfo(warlock,1098),[warlock],{});const plain=[target.controlAttackMultiplier,target.controlCastMultiplier];warlock.talents=character(9,{'Improved Enslave Demon':5}).talents;classEffect(warlock,warlock,target,spellInfo(warlock,1098),[warlock],{});assert.ok(target.controlAttackMultiplier<plain[0]);assert.ok(target.controlCastMultiplier<plain[1]);
});
