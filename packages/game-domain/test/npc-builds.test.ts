import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {createNpcMember,roles} from '../src/rules/party.js';
import {npcRoles,npcLevelBands,npcSkillNames,npcBuildPlan,allocateNpcTalents} from '../src/rules/npc-builds.js';
import {npcStrategy} from '../src/rules/npc-strategies.js';
import {classAbilities,spells,talents,items} from '../src/rules/catalog.js';
import {validateRules,strategySpellIds} from '../src/rules/combat-strategy.js';
import {stats} from '../src/rules/character.js';
import {startCombat,combatTick} from '../src/rules/combat.js';
import {ensureNpcWorld,progressNpcWorld,recordNpcRaid,npcRunStarted} from '../src/rules/npc-world.js';
import {npcEquipmentValue} from '../src/rules/npc-equipment.js';
import {prepareClassAbility} from '../src/rules/class-spell-effects.js';
import {selectStrategyPotion,executeStrategyPotion} from '../src/rules/consumables.js';
import type {Rules} from '../src/model.ts';

function member(key:string,level=60,skill='regular',temperament='steady',spending='value'){
 const [classId,role]=key.split(':'),s:Rules=createGame('方案验证',7301,0);s.level=level;
 const c:Rules=createNpcMember(s,roles.find(r=>r.classId===Number(classId))!.id,{role,behavior:{skill,temperament,spending}});
 return {s,c};
}
const names=(c:Rules)=>c.rules.map((r:Rules)=>spells[r.spell].SpellName);
test('324 decade/role/skill templates use legal talent budgets, prerequisites and learned highest ranks',()=>{
 const ids=new Set();
 for(const key of npcRoles)for(const level of npcLevelBands)for(const skill of Object.keys(npcSkillNames)){
  const {c}=member(key,level,skill);ids.add(c.npcBuild.id);validateRules(c,c.rules);
  assert.equal(c.npcBuild.levelBand,level);assert.ok(c.rules.length,key);
  assert.equal(Object.values(c.talents).reduce((sum:number,n:any)=>sum+n,0),level-9);
  for(const [id,rank] of Object.entries(c.talents)){
   const t=talents[id];assert.ok(Number(rank)<=t.maxRank);
   for(const prerequisite of t.prerequisites)assert.ok(c.talents[prerequisite.talentId]>=prerequisite.requiredRank);
   const lower=Object.entries(c.talents).filter(([other])=>talents[other].tree===t.tree&&talents[other].row<t.row).reduce((sum,[,n])=>sum+Number(n),0);
   assert.ok(lower>=t.requiredTreePoints,`${c.npcBuild.id}: ${t.name}`);
  }
  const allowed=strategySpellIds(c);assert.ok(c.rules.every((r:Rules)=>allowed.includes(r.spell)));
  for(const a of (classAbilities as Rules)[c.classId].filter((a:Rules)=>c.learned.includes(a.spellId)))assert.ok(a.requiredLevel<=level,`${c.npcBuild.id} learned ${a.name} early`);
  for(const [a,b] of [['Berserker Stance','Battle Stance'],['Mana Spring Totem','Healing Stream Totem'],['Windfury Weapon','Rockbiter Weapon'],['Demon Armor','Demon Skin']])assert.ok(!names(c).includes(a)||!names(c).includes(b));
 }
 assert.equal(ids.size,324);
});
test('all intermediate levels spend legal points; talent ranks cannot be trained without their root',()=>{
 for(const key of npcRoles)for(const skill of Object.keys(npcSkillNames))for(let level=1;level<=60;level++){
  const [classId,role]=key.split(':'),c:Rules={classId:Number(classId),level,talents:{},learned:[]};
  allocateNpcTalents(c,npcBuildPlan(c,role,{skill}));assert.equal(Object.values(c.talents).reduce((sum:number,n:any)=>sum+n,0),Math.max(0,level-9));
 }
 const healer=member('5:healer').c;assert.ok(!healer.learned.some((id:number)=>spells[id]?.SpellName==='Mind Flay'));
 const lock=member('9:ranged',60,'expert').c;assert.ok(!lock.learned.some((id:number)=>spells[id]?.SpellName==='Dark Pact'));
 assert.ok(Object.keys(lock.talents).some(id=>talents[id].name==='Ruin'));
 const priest=member('5:ranged').c;assert.ok(names(priest).includes('Mind Flay'));assert.equal(spells[priest.rules.find((r:Rules)=>spells[r.spell].SpellName==='Mind Flay').spell].SpellLevel,60);
});
test('personality changes decisions and spending, while beginners retain functional core rotations',()=>{
 for(const skill of Object.keys(npcSkillNames)){
  assert.ok(names(member('1:melee',60,skill).c).includes('Bloodthirst'));
  assert.ok(names(member('11:melee',60,skill).c).includes('Ferocious Bite'));
  assert.ok(names(member('5:ranged',60,skill).c).includes('Shadowform'));
 }
 const steady=member('4:melee',60,'regular','steady').c,collector=member('4:melee',60,'regular','collector').c;
 assert.ok(steady.strategyPolicy.pullDelaySeconds>collector.strategyPolicy.pullDelaySeconds);
 assert.ok(steady.rules.find((r:Rules)=>spells[r.spell].SpellName==='Evasion').value>collector.rules.find((r:Rules)=>spells[r.spell].SpellName==='Evasion').value);
 const keen=member('5:healer',60,'regular','keen').c,plain=member('5:healer').c;
 assert.ok(keen.rules.find((r:Rules)=>spells[r.spell].SpellName==='Flash Heal').value>plain.rules.find((r:Rules)=>spells[r.spell].SpellName==='Flash Heal').value);
 assert.equal(member('8:ranged',60,'expert','steady','saver').c.potions.enabled,false);
 assert.ok(names(member('4:melee',60,'expert').c).includes('Adrenaline Rush'));
 assert.ok(!names(member('4:melee',60,'novice').c).includes('Adrenaline Rush'));
});
function combat(key:string,skill='expert'){
 const {s,c}=member(key,60,skill);s.rules=[];s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;c.strategyPolicy.waitForTank=false;
 c.ammunition={2512:1000,2516:1000};
 startCombat(s,[636],true);const e=s.combat.enemies[0];
 Object.assign(e,{level:63,hp:1e8,maxHp:1e8,nextAttack:1e9,nextSpell:1e9,rootUntil:1e9,target:s.id,threat:{[s.id]:1e9}});
 s.position=27;s.positionY=0;s.nextSwing=1e9;c.position=key.endsWith('melee')?33:5;c.positionY=0;
 if(c.classId===1){c.stance='berserker';c.rage=700;}
 return {s,c,e};
}
test('real combat casts high-level cores and does not loop maintained debuffs or caster forms',()=>{
 for(const [key,core] of [['1:melee','Bloodthirst'],['3:ranged','Aimed Shot'],['4:melee','Eviscerate'],['5:ranged','Mind Flay'],['7:melee','Stormstrike'],['7:ranged','Lightning Bolt'],['8:ranged','Frostbolt'],['9:ranged','Shadow Bolt'],['11:melee','Shred'],['11:ranged','Starfire']]){
  const {s,c,e}=combat(key),casts:Record<string,number>={};
  for(let tick=1;tick<=300;tick++){
   s.clock=tick*100;
   const maintained=(e.auras||[]).filter((a:Rules)=>a.until>s.clock+3000).map((a:Rules)=>spells[a.spell]?.SpellName);
   combatTick(s);
   for(const event of s.logs.filter((l:Rules)=>l.kind==='cast'&&l.at===s.clock&&l.actorId===c.id)){const name=spells[event.spellId]?.SpellName;casts[name]=(casts[name]||0)+1;if(["Hunter's Mark",'Faerie Fire (Feral)'].includes(name))assert.ok(!maintained.includes(name),`${key} refreshes active ${name}`);}
  }
  assert.ok(casts[core]>0,`${key}: ${core} missing: ${JSON.stringify(casts)}`);
  assert.ok(s.combat.metrics.actors[c.id].damage>0,key);
  for(const name of ['Shadowform','Moonkin Form'])assert.ok((casts[name]||0)<=2,`${key} repeats ${name}: ${JSON.stringify(casts)}`);
 }
});
test('support AI never dispels its own damage effects or wastes Dark Pact on an empty pet',()=>{
 const {s,c,e}=combat('5:ranged');
 const dispel=c.learned.map((id:number)=>spells[id]).find((sp:Rules)=>sp?.SpellName==='Dispel Magic');
 e.dots=[{caster:c.id,spell:589,remaining:5}];
 assert.equal(prepareClassAbility(s,c,e,dispel,[s,c]),null);
 e.auras=[{spell:17,dispel:1,positive:true,until:10000}];assert.equal(prepareClassAbility(s,c,e,dispel,[s,c])?.target,e);
 const pact=combat('9:ranged','regular');pact.c.pet={id:'empty-pet',ownerId:pact.c.id,petUnit:true,hp:100,maxHp:100,mana:0,maxMana:100,position:5,positionY:0,nextSwing:1e9};
 pact.c.mana=stats(pact.c).maxMana*.2;
 for(let tick=1;tick<=30;tick++){pact.s.clock=tick*100;combatTick(pact.s);}
 assert.ok(!pact.s.logs.some((event:Rules)=>event.actorId===pact.c.id&&spells[event.spellId]?.SpellName==='Dark Pact'));
});
test('an experienced cat circles behind a tanked target to use Shred',()=>{
 const {s,c}=combat('11:melee');c.position=27;c.positionY=2;
 const casts:string[]=[];
 for(let tick=1;tick<=350;tick++){
  s.clock=tick*100;combatTick(s);
  casts.push(...s.logs.filter((l:Rules)=>l.kind==='cast'&&l.at===s.clock&&l.actorId===c.id).map((l:Rules)=>spells[l.spellId]?.SpellName));
 }
 assert.ok(casts.includes('Shred'),JSON.stringify(casts));
});
test('healing priority retains planned emergency cooldowns before the heal',()=>{
 const {s,c}=combat('7:healer');s.hp=stats(s).maxHp*.1;
 const casts:string[]=[];
 for(let tick=1;tick<=50;tick++){
  s.clock=tick*100;combatTick(s);
  casts.push(...s.logs.filter((l:Rules)=>l.kind==='cast'&&l.at===s.clock&&l.actorId===c.id).map((l:Rules)=>spells[l.spellId]?.SpellName));
 }
 assert.equal(casts[0],"Nature's Swiftness");assert.ok(s.combat.metrics.actors[c.id].healing>0);
});
test('growth and experience promotion update builds while preserving gear, personality and wallets',()=>{
 const s:Rules=createGame('成长测试',7301,0);s.level=29;ensureNpcWorld(s);
 const resident=s.npcWorld.residents.find((p:Rules)=>p.unit.classId===3),gear=structuredClone(resident.unit.equipment),wallet=resident.wallet;
 s.level=30;s.wallAt=40*60*1000;progressNpcWorld(s);
 assert.equal(resident.unit.npcBuild.levelBand,30);assert.deepEqual(resident.unit.equipment,gear);assert.ok(resident.wallet>=wallet);
 // Promotion retrains the active actor and persistent resident; dungeon entry
 // must not put that resident back on the original novice profile.
 const p=s.npcWorld.residents.find((p:Rules)=>p.raidProfile.skill==='novice');p.raidRuns=2;
 const c=structuredClone(p.unit);c.goldNpc=true;c.goldProfile={skill:'novice'};c.money=p.wallet;
 s.party=[c];s.goldRaid={contributions:{[c.id]:{kills:1}},cleared:['lucifron'],settlement:{rows:[]}};
 const earned=structuredClone(c.equipment);recordNpcRaid(s,true);
 assert.equal(p.raidProfile.skill,'expert');assert.equal(c.npcBuild.skill,'expert');assert.equal(p.unit.npcBuild.skill,'expert');assert.deepEqual(c.equipment,earned);
 s.dungeon={id:'deadmines'};npcRunStarted(s);assert.equal(c.npcBuild.skill,'expert');assert.deepEqual(c.equipment,earned);
 const copy=JSON.parse(JSON.stringify(p.unit));assert.deepEqual(npcStrategy(copy,npcBuildPlan(copy,copy.npcBuild.role,copy.npcBuild)).rules,copy.rules);
});
test('equipment valuation rewards caster output stats and ignores weapon DPS in feral form',()=>{
 const mage=member('8:ranged').c,feral=member('11:melee').c;
 // Temporary synthetic catalogue entries isolate stat choices from item names.
 const ids=[999810,999811,999812];
 try{
  items[ids[0]]={entry:ids[0],class:4,InventoryType:1,stat_type1:5,stat_value1:10};
  items[ids[1]]={...items[ids[0]],entry:ids[1],stat_value1:30};
  assert.ok(npcEquipmentValue(mage,{1:{id:ids[1]}})>npcEquipmentValue(mage,{1:{id:ids[0]}}));
  for(const auraType of [13,55,57]){
   const aura=Object.values(spells).find((sp:Rules)=>sp.EffectApplyAuraName1===auraType&&sp.EffectBasePoints1>0&&(auraType!==13||sp.EffectMiscValue1===126))!;
   const id=999820+auraType;ids.push(id);items[id]={entry:id,class:4,InventoryType:1,spelltrigger_1:1,spellid_1:aura.Id};
   assert.ok(npcEquipmentValue(mage,{1:{id}})>npcEquipmentValue(mage,{}),`aura ${auraType} must improve gear score`);
  }
  items[ids[2]]={entry:ids[2],class:2,InventoryType:17,dmg_min1:1000,dmg_max1:1000,delay:1000};
  assert.equal(npcEquipmentValue(feral,{16:{id:ids[2]}}),npcEquipmentValue(feral,{}));
 }finally{for(const id of ids)delete items[id];}
});
test('NPC potion preferences survive world generation and never consume the player bag',()=>{
 const s:Rules=createGame('补给测试',7301,0);s.level=60;ensureNpcWorld(s);
 const c=s.npcWorld.residents.find((p:Rules)=>p.raidProfile.personality==='impulsive').unit;
 assert.equal(c.potions.enabled,true);assert.equal(c.potions.health,45);
 s.bag=[{id:118,count:5}];c.hp=1;executeStrategyPotion(s,c,selectStrategyPotion(s,c)?.itemId);assert.equal(s.bag[0].count,5);assert.equal(c.hp,1);
 c.bag=[{id:118,count:1}];executeStrategyPotion(s,c,selectStrategyPotion(s,c)?.itemId);assert.equal(s.bag[0].count,5);assert.equal(c.bag.length,0);assert.ok(c.hp>1);
});
