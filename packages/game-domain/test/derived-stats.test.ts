import test from 'node:test';
import assert from 'node:assert/strict';
import {memoizeDerived} from '../src/rules/derived-cache.js';
import {newCharacter,stats} from '../src/rules/character.js';
import {ranks,selectedTalentSpells} from '../src/rules/talent-effects.js';
import {talents,items,spells,classDefinitions} from '../src/rules/catalog.js';
import {enchants} from '../src/rules/profession-data.js';

test('derived dependencies detect in-place edits, deletions, expiry and distinct owners',()=>{
 let calls=0;
 const derive=memoizeDerived(['time','effects',['pet','hp']],()=>({number:++calls}));
 const actor:any={time:0,effects:[{until:Infinity,stats:{armor:10}}],pet:{hp:100}};
 const first=derive(actor);
 actor.hp=50;actor.cooldowns={1:100};actor.pet.position=10;
 assert.equal(derive(actor),first,'unrelated mutations should reuse the derivation');
 for(const change of [
  ()=>actor.effects[0].stats.armor++,()=>actor.effects[0].until=null,
  ()=>actor.effects[0].until=Infinity,()=>delete actor.effects[0].stats.armor,
  ()=>actor.effects.push({until:100,stats:{}}),()=>actor.effects.pop(),
  ()=>actor.pet.hp=0,()=>actor.time=100,
 ]){const before=derive(actor);change();assert.notEqual(derive(actor),before);}
 assert.notEqual(derive(structuredClone(actor)),derive(actor));
 const saved=JSON.stringify(actor);derive(actor);assert.equal(JSON.stringify(actor),saved);
});

test('character sheets reflect same-tick nested mutations for every playable class',()=>{
 const weapon=Object.values(items).find((i:any)=>i.class===2&&i.MaxDurability>0) as any;
 const shield=Object.values(items).find((i:any)=>i.InventoryType===14&&i.MaxDurability>0) as any;
 for(const classId of [1,2,3,4,5,7,8,9,11]){
  const definition=classDefinitions.find(c=>c.id===classId);
  assert.ok(definition);
  const c:any=newCharacter('属性缓存',classId,60,definition.races[0]);
  const talent:any=Object.values(talents).find((t:any)=>t.classId===classId);
  const check=()=>assert.deepEqual(stats(c),stats(structuredClone(c)),`class ${classId}: cached sheet must equal a fresh actor`);
  const mutate=(change:()=>void)=>{stats(c);change();check();};
  mutate(()=>c.talents[talent.id]=talent.maxRank);
  mutate(()=>c.talents[talent.id]=1);
  mutate(()=>delete c.talents[talent.id]);
  mutate(()=>c.equipment[16]={id:weapon.entry,durability:weapon.MaxDurability});
  mutate(()=>c.equipment[17]={id:shield.entry,durability:shield.MaxDurability});
  mutate(()=>c.equipment[17].durability=0);
  mutate(()=>c.equipment[17].durability=1);
  const healthEnchant=Object.entries(enchants).find(([,enchant]:any)=>enchant.stats.health>0);
  assert.ok(healthEnchant);
  const health=stats(c).maxHp;
  mutate(()=>c.equipment[17].enchant=healthEnchant[0]);
  assert.equal(stats(c).maxHp,health+(healthEnchant[1] as any).stats.health);
  mutate(()=>delete c.equipment[17].enchant);
  mutate(()=>c.learned.push(3127,107,71));
  mutate(()=>c.form='bear');mutate(()=>c.form='cat');mutate(()=>c.form='moonkin');
  mutate(()=>c.stance='defensive');mutate(()=>c.form=null);
  mutate(()=>c.auras=[{spell:123,type:29,misc:2,amount:20,until:1000}]);
  const stamina=stats(c).sta;
  mutate(()=>c.auras[0].amount=40);assert.equal(stats(c).sta,stamina+20);
  mutate(()=>c.auras[0].type=137);mutate(()=>c.auras[0].misc=-1);
  mutate(()=>c.classBuffs=[{spell:123,name:'Dire Bear Form',stats:{attackPower:10},armorPct:.2,until:1000}]);
  mutate(()=>c.classBuffs[0].stats.attackPower=100);
  mutate(()=>c.buffs={fortitude:{kind:'sta',amount:10,until:1000}});
  mutate(()=>c.buffs.fortitude.amount=30);
  mutate(()=>c.itemBuffs=[{stats:{health:200},until:1000}]);
  mutate(()=>c.itemBuffs[0].stats.health=400);
  mutate(()=>c.talentProcs={test:{until:1000,stats:{healthPct:.1}}});
  mutate(()=>c.talentProcs.test.stats.healthPct=.2);
  mutate(()=>c.talentBuffs=[{spell:talent.ranks[0],until:1000}]);
  mutate(()=>c.racialBuff={kind:'stoneform',until:1000});
  mutate(()=>c.racialEffects={berserking:{until:1000,haste:.3}});
  mutate(()=>c.spiritTapUntil=1000);
  mutate(()=>c.time=1000);mutate(()=>c.time=999);
  mutate(()=>c.raceId=definition.races.at(-1));mutate(()=>c.level=59);
 }
});

test('pet health, owner modifiers, and passive spells invalidate dependent sheets',()=>{
 const owner:any=newCharacter('恶魔',9,60,1);
 const talent:any=Object.values(talents).find((t:any)=>t.name==='Master Demonologist');
 owner.talents[talent.id]=5;owner.pet={hp:100,kind:'felhunter'};
 const before=stats(owner).resistances[2];owner.pet.hp=0;
 assert.equal(stats(owner).resistances[2],before-60);
 const pet:any={petUnit:true,kind:'beast',entry:1,level:60,time:0,learned:[],auras:[],ownerPetModifiers:{health:1}};
 const health=stats(pet).maxHp;pet.ownerPetModifiers.health=1.1;
 assert.equal(stats(pet).maxHp,Math.floor(health*1.1));
 const passive:any=Object.values(spells).find((sp:any)=>(sp.Attributes&64)&&sp.Effect1===6&&sp.EffectApplyAuraName1===34&&sp.EffectBasePoints1>=0);
 assert.ok(passive);
 const beforePassive=stats(pet).maxHp;pet.learned.push(passive.Id);
 assert.ok(stats(pet).maxHp>beforePassive);
 assert.deepEqual(stats(pet),stats(structuredClone(pet)));
 pet.auras.push({type:29,misc:2,amount:20,until:1000});
 assert.deepEqual(stats(pet),stats(structuredClone(pet)));
 pet.time=1000;assert.deepEqual(stats(pet),stats(structuredClone(pet)));
});

test('derived results retain independent return values and do not enter saved state',()=>{
 const c:any=newCharacter('隔离',1,60,1);
 const talent:any=Object.values(talents).find((t:any)=>t.classId===1);
 c.talents[talent.id]=1;
 const saved=JSON.stringify(c),sheet=stats(c),expected=structuredClone(sheet);
 sheet.maxHp=0;sheet.resistances[2]=999;sheet.spellPenetration[2]=999;
 assert.deepEqual(stats(c),expected);
 const selected=selectedTalentSpells(c);selected[0].rank=999;selected.pop();
 assert.equal(selectedTalentSpells(c)[0].rank,1);
 ranks(c)[talent.name]=999;assert.equal(ranks(c)[talent.name],1);
 assert.equal(JSON.stringify(c),saved);
});
