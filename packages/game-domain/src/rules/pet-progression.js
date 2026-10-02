import petReference from '../../../game-data/data/pet-family-reference.json' with {type:'json'};
import {spells,spellChain,creatures,classContentManifest} from './catalog.js';

export const MAX_PET_LOYALTY=6;
export const MAX_PET_HAPPINESS=1000000;
const MAX_LOYALTY_POINTS=39500;

// Pet ranks are not all present in the SQL spell_chain subset. Their pinned
// Spell.dbc family/name/rank identity still groups upgrades of the same skill.
export const petSkillRoot=id=>spellChain[id]?.first_spell||`${spells[id]?.SpellFamilyName}:${spells[id]?.SpellName||id}`;
const root=petSkillRoot;
const petSkills=new Map();for(const e of classContentManifest.entries.filter(e=>e.actor==='pet'&&e.classId===3)){const set=petSkills.get(e.spellId)||new Set();for(const source of e.sources)if(source.table==='SkillLineAbility.dbc')set.add(source.skillId);petSkills.set(e.spellId,set);}

export function keepHunterPetContent(pet){
 if(!pet?.entry||pet.kind&&pet.kind!=='beast')return false;
 const loyalty=Math.max(1,Math.min(MAX_PET_LOYALTY,pet.loyalty??MAX_PET_LOYALTY));
 const changed=pet.loyalty!==MAX_PET_LOYALTY||pet.happiness!==MAX_PET_HAPPINESS||pet.loyaltyPoints!==MAX_LOYALTY_POINTS||pet.loyaltyXpRemaining!==0||pet.trainingPoints==null;
 pet.trainingPoints=(pet.trainingPoints??pet.level*(loyalty-1))+(MAX_PET_LOYALTY-loyalty)*pet.level;
 pet.loyalty=MAX_PET_LOYALTY;
 pet.loyaltyPoints=MAX_LOYALTY_POINTS;
 pet.loyaltyXpRemaining=0;
 pet.happiness=MAX_PET_HAPPINESS;
 delete pet.nextLoyaltyTick;
 delete pet.nextHappinessTick;
 return changed;
}

export function initializePetProgression(_s,_owner,pet,saved={}){
 if(pet.kind!=='beast')return;
 pet.loyalty=saved.loyalty??pet.loyalty??MAX_PET_LOYALTY;
 pet.trainingPoints=saved.trainingPoints??pet.level*(pet.loyalty-1);
 pet.happiness=saved.happiness??pet.happiness??MAX_PET_HAPPINESS;
 keepHunterPetContent(pet);
}

export function saveHunterPet(_s,owner){
 const p=owner.pet;if(p?.kind!=='beast')return;
 keepHunterPetContent(p);
 owner.hunterPet={entry:p.entry,name:p.name,level:p.level,xp:p.xp||0,learned:[...(p.learned||[])],teachSpells:{...(p.teachSpells||{})},availableSkills:[...(p.availableSkills||[])],loyalty:p.loyalty,loyaltyPoints:p.loyaltyPoints,loyaltyXpRemaining:0,trainingPoints:p.trainingPoints,happiness:p.happiness};
}

export function tickPetProgression(s,owner){
 const changed=keepHunterPetContent(owner.pet);
 keepHunterPetContent(owner.hunterPet);
 for(const stored of owner.stablePets||[])keepHunterPetContent(stored);
 if(changed)saveHunterPet(s,owner);
}
export function petFoodBenefit(pet,item){
 if(pet?.kind!=='beast'||!item?.FoodType)return 0;
 const mask=petReference.families[creatures[pet.entry]?.Family]?.petFoodMask||0;
 if(!(mask&(1<<(item.FoodType-1))))return 0;
 const gap=pet.level-(item.ItemLevel||0);
 return gap<=5?35000:gap<=10?17000:gap<=14?8000:0;
}
export const petHappinessMultiplier=pet=>pet.kind==='beast'?1.25:1;
export function petTrainingCost(pet,id){const base=petReference.training[id]||0;if(!base)return 0;return base-Math.max(0,...(pet.learned||[]).filter(old=>root(old)===root(id)).map(old=>petReference.training[old]||0));}
export function petTrainingReason(s,pet,id){
 const sp=spells[id];if(s.classId!==3||pet.kind!=='beast'||pet.hp<=0)return'需要存活的猎人宠物';if(!s.learned?.includes(5149))return'需要先学习野兽训练';if(s.combat)return'战斗中不能训练宠物';if(!['idle','hunt'].includes(s.activity?.type||'idle'))return'请先结束当前活动';
 if(!sp||!(pet.availableSkills||[]).includes(id)||sp.SpellLevel>pet.level)return'宠物尚未获得这个等级的训练';
 const lines=petReference.families[creatures[pet.entry]?.Family]?.skillLines||[],allowed=petSkills.get(id)||petSkills.get(spellChain[id]?.first_spell);if(!allowed||!lines.some(line=>allowed.has(line)))return'这个技能不属于宠物家族';
 if(!(sp.Attributes&64)){const active=new Set([root(id),...(pet.learned||[]).filter(old=>spells[old]&&!(spells[old].Attributes&64)).map(root)]);if(active.size>4)return'宠物最多掌握四个主动技能系列';}
 const cost=petTrainingCost(pet,id);if(cost<0)return'宠物已经掌握更高等级技能';if(cost>0&&(pet.trainingPoints||0)<cost)return'训练点不足';
 return'';
}
