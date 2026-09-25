import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {classDefinitions,classAbilities,classContentManifest,classTalentTrees,talents} from '../../../packages/game-domain/src/rules/catalog.js';
import {supportedSpellNames,talentExecutionCoverage} from '../../../packages/game-domain/src/rules/class-support.js';
import {extendedSpellNames} from '../../../packages/game-domain/src/rules/class-spell-registry.js';
import {utilitySpellNames,passiveSpellNames} from '../../../packages/game-domain/src/rules/class-utility-data.js';
import {talentActiveNames} from '../../../packages/game-domain/src/rules/talent-runtime.js';
import {racialActiveNames,racialPassiveNames} from '../../../packages/game-domain/src/rules/racial-effects.js';
import {petTrainerAbilities} from '../../../packages/game-domain/src/rules/pet-knowledge.js';

const reportUrl=new URL('../../../docs/research/import/classes-60-coverage.json',import.meta.url);
const sortedUnique=values=>[...new Set(values)].sort((a,b)=>typeof a==='number'?a-b:String(a).localeCompare(String(b),'en'));
const counts=values=>Object.fromEntries(sortedUnique(values).map(value=>[value,values.filter(v=>v===value).length]));
const registries=[['extended-class-spell',extendedSpellNames,'packages/game-domain/src/rules/class-spell-effects.js'],['class-utility',utilitySpellNames,'packages/game-domain/src/rules/class-utility.js'],['passive-or-pet-command',passiveSpellNames,'packages/game-domain/src/rules/class-utility-data.js'],['talent-active',talentActiveNames,'packages/game-domain/src/rules/talent-runtime.js'],['racial-active',racialActiveNames,'packages/game-domain/src/rules/racial-effects.js'],['racial-passive',racialPassiveNames,'packages/game-domain/src/rules/racial-effects.js']];
function execution(name){const registered=registries.filter(([,names])=>names.has(name)).map(([registry,,module])=>({registry,module}));if(!registered.length&&supportedSpellNames.has(name))registered.push({registry:'legacy-class-handler',module:'packages/game-domain/src/rules/class-mechanics.js'});return{registrySupported:supportedSpellNames.has(name),routes:registered,verification:'registry-reconciled; behavior verified by family regression tests, not individual spell parity'};}
function compactSource(entries){return sortedUnique(entries.flatMap(e=>e.sources).map(s=>JSON.stringify(s))).map(s=>JSON.parse(s));}

/** Stable inventory: no timestamp or environment paths; --check detects drift. */
export function createCoverage(){
 const entries=classContentManifest.entries;
 const classes=classDefinitions.map(c=>({classId:c.id,name:c.nameEn,raceIds:c.races,playerAbilities:(classAbilities[c.id]||[]).map(a=>{
  const source=entries.filter(e=>e.classId===c.id&&e.spellId===a.spellId&&e.actor==='player');
  return{spellId:a.spellId,name:a.name,rank:a.rank||'',requiredLevel:a.requiredLevel,acquisition:a.acquisition,raceIds:sortedUnique(a.raceIds||a.startingRaces||source.flatMap(e=>e.raceIds)),previousSpellId:a.previousSpellId||0,originalQuestIds:sortedUnique(a.originalQuestIds||source.flatMap(e=>e.questIds||[])),bookItemIds:sortedUnique(source.flatMap(e=>e.itemIds||[])),obtainableBookItemIds:sortedUnique(source.flatMap(e=>e.obtainableItemIds||[])),manifestIds:source.map(e=>e.id).sort(),sources:compactSource(source),execution:execution(a.name)};
 }).sort((a,b)=>a.spellId-b.spellId)}));
 const talentRows=Object.values(talents).map(t=>({talentId:t.id,classId:t.classId,treeId:t.tree,name:t.name,row:t.row,col:t.col,maxRank:t.maxRank,rankSpellIds:t.ranks,prerequisites:t.prerequisites,source:{table:'Talent.dbc',id:t.id},execution:talentExecutionCoverage(t),verification:'executor-classification; class construction and effect-family regressions'})).sort((a,b)=>a.classId-b.classId||a.treeId-b.treeId||a.talentId-b.talentId);
 const references=entries.filter(e=>!['ability','talent','pet-ability'].includes(e.contentRole)).map(e=>({id:e.id,classId:e.classId,spellId:e.spellId,name:e.name,actor:e.actor,acquisition:e.acquisition,contentRole:e.contentRole,availability:e.availability,sources:e.sources}));
 const missing=classes.flatMap(c=>c.playerAbilities.filter(a=>!a.execution.registrySupported).map(a=>({classId:c.classId,spellId:a.spellId,name:a.name}))),missingTalents=talentRows.filter(t=>!t.execution.supported).map(t=>t.talentId);
 return{
  schemaVersion:1,levelCap:60,claims:{originalServerParity:false,scope:'Source inventory and declared execution coverage for nine classes on the existing simulator world',registrySupportIsNotIndividualBehaviorProof:true},
  source:{bundle:'packages/game-data/data/classes-reference.json',sha256:createHash('sha256').update(readFileSync(new URL('../../../packages/game-data/data/classes-reference.json',import.meta.url))).digest('hex'),petFamilyBundle:'packages/game-data/data/pet-family-reference.json',petFamilySha256:createHash('sha256').update(readFileSync(new URL('../../../packages/game-data/data/pet-family-reference.json',import.meta.url))).digest('hex'),manifestSchemaVersion:classContentManifest.schemaVersion},
  totals:{classes:classes.length,playableRaceClassPairs:classDefinitions.reduce((n,c)=>n+c.races.length,0),playerAbilityRows:classes.reduce((n,c)=>n+c.playerAbilities.length,0),petTrainerRows:petTrainerAbilities.length,talentTrees:classTalentTrees.length,talentNodes:talentRows.length,unsupportedPlayerAbilities:missing.length,unsupportedTalentNodes:missingTalents.length},
  petTraining:{trainerAbilities:petTrainerAbilities,execution:'paid owner learning wrapper → eligible pet availableSkills → source-cost pet training',wildKnowledge:'CreatureSpellData.dbc overrides petcreateinfo_spell. Only the tamed beast source skills are innate; each actual active use has pinned core 10/101 chance to teach its owner wrapper, retained after abandonment. Family and source rank limits remain enforced.',excluded:'Hidden client passive records remain classified in the manifest, never offered as public trainer skills.',tests:'apps/web/test/pet-training-acquisition.test.mjs'},
  classes,talents:talentRows,manifest:{entryCount:entries.length,byContentRole:counts(entries.map(e=>e.contentRole)),byAcquisition:counts(entries.map(e=>e.acquisition)),byActor:counts(entries.map(e=>e.actor)),skillLineInventoryRows:classContentManifest.skillLineInventory.length,references},
  gaps:{playerAbilities:missing,talentIds:missingTalents},
  behavioralEvidence:{scope:'Targeted mechanism regressions; 1,759 registry entries are not 1,759 individually verified spell behaviors',petProgression:{module:'packages/game-domain/src/rules/pet-progression.js',test:'apps/web/test/pet-progression.test.mjs',source:'https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Pet.cpp',mechanisms:['loyalty points and XP gates including level cap','loyalty-dependent training points','four distinct active skill chains with rank upgrades and passive exemption','source family restrictions and training cost differences','saved continuation and dismissal/recall persistence'],sourceLimit:'Community reference core, default loyalty rate 1; combat happiness-loss multiplier is marked as an estimate by that source.'}},
  worldBoundaries:[
   {id:'shared-route',status:'adapted',detail:'All races/classes use the existing shared playable route and trainer/service nodes; this does not recreate all original racial starting areas or capitals.'},
   {id:'class-quest-scripts',status:'adapted',detail:'Class quest unlocks retain original quest IDs and source provenance but use the existing shared-route acquisition; original geography, encounter and escort scripts are not reproduced in full.'},
   {id:'raid-book-sources',status:'source-inventory-only-outside-current-maps',detail:'Real loot-only spell books require their actual items. Their original raid/drop sources are recorded, but raids and world maps outside the current world are not fabricated or replaced by free trainer learning.'},
   {id:'ritual-helpers',status:'adapted',detail:'Ritual of Summoning requires two living nearby AI party helpers and a living remote party target, with reagent and completion revalidation. Original multiplayer click/consent/network flow is represented by automatic AI helper participation.'},
   {id:'vertical-fall',status:'formula-present-no-current-world-path',detail:'Fall mitigation and the pinned core fall-damage formula are implemented; current world navigation has no vertical falling path and does not claim original terrain physics.'},
   {id:'teleport-geography',status:'service-endpoints',detail:'Added capital/Moonglade teleport destinations are service endpoints. Missing outdoor road networks are not invented.'},
  ],
  verification:{command:'node apps/web/scripts/audit-classes60.mjs --check',gate:'apps/web/test/classes-60-coverage.test.mjs',behaviorSuites:['class-data.test.mjs','classes-60-data.test.mjs','class-acquisition.test.mjs','classes-60-effects.test.mjs','talents-60.test.mjs','class-utility-channels.test.mjs','classes-60-integration-review.test.mjs','classes60-progression.test.mjs','classes60-utility.test.mjs','class-environment.test.mjs'],note:'This audit verifies inventory reconciliation and registry/executor declarations. Run the behavior suites and browser flows separately; this JSON never claims every rank has individually passed original-server parity testing.'},
 };
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const coverage=createCoverage(),json=JSON.stringify(coverage,null,2)+'\n';
 if(process.argv.includes('--check')){if(readFileSync(reportUrl,'utf8')!==json)throw new Error('Coverage inventory is stale. Run node apps/web/scripts/audit-classes60.mjs');}
 else writeFileSync(reportUrl,json);
 console.log(JSON.stringify(coverage.totals,null,2));
 if(coverage.gaps.playerAbilities.length||coverage.gaps.talentIds.length){console.error(JSON.stringify(coverage.gaps,null,2));process.exitCode=1;}
}
