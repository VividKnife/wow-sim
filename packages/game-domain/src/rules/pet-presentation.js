import {creatures,spells,nameOf,icon,xpTable} from './catalog.js';
import {spellInfo} from './character.js';
import {spellbookDetails} from './spellbook-details.js';
import {cooldownUntil} from './spell-timing.js';
import {petSkillRoot,petTrainingCost,petTrainingReason} from './pet-progression.js';

const families={1:'狼',2:'豹',3:'蜘蛛',4:'熊',5:'野猪',6:'鳄鱼',7:'食腐鸟',8:'螃蟹',9:'猩猩',11:'迅猛龙',12:'陆行鸟',20:'蝎子',21:'海龟',24:'蝙蝠',25:'土狼',26:'猫头鹰',27:'风蛇'};
export function petIdentity(pet){
 return {family:families[creatures[pet.entry]?.Family]||'野兽',xp:pet.xp||0,nextXp:pet.level<60?Math.floor((xpTable[pet.level]?.xp_for_next_level||0)/4):0};
}
export function petSkillsView(owner,pet){
 const best=new Map();
 for(const id of pet.learned||[]){const sp=spells[id],key=petSkillRoot(id);if(sp&&(!best.has(key)||sp.SpellLevel>spells[best.get(key)].SpellLevel))best.set(key,id);}
 return [...new Set([...(pet.availableSkills||[]),...(pet.learned||[])])].filter(id=>spells[id]&&!(spells[id].Attributes&128)).map(id=>{
  const sp=spellInfo(pet,id),passive=!!(sp.Attributes&64),learned=!!pet.learned?.includes(id);
  return {id,name:nameOf('spells',id),icon:icon('spells',id),rank:(sp.Rank1||'').replace(/^Rank (\d+)$/,'等级 $1'),level:sp.SpellLevel||0,passive,learned,
   currentRank:best.get(petSkillRoot(id))===id,autocast:!passive&&!pet.autocastDisabled?.includes(petSkillRoot(id)),
   focusCost:sp.PowerType===2?sp.mana:0,cooldownUntil:cooldownUntil(pet,sp),selfTarget:[1,2,3].some(n=>sp['EffectImplicitTargetA'+n]===1)&&![1,2,3].some(n=>sp['EffectImplicitTargetA'+n]===6),
   details:spellbookDetails(pet,sp),cost:Math.max(0,petTrainingCost(pet,id)),reason:learned?'':petTrainingReason(owner,pet,id)};
 });
}
