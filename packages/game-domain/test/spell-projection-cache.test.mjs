import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view,combatView} from '../src/rules/engine.js';
import {spellInfo,withSpellInfoProjection} from '../src/rules/character.js';
import {buildGameResponse} from '../src/rules/server-response.js';
import {localScenarios} from './support/local-scenarios.ts';
import {talents,spells,classAbilities,classDefinitions} from '../src/rules/catalog.js';
import {passiveTalentSpells,talentAffectsSpell,talentSpellValue} from '../src/rules/talent-effects.js';
import {spellAttributesEx3} from '../../sim-core/src/spell-program.js';

// Previous scalar DBC evaluation is a differential oracle, not a runtime mode.
function reference(c,sp,operation,value){
 if(sp?.AttributesEx3&spellAttributesEx3.IGNORE_CASTER_MODIFIERS)return value;
 let flat=0,percent=0;
 for(const aura of passiveTalentSpells(c))for(let i=1;i<=3;i++){
  const type=aura['EffectApplyAuraName'+i];
  if(![107,108].includes(type)||aura['EffectMiscValue'+i]!==operation||!talentAffectsSpell(aura,i,sp))continue;
  const amount=aura['EffectBasePoints'+i]+1;if(type===107)flat+=amount;else percent+=amount;
 }
 let result=(value+flat)*(1+percent/100);
 if(c.talentProcs?.amplifyCurse?.until>(c.time||0)){
  if(operation===8&&['Curse of Agony','Curse of Weakness'].includes(sp?.SpellName))result*=1.5;
  if(operation===12&&sp?.SpellName==='Curse of Exhaustion')result-=20;
 }
 return result;
}
test('compiled modifier programs match scalar evaluation across classes, ranks, forms and expiry',()=>{
 for(const classId of [1,2,3,4,5,7,8,9,11]){
  const c=createGame('修正',73,0,{classId,raceId:classDefinitions.find(c=>c.id===classId).races[0]});c.level=60;
  const selected=Object.values(talents).filter(t=>t.classId===classId);
  const ids=[...new Set((classAbilities[classId]||[]).map(a=>a.spellId))].filter(id=>spells[id]).filter((_,i)=>i%3===0);
  for(const stage of [0,1,2]){
   c.talents=Object.fromEntries(selected.map(t=>[t.id,stage===0?1:stage===1?t.maxRank:0]));
   c.time=stage*1000;c.form=stage===1?'cat':null;c.stance=stage===1?'berserker':'battle';
   c.talentProcs={amplifyCurse:{until:1500}};
   c.talentBuffs=selected.slice(0,3).map(t=>({spell:t.ranks.at(-1),until:1500}));
   for(const id of ids)for(const operation of [0,1,5,6,7,8,10,11,12,14,22]){
    assert.equal(talentSpellValue(c,spells[id],operation,123.5),reference(c,spells[id],operation,123.5),`${classId}/${id}/${operation}/${stage}`);
   }
  }
 }
});
test('projection spell cache is synchronous, actor-scoped and discarded after reads and exceptions',()=>{
 const actor=createGame('缓存',73,0),scratch=structuredClone(actor);
 withSpellInfoProjection([actor],()=>{
  assert.equal(spellInfo(actor,133),spellInfo(actor,133));
  assert.notEqual(spellInfo(scratch,133),spellInfo(scratch,133));
  const outer=spellInfo(actor,133);
  withSpellInfoProjection([scratch],()=>assert.notEqual(spellInfo(actor,133),outer));
  assert.equal(spellInfo(actor,133),outer);
 });
 const before=spellInfo(actor,133);actor.talents[Object.values(talents).find(t=>t.classId===8&&t.name==='Improved Fireball').id]=5;
 assert.equal(spellInfo(actor,133).castMs,before.castMs-500);
 assert.throws(()=>withSpellInfoProjection([actor],()=>{throw Error('projection failed');}));
 actor.talents={};assert.equal(spellInfo(actor,133).castMs,before.castMs);
});
test('scoped public projections exactly match uncached views for current workloads',()=>{
 for(const [name,state] of Object.entries(localScenarios()))for(const scope of ['full','combat']){
  const expected=buildGameResponse(state,1,{scope,view:scope==='combat'&&state.combat?combatView(state):view(state)});
  assert.deepEqual(buildGameResponse(state,1,{scope}),expected,`${name}/${scope}`);
 }
});

test('skill and PvP metadata caches invalidate on in-place configuration edits',async()=>{
 const {strategySpellIds}=await import('../src/rules/combat-strategy.js');
 const {pvpConfiguration}=await import('../src/rules/pvp-profiles.js');
 const c=createGame('配置',73,0);c.level=60;
 const original=strategySpellIds(c);const external=strategySpellIds(c);external.length=0;
 assert.deepEqual(strategySpellIds(c),original);
 c.learned.push(143);assert.ok(strategySpellIds(c).includes(143));assert.ok(!strategySpellIds(c).includes(133));
 c.learned.splice(c.learned.indexOf(143),1);assert.deepEqual(strategySpellIds(c),original);
 const initial=pvpConfiguration(c).members[0];c.hp--;c.mana--;
 assert.equal(pvpConfiguration(c).members[0],initial,'health/resource changes do not rebuild builds');
 c.arena={phase:'combat'};assert.equal(pvpConfiguration(c).locked,true);
 const edits=[()=>{c.name='新名字';},()=>{c.level=59;},()=>{c.raceId=7;},()=>{c.learned.push(116);},
  ()=>{c.dormantTalentSpells=[12042];},()=>{c.dormantTalentSpells.push(11129);},
  ()=>{c.talents[Object.values(talents).find(t=>t.classId===8&&t.name==='Improved Fireball').id]=1;},
  ()=>{c.pvpProfile={...pvpConfiguration(c).members[0].profile,revision:1};},()=>{c.pvpProfile.name='已保存';},
  ()=>{c.pvpProfile.rules[0].value=20;},()=>{delete c.pvpProfile;}];
 for(const edit of edits){const before=pvpConfiguration(c).members[0];edit();const next=pvpConfiguration(c);assert.notEqual(next.members[0],before);assert.deepEqual(next,pvpConfiguration(structuredClone(c)));}
});
