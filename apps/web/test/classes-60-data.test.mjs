import test from 'node:test';
import assert from 'node:assert/strict';
import * as catalog from '../../../packages/game-domain/src/rules/catalog.js';
import classReference from '../../../packages/game-data/data/classes-reference.json' with {type:'json'};

test('all 40 race/class pairs have complete source stats and XP through 60',()=>{
 const stats=catalog.table('player_levelstats'),base=catalog.table('player_classlevelstats');
 assert.equal(stats.length,2400);assert.equal(base.length,540);
 for(const c of catalog.classDefinitions)for(let level=1;level<=60;level++){
  assert.ok(base.some(r=>r.class===c.id&&r.level===level));
  for(const race of c.races)assert.ok(stats.some(r=>r.race===race&&r.class===c.id&&r.level===level));
  assert.ok(catalog.xpTable[level]?.xp_for_next_level>0,`XP ${level}`);
 }
});

test('acquisition manifest includes source-backed quest, book, racial, pet and weapon content',()=>{
 const manifest=catalog.classContentManifest;
 assert.equal(manifest?.levelCap,60);
 for(const type of ['starting','trainer','classQuest','book','racial','pet','weapon','passive','talent'])assert.ok(manifest.entries.some(e=>e.acquisition===type),type);
 for(const e of manifest.entries){
  assert.ok(e.id&&e.classId&&e.spellId&&e.sources.length,e.id);
  assert.ok(e.raceIds.length,e.id);assert.ok(catalog.spells[e.spellId],e.id);
  assert.equal(e.executionStatus,'unverified');
  assert.equal(e.dataStatus,'complete',e.id);
  for(const id of e.itemIds||[])assert.ok(catalog.items[id],`item ${id}`);
 }
 for(const id of [2457,2458,20608,1066,698,712,691,1122,18540,23214,23161,10053,28612,25306,25314,25345])assert.ok(manifest.entries.some(e=>e.spellId===id),`expected ability ${id}`);
});

test('source spell item/enchant/trigger dependencies are retained recursively',()=>{
 for(const list of Object.values(catalog.classAbilities))for(const a of list){
  assert.ok(a.requiredLevel<=60);
  const s=catalog.spells[a.spellId];assert.ok(s);
  for(let i=1;i<=3;i++){
   if(s['EffectTriggerSpell'+i])assert.ok(catalog.spells[s['EffectTriggerSpell'+i]],`trigger ${a.spellId}`);
   if([24,66].includes(s['Effect'+i])&&s['EffectItemType'+i])assert.ok(catalog.items[s['EffectItemType'+i]],`created item ${a.spellId}`);
   if([53,54].includes(s['Effect'+i]))assert.ok(catalog.classEnchantments[s['EffectMiscValue'+i]],`enchant ${a.spellId}`);
  }
  for(let i=1;i<=8;i++)if(s['Reagent'+i]>0)assert.ok(catalog.items[s['Reagent'+i]],`reagent ${a.spellId}`);
 }
});

test('player spell lists distinguish race grants from hidden and obsolete reference content',()=>{
 for(const [cid,rows] of Object.entries(catalog.classAbilities)){
  const sourceStarts=catalog.table('playercreateinfo_spell').filter(r=>r.class===Number(cid));
  for(const a of rows.filter(a=>a.startingSpell))assert.deepEqual([...a.startingRaces].sort((a,b)=>a-b),[...new Set(sourceStarts.filter(r=>r.Spell===a.spellId).map(r=>r.race))].sort((a,b)=>a-b),`starting race ${cid}:${a.spellId}`);
  for(const a of rows)assert.ok(!['Generic','Opening','Grovel','Attacking','Honorless Target','Sleep',"Khadgar's Unlocking",'zzOLDPrayer of Fortitude'].includes(a.name));
 }
 assert.ok(!catalog.classAbilities[1].some(a=>a.spellId===877));
 assert.ok(!catalog.classAbilities[2].some(a=>a.name==='Berserking'));
 for(const a of catalog.classAbilities[5].filter(a=>a.name==='Shadowguard'))assert.deepEqual(a.raceIds,[8]);
 assert.ok(catalog.classAbilities[3].some(a=>a.spellId===20906));
 assert.ok(catalog.classAbilities[11].some(a=>a.spellId===18960&&a.originalQuestIds.includes(5921)));
});

test('rogue lock and pickpocket dependencies and all healthstone variants are available',()=>{
 assert.ok(catalog.table('pickpocketing_loot_template').length>0);
 assert.ok(Object.keys(catalog.classLocks).length>0);
 for(const id of [5512,19004,19005,9421,19012,19013])assert.ok(catalog.items[id]);
 for(const r of catalog.table('pickpocketing_loot_template'))if(r.mincountOrRef>=0&&r.item)assert.ok(catalog.items[r.item],`pickpocket item ${r.item}`);
 const itemIndex=classReference.schemas.item_template.indexOf('entry'),sourceItems=new Set(classReference.tables.item_template.map(r=>r[itemIndex]));
 for(const name of ['item_loot_template','reference_loot_template'])for(const packed of classReference.tables[name]){
  const row=Object.fromEntries(classReference.schemas[name].map((k,i)=>[k,packed[i]]));
  if(row.item&&row.mincountOrRef>=0)assert.ok(sourceItems.has(row.item),`unresolved imported ${name} item ${row.item}`);
 }
});

test('every client class skill inventory row has a classified manifest entry and precise masks',()=>{
 const m=catalog.classContentManifest;
 for(const row of m.skillLineInventory)assert.ok(m.entries.some(e=>e.classId===row.classId&&e.spellId===row.spellId),`skill line ${row.id}`);
 assert.equal(new Set(m.entries.map(e=>e.id)).size,m.entries.length);
 for(const row of catalog.table('spell_affect'))assert.equal(typeof row.SpellFamilyMask,'string');
 for(const row of catalog.table('spell_proc_event'))for(let i=0;i<3;i++)assert.equal(typeof row['SpellFamilyMask'+i],'string');
 for(const spell of catalog.table('spell_template')){
  for(const [table,field] of [['SpellCastTimes','CastingTimeIndex'],['SpellDuration','DurationIndex'],['SpellRange','RangeIndex']])if(spell[field])assert.ok(catalog.lookup[table][spell[field]],`${spell.Id} ${field}`);
 }
});

test('class mount quest riding reward remains provenance without a duplicate standalone skill',()=>{
 assert.ok(!Object.values(catalog.classAbilities).flat().some(a=>a.spellId===33388));
 assert.ok(catalog.classContentManifest.entries.some(e=>e.spellId===33388&&e.contentRole==='quest-script-effect'));
});

test('totem party weapon enchant effects retain their enchant and proc spell dependencies',()=>{
 for(const id of [1783,124]){const e=catalog.classEnchantments[id];assert.ok(e,`totem enchant ${id}`);for(const effect of e.effects)if([1,3,7].includes(effect.type)&&effect.spellId)assert.ok(catalog.spells[effect.spellId]);}
});
