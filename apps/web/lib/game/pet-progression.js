import petReference from '../../data/pet-family-reference.json' with {type:'json'};
import {spells,spellChain,creatures,classContentManifest,xpTable} from './catalog.js';
import {rng,log} from './character.js';

// CMaNGOS 8ec338a Pet.cpp:31–50, 731–910, 1087–1140; Pet.h:145,150.
// Defaults use rate 1. The source itself labels combat happiness loss a guess.
const maximum=[5500,11500,17000,23500,31000,39500],start=[2000,4500,7000,10000,13500,17500];
// Pet ranks are not all present in the SQL spell_chain subset. Their pinned
// Spell.dbc family/name/rank identity still groups upgrades of the same skill.
export const petSkillRoot=id=>spellChain[id]?.first_spell||`${spells[id]?.SpellFamilyName}:${spells[id]?.SpellName||id}`;
const root=petSkillRoot;
const xpRequired=owner=>Math.floor((xpTable[Math.min(59,owner.level)]?.xp_for_next_level||0)*.05);
const petSkills=new Map();for(const e of classContentManifest.entries.filter(e=>e.actor==='pet'&&e.classId===3)){const set=petSkills.get(e.spellId)||new Set();for(const source of e.sources)if(source.table==='SkillLineAbility.dbc')set.add(source.skillId);petSkills.set(e.spellId,set);}
export function initializePetProgression(s,owner,pet,saved={}){
 if(pet.kind!=='beast')return;
 pet.loyalty=saved.loyalty??pet.loyalty??1;pet.loyaltyPoints=saved.loyaltyPoints??pet.loyaltyPoints??1000;
 pet.loyaltyXpRemaining=saved.loyaltyXpRemaining??pet.loyaltyXpRemaining??(pet.loyalty===6?0:xpRequired(owner));
 pet.trainingPoints=saved.trainingPoints??pet.trainingPoints??0;pet.happiness=saved.happiness??pet.happiness??166500;
 pet.nextLoyaltyTick=s.clock+(saved.loyaltyTimerRemaining??12000);pet.nextHappinessTick=s.clock+(saved.happinessTimerRemaining??7500);
}
export function saveHunterPet(s,owner){const p=owner.pet;if(p?.kind!=='beast')return;owner.hunterPet={entry:p.entry,name:p.name,level:p.level,xp:p.xp||0,learned:[...(p.learned||[])],teachSpells:{...(p.teachSpells||{})},availableSkills:[...(p.availableSkills||[])],loyalty:p.loyalty,loyaltyPoints:p.loyaltyPoints,loyaltyXpRemaining:p.loyaltyXpRemaining,trainingPoints:p.trainingPoints,happiness:p.happiness,loyaltyTimerRemaining:Math.max(0,(p.nextLoyaltyTick??s.clock+12000)-s.clock),happinessTimerRemaining:Math.max(0,(p.nextHappinessTick??s.clock+7500)-s.clock)};}
function modifyLoyalty(s,owner,amount){
 const p=owner.pet;if(!p)return;const level=p.loyalty;
 if(level===6&&p.loyaltyPoints+amount>maximum[5])return;
 p.loyaltyPoints+=amount;
 if(p.loyaltyPoints<0){
  if(level>1){p.loyalty--;p.loyaltyPoints=start[p.loyalty-1];p.trainingPoints-=p.level;p.loyaltyXpRemaining=xpRequired(owner);}
  else{const action=Math.floor(rng(s)*3);if(action===0){owner.pet=null;owner.hunterPet=null;log(s,p.name+' 因忠诚度过低离开了你','pet');return;}p.mode=action===1?'aggressive':'stay';p.targetId=null;p.loyaltyPoints=500;}
 }else if(level<6&&p.loyaltyPoints>maximum[level-1]&&p.loyaltyXpRemaining<=0){p.loyalty++;p.loyaltyPoints=start[p.loyalty-1];p.trainingPoints+=p.level;p.loyaltyXpRemaining=p.loyalty===6?0:xpRequired(owner);log(s,p.name+' 的忠诚度提高至 '+p.loyalty,'pet');}
}
export function tickPetProgression(s,owner){
 const p=owner.pet;if(p?.kind!=='beast')return;
 if(p.loyaltyPoints==null||p.nextLoyaltyTick==null)initializePetProgression(s,owner,p,owner.hunterPet||{});
 if(p.hp<=0){p.nextLoyaltyTick=s.clock+12000;p.nextHappinessTick=s.clock+7500;return;}
 while(owner.pet===p&&Math.min(p.nextLoyaltyTick,p.nextHappinessTick)<=s.clock){
  if(p.nextHappinessTick<=p.nextLoyaltyTick){const loss=Math.trunc((140>>p.loyalty)*125*(s.combat?1.5:1));p.happiness=Math.max(0,p.happiness-loss);p.nextHappinessTick+=7500;}
  else{modifyLoyalty(s,owner,p.happiness>=666000?20:p.happiness>=333000?10:-20);p.nextLoyaltyTick+=12000;}
 }
 saveHunterPet(s,owner);
}
export function gainPetLoyaltyXp(s,owner,xp){const p=owner.pet;if(p?.kind!=='beast'||p.hp<=0||xp<=0)return;if(p.loyaltyPoints==null)initializePetProgression(s,owner,p,owner.hunterPet||{});p.loyaltyXpRemaining=Math.max(0,p.loyaltyXpRemaining-Math.floor(xp));modifyLoyalty(s,owner,Math.floor((100-p.level)/10)+(6-p.loyalty));saveHunterPet(s,owner);}
export const petHappinessMultiplier=p=>p.kind!=='beast'?1:(p.happiness??333000)<333000?.75:p.happiness>=666000?1.25:1;
export function petTrainingCost(pet,id){const base=petReference.training[id]||0;if(!base)return 0;return base-Math.max(0,...(pet.learned||[]).filter(old=>root(old)===root(id)).map(old=>petReference.training[old]||0));}
export function petTrainingReason(s,pet,id){
 const sp=spells[id];if(s.classId!==3||pet.kind!=='beast'||pet.hp<=0)return'需要存活的猎人宠物';if(!s.learned?.includes(5149))return'需要先学习野兽训练';if(s.combat)return'战斗中不能训练宠物';if(!['idle','hunt'].includes(s.activity?.type||'idle'))return'请先结束当前活动';
 if(!sp||!(pet.availableSkills||[]).includes(id)||sp.SpellLevel>pet.level)return'宠物尚未获得这个等级的训练';
 const lines=petReference.families[creatures[pet.entry]?.Family]?.skillLines||[],allowed=petSkills.get(id)||petSkills.get(spellChain[id]?.first_spell);if(!allowed||!lines.some(line=>allowed.has(line)))return'这个技能不属于宠物家族';
 if(!(sp.Attributes&64)){const active=new Set([root(id),...(pet.learned||[]).filter(old=>spells[old]&&!(spells[old].Attributes&64)).map(root)]);if(active.size>4)return'宠物最多掌握四个主动技能系列';}
 const cost=petTrainingCost(pet,id);if(cost<0)return'宠物已经掌握更高等级技能';if(cost>0&&(pet.trainingPoints||0)<cost)return'训练点不足';
 return'';
}
