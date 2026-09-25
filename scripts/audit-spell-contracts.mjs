import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {classAbilities,spells,talents,spellChain} from '../packages/game-domain/src/rules/catalog.js';
import {spellProgram,spellModifierOperations} from '../packages/sim-core/src/spell-program.js';
import {spellCoefficient} from '../packages/game-domain/src/rules/spell-scaling.js';
import {spellEffectHandlers,weaponEffectIds} from '../packages/game-domain/src/rules/spell-effect-runtime.js';
import {talentAffectsSpell} from '../packages/game-domain/src/rules/talent-effects.js';

const reportUrl=new URL('../docs/research/spell-contracts.json',import.meta.url);
const operationNames=Object.fromEntries(Object.entries(spellModifierOperations).map(([name,id])=>[id,name]));
const sourceCommit='8ec338a1704e7dcb1c0213eb7ed58f9231ade40f';

export function auditSpellContracts(){
 const abilityRows=Object.entries(classAbilities).flatMap(([classId,rows])=>rows.map(row=>({classId:+classId,...row}))),missingTriggers=new Map();
 const abilities=abilityRows.map(row=>{
  const sp=spells[row.spellId],program=spellProgram(sp);
  return {classId:row.classId,spellId:sp.Id,name:sp.SpellName,rank:sp.Rank1,root:spellChain[sp.Id]?.first_spell||sp.Id,
   school:sp.School,family:sp.SpellFamilyName,
   timing:{cast:sp.CastingTimeIndex,duration:sp.DurationIndex,cooldown:sp.RecoveryTime,category:sp.Category,categoryCooldown:sp.CategoryRecoveryTime,gcdCategory:sp.StartRecoveryCategory,gcd:sp.StartRecoveryTime},
   effects:program.effects.map(effect=>{
    if(effect.trigger&&!spells[effect.trigger])missingTriggers.set(`${sp.Id}:${effect.index}`,{spellId:sp.Id,effect:effect.index,trigger:effect.trigger});
    const damage=effect.id===2&&sp.School>0,periodic=[6,35].includes(effect.id)&&[3,8,53,64,89,161].includes(effect.aura);
    return {...effect,genericExecutor:weaponEffectIds.has(effect.id)?'weapon-aggregate':spellEffectHandlers[effect.id]?.name||null,
     coefficient:spellCoefficient(sp,{periodic:[3,8,53,64,89,161].includes(effect.aura),effect:effect.index}),
     verification:damage?'isolated-source-damage-range-tested':effect.id===10?'isolated-source-healing-range-tested':periodic?'isolated-periodic-amount-tested':'decoded-source-contract; scenario-validation-required'};
   })};
 }).sort((a,b)=>a.classId-b.classId||a.spellId-b.spellId);
 const talentRows=Object.values(talents).map(t=>({id:t.id,classId:t.classId,name:t.name,
  ranks:t.ranks.map(id=>({spellId:id,effects:spellProgram(spells[id]).effects.map(effect=>({index:effect.index,type:effect.aura,
   operation:[107,108].includes(effect.aura)?effect.misc:null,operationName:[107,108].includes(effect.aura)?operationNames[effect.misc]||'UNKNOWN':null,
   amount:effect.basePoints+1,trigger:effect.trigger,
   affectedSpells:[107,108].includes(effect.aura)?abilityRows.filter(a=>a.classId===t.classId&&talentAffectsSpell(spells[id],effect.index,spells[a.spellId])).map(a=>a.spellId).sort((a,b)=>a-b):[],
   verification:[107,108].includes(effect.aura)?'all-family-mask-pairs-tested':'requires-stat-or-event-scenario',
  }))}))})).sort((a,b)=>a.classId-b.classId||a.id-b.id);
 return {schemaVersion:1,sourceCommit,claims:{officialServerParity:false,everyAbilityEndToEndVerified:false,
  scope:'Every exposed player rank and talent rank has an effect contract; numerical and integration coverage are explicitly separate.'},
  totals:{playerAbilityRows:abilities.length,talentNodes:talentRows.length,talentRanks:talentRows.reduce((n,t)=>n+t.ranks.length,0),
   effects:abilities.reduce((n,a)=>n+a.effects.length,0),directMagicEffectsTested:abilities.reduce((n,a)=>n+a.effects.filter(e=>e.verification==='isolated-source-damage-range-tested').length,0),
   directHealingEffectsTested:abilities.reduce((n,a)=>n+a.effects.filter(e=>e.verification==='isolated-source-healing-range-tested').length,0),
   periodicEffectsTested:abilities.reduce((n,a)=>n+a.effects.filter(e=>e.verification==='isolated-periodic-amount-tested').length,0),
   talentModifierLinks:talentRows.reduce((n,t)=>n+t.ranks.reduce((sum,r)=>sum+r.effects.reduce((value,e)=>value+e.affectedSpells.length,0),0),0)},
  abilities,talents:talentRows,missingTriggers:[...missingTriggers.values()],
  behaviorTests:['apps/web/test/spell-effect-runtime.test.mjs','apps/web/test/classic-combat-rules.test.mjs','apps/web/test/talents-60.test.mjs'],
  interpretation:{genericExecutor:'A reusable effect handler exists; class script routes and target rules need separate verification.',
   missingTriggers:'Unresolved referenced children remain visible; never treat an absent child as a successfully verified effect.',
   scenarioRequired:'Source decoding or mask matching is not a proof of damage, targeting, dispel, stacking or proc parity.'}};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const report=auditSpellContracts(),json=JSON.stringify(report,null,2)+'\n';
 if(process.argv.includes('--check')){
  if(readFileSync(reportUrl,'utf8')!==json)throw new Error('Spell contracts are stale; run npm run combat:audit');
 }else writeFileSync(reportUrl,json);
 console.log(JSON.stringify({...report.totals,unresolvedTriggerReferences:report.missingTriggers.length},null,2));
}
