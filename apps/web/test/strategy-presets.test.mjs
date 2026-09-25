import {recruitForTest} from './support/party-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {classDefinitions,classAbilities,classTalentTrees,spells,talents} from '../../../packages/game-domain/src/rules/catalog.js';
import {strategySpellIds,validateRules,ruleMatches} from '../../../packages/game-domain/src/rules/combat-strategy.js';
import {strategyPresets} from '../../../packages/game-domain/src/rules/strategy-presets.js';
import {combatRole} from '../../../packages/game-domain/src/rules/combat-roles.js';
import {positionPartyMember,mayApproachForSpell,rescueTarget} from '../../../packages/game-domain/src/rules/combat-positioning.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {distance} from '../../../packages/sim-core/src/geometry.js';
import {MAX_STRATEGY_RULES} from '../../../packages/sim-core/src/strategy-config.js';

function trained(classId=8){
 const definition=classDefinitions.find(c=>c.id===classId);
 const s=createGame('策略测试',731,0,{classId,raceId:definition.races[0]});s.level=20;
 s.learned=[...new Set([...s.learned,...(classAbilities[classId]||[]).filter(a=>a.requiredLevel<=20&&['trainer','weapon'].includes(a.acquisition)).map(a=>a.spellId)])];
 s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;return s;
}
test('every class and talent branch has an applicable level-20 template using only learned highest active ranks',()=>{
 let count=0;
 for(const definition of classDefinitions){
  const s=trained(definition.id),options=strategyPresets(s),allowed=strategySpellIds(s);
  assert.ok(options.length>=3,definition.name);
  assert.equal(options.filter(p=>p.recommended).length,1);
  for(const preset of options){
   count++;assert.ok(preset.rules.length>0,preset.name);assert.ok(preset.rules.length<=MAX_STRATEGY_RULES);validateRules(s,preset.rules);
   assert.ok(preset.rules.every(r=>allowed.includes(r.spell)));assert.ok(preset.rules.every(r=>spells[r.spell].SpellLevel<=20));
   const changed=act(s,{type:'strategy',rules:preset.rules,policy:preset.policy,autoBuffs:preset.autoBuffs,potions:preset.potions},0);
   assert.deepEqual(changed.talents,s.talents);assert.equal(combatRole(changed),preset.role);
  }
 }
 assert.equal(count,28);
});
test('recommendation follows allocated talent points and covers the extra bear tank variant',()=>{
 for(const tree of classTalentTrees){
  const s=trained(tree.classId);s.talents={[tree.talents[0].id]:5};
  assert.equal(strategyPresets(s).find(p=>p.recommended).id,String(tree.id));
 }
 assert.equal(strategyPresets(trained(11)).find(p=>p.id==='281-bear').role,'tank');
});
test('skill picker excludes unlearned skills, passives and talent nodes but retains learned active talent spells',()=>{
 const s=trained();
 const passive=Object.values(talents).find(t=>t.classId===8&&t.name==='Improved Fireball').ranks[0];
 s.learned=[133,143,145,227,passive,11366];
 const ids=strategySpellIds(s);
 assert.deepEqual(new Set(ids),new Set([145,11366]));
 assert.throws(()=>validateRules(s,[{spell:116,condition:'always',value:0,enabled:true}]),/技能/);
 assert.throws(()=>validateRules(s,[{spell:passive,condition:'always',value:0,enabled:true}]),/技能/);
 const member=view(s).strategyMembers[0];
 assert.ok(member.skills.every(a=>a.known&&a.icon));assert.ok(member.rules.every(r=>ids.includes(r.spell)));
});
test('enemyFar uses strict greater-than and two-dimensional distance with validated thresholds',()=>{
 const s=trained(3);s.position=s.positionY=0;const enemy={position:6,positionY:8};
 assert.equal(ruleMatches(s,s,enemy,{condition:'enemyFar',value:10}),false);
 assert.equal(ruleMatches(s,s,enemy,{condition:'enemyFar',value:9}),true);
 const spell=strategySpellIds(s)[0];
 assert.throws(()=>validateRules(s,[{spell,enabled:true,condition:'enemyFar',value:NaN}]),/阈值/);
});
function group(classId=8){
 let s=trained(classId);s.rules=[];s.strategyPolicy={waitForTank:false}; // Positioning is tested independently of the opening hold.
 s=recruitForTest(s,{type:'recruit',id:'warrior'},0);s=recruitForTest(s,{type:'recruit',id:'priest'},0);
 startCombat(s,[636],true);const e=s.combat.enemies[0];e.hp=e.maxHp=100000;e.target=s.party[0].id;e.threat={[s.party[0].id]:1000};e.rootUntil=e.nextAttack=e.nextSpell=100000;
 s.party[0].position=27;return s;
}
test('party casters and healers stay beyond 20 yards when idle, out of mana or on cooldown',()=>{
 const s=group();s.position=5;s.mana=0;s.nextAction=100000;
 for(let n=0;n<50;n++){s.clock=n*100;combatTick(s);}
 const e=s.combat.enemies[0];
 assert.ok(distance(s,e)>20);assert.ok(distance(s.party[1],e)>20);
 assert.ok(distance(s.party[0],e)<=5);
 assert.equal(s.logs.some(l=>l.actorId===s.id&&l.action==='近战攻击'),false);
});
test('hunter backs away from the shooting dead zone and can shoot once in range',()=>{
 const s=group(3),e=s.combat.enemies[0];s.position=25;s.positionY=0;s.nextAction=100000;
 s.party[0].rules=[];s.party[0].nextAction=s.party[0].nextSwing=100000;
 e.target=s.id;e.threat={[s.id]:10000};
 for(let n=0;n<40;n++){s.clock=n*100;combatTick(s);}
 assert.ok(distance(s,e)>=8);assert.ok(s.logs.some(l=>l.actorId===s.id&&l.spellId===75));
});
test('backline positioning respects roots, active casts and actual short-range reactions',()=>{
 const s=group(),e=s.combat.enemies[0];s.position=25;s.rootUntil=10000;
 assert.equal(positionPartyMember(s,s,e),false);assert.equal(s.position,25);
 s.rootUntil=0;s.cast={};assert.equal(positionPartyMember(s,s,e),false);s.cast=null;
 s.position=0;assert.equal(mayApproachForSpell(s,s,e,{range:10}),false);
 assert.equal(mayApproachForSpell(s,s,e,{range:30}),true);
});
test('a backline mage can use configured Frost Nova before retreating',()=>{
 const s=group(),e=s.combat.enemies[0];s.position=e.position-6;s.positionY=e.positionY;
 s.party[0].rules=[];s.party[0].nextAction=s.party[0].nextSwing=100000;
 e.target=s.id;e.threat={[s.id]:10000};
 const spell=strategySpellIds(s).find(id=>spells[id].SpellName==='Frost Nova');
 s.rules=[{spell,condition:'enemyNear',value:8,enabled:true}];combatTick(s);
 assert.ok(s.logs.some(l=>l.actorId===s.id&&l.spellId===spell&&l.kind==='cast'));
 s.clock+=100;const before=distance(s,e);combatTick(s);assert.ok(distance(s,e)>before);
});
test('tank rescues the enemy threatening backline before a held enemy',()=>{
 const s=group(),tank=s.party[0],held=s.combat.enemies[0];
 const loose={...held,id:'loose',position:4,target:s.id};
 assert.equal(rescueTarget(s,tank,[held,loose]),loose);
});
test('ally-health rule responds to wounded teammates rather than only the caster',()=>{
 const s=group(5),tank=s.party[0],e=s.combat.enemies[0];tank.hp=1;
 assert.equal(ruleMatches(s,s,e,{condition:'allyHealthBelow',value:65}),true);
 tank.hp=stats(tank).maxHp;assert.equal(ruleMatches(s,s,e,{condition:'allyHealthBelow',value:65}),false);
});
test('strategy can be configured after death without reviving or changing talent points',()=>{
 const s=trained();s.hp=0;const preset=strategyPresets(s).find(p=>p.recommended);
 const next=act(s,{type:'strategy',rules:preset.rules,policy:preset.policy},0);
 assert.equal(next.hp,0);assert.deepEqual(next.rules,preset.rules);assert.deepEqual(next.talents,s.talents);
});
test('templates and role settings round-trip through service persistence and instance commands',async()=>{
 const {GameService}=await import('../../../packages/game-domain/src/service.ts');
 const {MemoryStore}=await import('../../../packages/persistence/src/memory.ts');
 const {persistCharacter}=await import('../../../packages/game-domain/src/context.ts');
 const {buildGameResponse}=await import('../../../packages/game-domain/src/rules/server-response.js');
 const {randomUUID}=await import('node:crypto');
 const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>0});
 let snap=await service.createAccount('preset-account',{name:'模板队长',classId:8,raceId:1},randomUUID());
 const ids=[snap.account.primaryCharacterId];
 await store.transaction(async tx=>{const c=await tx.get('characters',ids[0]);c.rules.level=20;c.rules.location='stormwind';c.rules.completed[900001]=1;await tx.put('characters',c);});
 for(const classId of [1,5,4,8]){
  snap=await service.command('preset-account',{type:'createCompanion',name:`队友${classId}`,classId,raceId:1,requestId:randomUUID()});
  ids.push(snap.roster.find(c=>!ids.includes(c.id)).id);
 }
 await store.transaction(async tx=>{
  for(const id of ids){const c=await tx.get('characters',id),s=trained(c.rules.classId);s.id=id;s.location='deadmines';await persistCharacter(tx,c,s,0,randomUUID(),randomUUID);}
 });
 await service.command('preset-account',{type:'setParty',characterIds:ids,requestId:randomUUID()});
 for(const id of ids){
  snap=await service.snapshot('preset-account',id);const preset=strategyPresets(snap.state).find(p=>p.recommended);
  await service.command('preset-account',{type:'strategy',target:id,rules:preset.rules,policy:preset.policy,autoBuffs:preset.autoBuffs,potions:preset.potions,requestId:randomUUID()});
 }
 snap=await service.command('preset-account',{type:'enterDungeon',requestId:randomUUID()});
 const priest=snap.state.party.find(c=>c.classId===5),preset=strategyPresets(priest).find(p=>p.recommended);
 const expandedRules=Array.from({length:MAX_STRATEGY_RULES},(_,i)=>({...structuredClone(preset.rules[i%preset.rules.length]),enabled:i%2===0}));
 await service.command('preset-account',{type:'strategy',operation:'saveProfile',name:'副本治疗',target:priest.id,rules:expandedRules,policy:preset.policy,autoBuffs:preset.autoBuffs,potions:preset.potions,requestId:randomUUID()});
 await service.command('preset-account',{type:'strategy',target:priest.id,rules:[],requestId:randomUUID()});
 snap=await service.command('preset-account',{type:'strategy',operation:'loadProfile',name:'副本治疗',target:priest.id,requestId:randomUUID()});
 assert.deepEqual(snap.state.party.find(c=>c.id===priest.id).rules,expandedRules);
 assert.equal(snap.state.party.find(c=>c.id===priest.id).strategyPolicy.role,'healer');
 const response=buildGameResponse(snap.state,snap.account.revision);
 const projected=response.snapshot.view.strategyMembers.find(c=>c.id===priest.id);
 assert.equal(projected.presets.length,3);assert.equal(projected.policy.role,'healer');
 assert.deepEqual(projected.rules,expandedRules);
 assert.deepEqual(projected.strategyProfiles[0].rules,expandedRules);
 assert.ok(projected.skills.every(s=>s.known&&s.icon));
 await service.command('preset-account',{type:'leaveInstance',instanceId:snap.instanceId,requestId:randomUUID()});
 const reloaded=await new GameService(store,{contentVersion:'test',now:()=>0}).snapshot('preset-account',priest.id);
 assert.deepEqual(reloaded.state.rules,expandedRules);assert.equal(reloaded.state.strategyPolicy.role,'healer');
 assert.equal(reloaded.state.strategyProfiles[0].name,'副本治疗');
 const restarted=new GameService(store,{contentVersion:'test',now:()=>0});
 await restarted.command('preset-account',{type:'strategy',characterId:priest.id,rules:[],requestId:randomUUID()});
 const restored=await restarted.command('preset-account',{type:'strategy',characterId:priest.id,operation:'loadProfile',name:'副本治疗',requestId:randomUUID()});
 assert.deepEqual(restored.state.rules,expandedRules);
});
