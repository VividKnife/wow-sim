import petReference from '../../../game-data/data/pet-family-reference.json' with {type:'json'};
import {classContentManifest,classDefinitions,spells,creatures,table} from './catalog.js';
import {rng,log} from './character.js';

const petEntries=classContentManifest.entries.filter(e=>e.classId===3&&e.actor==='pet');
const petIds=new Set(petEntries.map(e=>e.spellId));
const learnCache=new Map();for(const sp of Object.values(spells).sort((a,b)=>a.Id-b.Id))if([36,57].includes(sp.Effect1)&&sp.EffectTriggerSpell1)learnCache.set(sp.EffectTriggerSpell1,sp.Id);
const teachingTargets=(id,seen=new Set())=>{if(seen.has(id))return[];seen.add(id);const sp=spells[id];return[1,2,3].filter(n=>[36,57].includes(sp?.['Effect'+n])).flatMap(n=>{const child=sp['EffectTriggerSpell'+n];return petIds.has(child)?[child]:teachingTargets(child,seen);});};
const familyAllows=(pet,id)=>{const lines=petReference.families[creatures[pet.entry]?.Family]?.skillLines||[];return petEntries.some(e=>e.spellId===id&&e.sources.some(src=>src.table==='SkillLineAbility.dbc'&&lines.includes(src.skillId)));};
// Old hidden client passives remain in the source manifest, not trainer UI.
const candidates=petEntries.filter(e=>!(spells[e.spellId]?.Attributes&128)).flatMap(e=>e.sources.filter(src=>['npc_trainer','npc_trainer_template'].includes(src.table)).map(src=>({spellId:src.ownerTeachingSpellId||src.teachingSpellId,petSpellId:e.spellId,name:e.name,rank:spells[e.spellId]?.Rank1||'',requiredLevel:Math.max(10,src.requiredLevel||0,spells[e.spellId]?.SpellLevel||0),costCopper:src.costCopper||0,classId:3,raceIds:classDefinitions.find(c=>c.id===3).races,previousSpellId:0,acquisition:'petTrainer',trainerSource:src,actor:'pet-training'})));
export const petTrainerAbilities=[...new Map(candidates.sort((a,b)=>b.costCopper-a.costCopper).map(a=>[a.spellId,a])).values()].sort((a,b)=>a.requiredLevel-b.requiredLevel||a.spellId-b.spellId);

export function refreshHunterPetSkills(owner){const pet=owner.pet;if(owner.classId!==3||pet?.kind!=='beast')return;const acquired=(owner.learned||[]).flatMap(id=>teachingTargets(id));pet.availableSkills=[...new Set([...(pet.availableSkills||[]),...acquired.filter(id=>familyAllows(pet,id))])];}
export function grantHunterTrainingLinks(owner,id){if(owner.classId!==3)return;const pending=[id],seen=new Set();while(pending.length){const current=pending.pop();if(seen.has(current))continue;seen.add(current);for(const row of table('spell_learn_spell').filter(r=>r.entry===current)){if(teachingTargets(row.SpellID).length){if(!owner.learned.includes(row.SpellID))owner.learned.push(row.SpellID);pending.push(row.SpellID);}}}refreshHunterPetSkills(owner);}

export function initializeHunterPetSkills(s,owner,pet,saved){
 if(pet.kind!=='beast')return;
 if(Array.isArray(saved?.learned)){pet.learned=[...saved.learned];pet.teachSpells={...(saved.teachSpells||{})};}
 else{const source=table('petcreateinfo_spell').find(r=>r.entry===pet.entry),dbc=petReference.creatureSpellData?.[creatures[pet.entry]?.PetSpellDataId],sourceIds=dbc?dbc.map(id=>learnCache.get(id)||id):[1,2,3,4].map(i=>source?.['Spell'+i]).filter(Boolean);pet.learned=[];pet.teachSpells={};for(const id of sourceIds){const taught=teachingTargets(id),actual=taught.length?taught:[id];for(const skill of actual){if(!petIds.has(skill)||!familyAllows(pet,skill))continue;pet.learned.push(skill);if(taught.length&&!owner.learned.includes(id)){if(spells[skill].Attributes&64)owner.learned.push(id);else pet.teachSpells[skill]=id;}}}pet.trainingPoints=0-pet.learned.reduce((n,id)=>n+(petReference.training[id]||0),0);}
 pet.availableSkills=[...new Set([...(saved?.availableSkills||[]),...pet.learned])];refreshHunterPetSkills(owner);
}

/** Pet.cpp::CheckLearning: each actual skill use rolls integer 0..100 < 10. */
export function observeHunterPetSkill(s,owner,pet,id){const teaching=pet.teachSpells?.[id];if(!teaching||owner.classId!==3)return;if(Math.floor(rng(s)*101)>=10)return;if(!owner.learned.includes(teaching)){owner.learned.push(teaching);log(s,'通过宠物掌握了 '+spells[id].SpellName,'learn',{spellId:teaching});}delete pet.teachSpells[id];refreshHunterPetSkills(owner);}
