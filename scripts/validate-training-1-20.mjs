import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createGame,act,view} from '../packages/game-domain/src/rules/engine.js';
import {classDefinitions,classAbilities,classContentManifest} from '../packages/game-domain/src/rules/catalog.js';
import {classBookUse,useClassBook} from '../packages/game-domain/src/rules/class-acquisition.js';

// Explicit fixtures: levels and copper are granted; no claim of natural progression.
const report={fixture:{levelRange:[1,20],copperPerLevel:10000000,location:'northshire',books:'conditional probes only; no fabricated item in main progression'},classes:[],guards:[]};
for(const definition of classDefinitions){
 const raceId=definition.races.includes(1)?1:definition.races[0];
 let s=createGame('技能验证',12345,0,{classId:definition.id,raceId});
 const original=classAbilities[definition.id]||[],events=[];
 for(let level=1;level<=20;level++){
  s.level=level;s.money=report.fixture.copperPerLevel;
  while(true){
   const available=view(s).skills.filter(a=>a.canTrain);
   if(!available.length)break;
   for(const a of available){const before=s.money;s=act(s,{type:'train',id:a.spellId},0);assert.ok(s.learned.includes(a.spellId));assert.equal(s.money,before-a.costCopper);events.push({spellId:a.spellId,level,costCopper:a.costCopper});}
  }
 }
 const skills=view(s).skills;
 const rows=original.map((a,index)=>{
  const displayed=skills.find(v=>v.spellId===a.spellId),event=events.find(e=>e.spellId===a.spellId);
  const row={index,spellId:a.spellId,name:a.name,requiredLevel:a.requiredLevel,acquisition:a.acquisition,raceIds:a.raceIds||a.startingRaces||[],previousSpellId:a.previousSpellId||null,status:a.requiredLevel>20?'above-scope':event?'trained':s.learned.includes(a.spellId)?'initially-known':displayed?.known?'known-via-rank':'blocked',learnedAt:event?.level||null,reason:displayed?.blockedReason||null};
  if(row.status==='blocked'){
   try{act(s,{type:'train',id:a.spellId},0);throw new Error('unexpected allowed training');}catch(error){row.reason=error.message;}
   // Race-filtered records get a second, explicitly valid-race fixture rather than being skipped.
   if(/种族/.test(row.reason)){
    const permitted=row.raceIds.find(id=>definition.races.includes(id));
    if(permitted){const alternate={...structuredClone(s),raceId:permitted};try{const trained=act(alternate,{type:'train',id:a.spellId},0);row.validRaceProbe={raceId:permitted,result:trained.learned.includes(a.spellId)?'trained':'not-learned'};}catch(error){row.validRaceProbe={raceId:permitted,result:'blocked',reason:error.message};}}
   }
   if(a.acquisition==='book'){
    const entries=classContentManifest.entries.filter(e=>e.classId===definition.id&&e.spellId===a.spellId&&e.actor==='player');
    row.bookSources=entries.map(e=>({itemIds:e.itemIds,obtainableItemIds:e.obtainableItemIds}));
    row.bookProbes=[];
    for(const itemId of new Set(entries.flatMap(e=>e.obtainableItemIds||[]))){
     const probe=structuredClone(s);probe.bag.push({id:itemId,uid:`probe-${itemId}`,count:1});
     try{const trained=act(probe,{type:'train',id:a.spellId},0);row.bookProbes.push({itemId,result:'trained',consumed:!trained.bag.some(i=>i.uid===`probe-${itemId}`)});}catch(error){row.bookProbes.push({itemId,result:'blocked',reason:error.message});}
    }
   }
  }
  return row;
 });
 assert.equal(rows.length,original.length);
 report.classes.push({classId:definition.id,name:definition.name,raceId,events,rows,summary:Object.fromEntries(['trained','initially-known','known-via-rank','blocked','above-scope'].map(status=>[status,rows.filter(r=>r.status===status).length]))});
}
report.bookManifestProbes=[];
const demonEntries={188:416,189:417,204:1860,205:1863,206:89,207:11859};
for(const entry of classContentManifest.entries.filter(e=>e.acquisition==='book'&&e.requiredLevel<=20)){
 const definition=classDefinitions.find(c=>c.id===entry.classId),raceId=entry.raceIds.find(id=>definition.races.includes(id));
 const row={classId:entry.classId,spellId:entry.spellId,actor:entry.actor,requiredLevel:entry.requiredLevel,contentRole:entry.contentRole,itemIds:entry.itemIds,obtainableItemIds:entry.obtainableItemIds,probes:[]};
 if(!(entry.obtainableItemIds||[]).length&&entry.itemIds?.length){const unavailable=createGame('不可得书籍验证',100,0,{classId:entry.classId,raceId});unavailable.level=20;const item={id:entry.itemIds[0],uid:'unavailable-book',count:1};unavailable.bag.push(item);row.unavailableSourceProbe=classBookUse(unavailable,item);assert.equal(row.unavailableSourceProbe.canUse,false);}
 for(const itemId of entry.obtainableItemIds||[]){
  const probe=createGame('书籍条件验证',99,0,{classId:entry.classId,raceId});probe.level=20;
  const item={id:itemId,uid:`book-${itemId}`,count:1};probe.bag.push(item);
  const before=classBookUse(probe,item);
  if(entry.actor==='pet')probe.pet={entry:entry.sources.map(src=>demonEntries[src.skillId]).find(Boolean),kind:entry.classId===9?'demon':'beast',hp:100,level:20,learned:entry.previousSpellId?[entry.previousSpellId]:[],availableSkills:[]};
  else if(entry.previousSpellId)probe.learned.push(entry.previousSpellId);
  const conditioned=classBookUse(probe,item),result={itemId,baseline:before,fixture:'level 20, actual source book instance, matching living demon and prerequisite skill when required',conditioned};
  if(conditioned?.canUse){assert.equal(useClassBook(probe,item),true);assert.ok(!probe.bag.some(i=>i.uid===item.uid));result.consumed=true;result.learned=entry.actor==='pet'?(probe.pet.learned.includes(entry.spellId)||probe.pet.availableSkills.includes(entry.spellId)):probe.learned.includes(entry.spellId);assert.ok(result.learned);}
  row.probes.push(result);
 }
 report.bookManifestProbes.push(row);
}
const rejection=(label,state,spellId,pattern)=>{const before=JSON.stringify(state);let reason;assert.throws(()=>act(state,{type:'train',id:spellId},0),error=>{reason=error.message;return pattern.test(reason);});assert.equal(JSON.stringify(state),before);report.guards.push({label,spellId,reason,atomic:true});};
const mage=createGame('边界验证',77,0);mage.money=10000000;
rejection('level',mage,116,/需要.*级/);
rejection('money',{...mage,level:4,money:0},116,/费用不足/);
rejection('wrong-class',{...mage,level:20},100,/职业/);
rejection('prerequisite',{...mage,level:20},145,/前一/);
writeFileSync(new URL('../docs/research/import/refactor-training-1-20.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({classes:report.classes.map(({classId,summary})=>({classId,...summary})),guards:report.guards},null,2));
