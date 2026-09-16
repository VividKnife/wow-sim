import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as catalog from '../../../packages/game-domain/src/rules/catalog.js';
import {supportedSpellNames,supportedTalentNames} from '../../../packages/game-domain/src/rules/class-support.js';
import classReference from '../../../packages/game-data/data/classes-reference.json' with {type:'json'};

const classIds=[1,2,3,4,5,7,8,9,11];
const raceIds=[1,2,3,4,5,6,7,8];

test('catalog exposes every vanilla race, class, and playable combination',()=>{
 assert.deepEqual(catalog.classDefinitions.map(c=>c.id),classIds);
 assert.deepEqual(catalog.raceDefinitions.map(r=>r.id),raceIds);
 assert.equal(catalog.classDefinitions.reduce((count,c)=>count+c.races.length,0),40);
 for(const c of catalog.classDefinitions){
  assert.ok(['mana','rage','energy'].includes(c.power));
  assert.ok(c.name&&c.nameEn&&c.races.length);
 }
});

test('class reference retains all level 1-60 base-stat rows without composite-key loss',()=>{
 const validPairs=catalog.classDefinitions.flatMap(c=>c.races.map(race=>[race,c.id]));
 const levelStats=catalog.table('player_levelstats');
 const classStats=catalog.table('player_classlevelstats');
 assert.equal(levelStats.length,2400);
 assert.equal(classStats.length,540);
 for(const [race,classId] of validPairs)for(let level=1;level<=60;level++){
  assert.ok(levelStats.some(r=>r.race===race&&r.class===classId&&r.level===level),`${race}:${classId}:${level}`);
 }
});

test('each class exposes sourced starting spells and every trainer rank through level 60',()=>{
 assert.deepEqual(Object.keys(catalog.classAbilities).map(Number).sort((a,b)=>a-b),classIds);
 for(const classId of classIds){
  const rows=catalog.classAbilities[classId];
  assert.ok(rows.some(a=>a.startingSpell),`class ${classId} starting spell`);
  assert.ok(rows.some(a=>!a.startingSpell&&a.requiredLevel===20),`class ${classId} level 20 trainer spell`);
  for(const a of rows){
   assert.equal(a.classId,classId);
   assert.ok(a.spellId&&a.name);
   assert.ok(a.requiredLevel<=60);
   assert.ok(Object.hasOwn(a,'previousSpellId'));
   assert.ok(['starting','trainer','classQuest','reference','book','racial','weapon','passive','talent'].includes(a.acquisition));
   if(a.previousSpellId)assert.ok(rows.some(old=>old.spellId===a.previousSpellId),`class ${classId} unreachable previous rank ${a.previousSpellId} for ${a.spellId}`);
  }
 }
 assert.deepEqual(catalog.abilities,catalog.classAbilities[8]);
});

test('shared-route class quest adaptations expose core class unlocks without a fee',()=>{
 const expected={
  1:[71,355,7386],2:[7328],3:[1515,883,982],7:[3599,8071,5394],9:[688,697],11:[5487,6807,6795],
 };
 for(const [classId,spellIds] of Object.entries(expected))for(const spellId of spellIds){
  const ability=catalog.classAbilities[classId].find(row=>row.spellId===spellId);
  assert.ok(ability,`${classId}:${spellId}`);
  assert.equal(ability.acquisition,'classQuest');
  assert.equal(ability.costCopper,0);
  assert.equal(ability.source,'shared-route class quest adaptation');
  assert.ok(catalog.spells[spellId]);
 }
 const seal=catalog.classAbilities[2].find(row=>row.spellId===21084);
 assert.equal(seal.knownEquivalentSpellId,20154);
});

test('class mechanics include their non-chain proc, totem aura, and weapon-enchant records',()=>{
 for(const spellId of [20187,20280,20281,25742,3606,6350,8072,8156,8076,8162,5672,10400,15567,15568,20860,20865,20866]){
  assert.ok(catalog.spells[spellId],`missing supporting spell ${spellId}`);
 }
 assert.equal(catalog.spells[8076].EffectBasePoints1+1,10);
 assert.equal(catalog.spells[8162].EffectBasePoints1+1,20);
 const spellIdColumn=classReference.schemas.spell_template.indexOf('Id');
 assert.ok(classReference.tables.spell_template.some(row=>row[spellIdColumn]===8162),'8162 must be retained by the compact importer');
 assert.equal(catalog.spells[10400].EffectApplyAuraName1,99);
 assert.equal(catalog.spells[10400].EffectBasePoints1+1,29);
 assert.equal(catalog.spells[15567].EffectBasePoints1+1,58);
 assert.equal(catalog.spells[15568].EffectBasePoints1+1,88);
});

test('all playable race-class outfits resolve to source-backed starting items',()=>{
 assert.equal(Object.keys(catalog.classStartingItems).length,40);
 for(const c of catalog.classDefinitions)for(const race of c.races){
  const rows=catalog.classStartingItems[`${race}:${c.id}`];
  assert.ok(rows?.length,`${race}:${c.id}`);
  assert.ok(rows.every(r=>r.itemId&&r.name&&r.count>0&&r.source?.entry===r.itemId));
 }
});

test('all 27 class talent trees preserve placement, ranks, effects, and prerequisites',()=>{
 assert.equal(catalog.classTalentTrees.length,27);
 for(const classId of classIds)assert.equal(catalog.classTalentTrees.filter(t=>t.classId===classId).length,3);
 assert.deepEqual(catalog.talentTrees,catalog.classTalentTrees.filter(t=>t.classId===8));
 for(const tree of catalog.classTalentTrees)for(const talent of tree.talents){
  assert.equal(talent.classId,tree.classId);
  assert.equal(talent.tree,tree.id);
  assert.equal(talent.maxRank,talent.ranks.length);
  assert.equal(talent.requiredTreePoints,talent.row*5);
  assert.equal(talent.earliestLevel,10+talent.row*5);
  assert.equal(talent.rankEffects.length,talent.ranks.length);
  for(const prerequisite of talent.prerequisites)assert.ok(catalog.talents[prerequisite.talentId]);
 }
 const oldMageIds=new Set([41,61,81]);
 assert.deepEqual(new Set(catalog.talentTrees.map(t=>t.id)),oldMageIds);
});

test('every supported class spell and talent has a Chinese display name',()=>{
 const hasChinese=value=>/[\u3400-\u9fff]/u.test(value||'');
 for(const spell of Object.values(catalog.spells).filter(row=>supportedSpellNames.has(row.SpellName))){
  assert.ok(hasChinese(catalog.nameOf('spells',spell.Id)),`${spell.Id} ${spell.SpellName}`);
 }
 for(const talent of Object.values(catalog.talents).filter(row=>supportedTalentNames.has(row.name))){
  assert.ok(hasChinese(talent.nameZhCN),`${talent.classId} ${talent.name}`);
 }
});

test('every supported class ability and talent resolves to a checked-in icon',()=>{
 const publicRoot=fileURLToPath(new URL('../public',import.meta.url));
 for(const rows of Object.values(catalog.classAbilities))for(const ability of rows.filter(row=>supportedSpellNames.has(row.name))){
  const url=catalog.icon('spells',ability.spellId);
  assert.ok(url,`${ability.spellId} ${ability.name}`);
  assert.ok(existsSync(publicRoot+url),url);
 }
 for(const talent of Object.values(catalog.talents).filter(row=>supportedTalentNames.has(row.name))){
  const url=catalog.icon('talents',talent.id);
  assert.ok(url,`${talent.classId} ${talent.name}`);
  assert.ok(existsSync(publicRoot+url),url);
 }
});
