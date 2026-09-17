import {beginSpellTiming,finishSpellTiming,spellReady} from './spell-timing.js';
import {items,spells} from './catalog.js';
import {stats,spellInfo,takeItem,log,effectRange,knownRank} from './character.js';
import {combatMembers} from './combat-members.js';
import {talentModifiers} from './talent-effects.js';

export const recoveryMembers=s=>combatMembers(s).filter(c=>!c.escortNpc&&!c.petUnit);
export function stopRecovery(s){for(const c of [s,...s.party])c.rest=null;}
const resurrectionRoots={2:7328,5:2006,7:2008};
const resurrectionSpell=c=>{const first=resurrectionRoots[c.classId];return first&&knownRank(c,first)};
export function resurrectionFor(s,targetId){
 const members=[s,...s.party],target=members.find(c=>c.id===targetId),caster=members.find(c=>c!==target&&c.hp>0&&resurrectionSpell(c));if(!target||!caster)return null;
 const spell=resurrectionSpell(caster);return{caster,spell,info:spellInfo(caster,spell)};
}
export function beginResurrection(s,targetId){
 if(s.combat||!['idle','dead'].includes(s.activity.type))throw new Error('请先结束当前活动或战斗。');
 const target=[s,...s.party].find(c=>c.id===targetId),option=resurrectionFor(s,targetId);
 if(!target||target.hp>0)throw new Error('请选择已经倒下的成员。');if(!option)throw new Error('需要一名存活并学会复活法术的牧师、圣骑士或萨满祭司。');
 const {caster,spell,info:sp}=option;if(caster.mana<sp.mana)throw new Error('复活施法者法力不足，需要先休息恢复。');
 if(!spellReady(caster,sp,s.clock))throw new Error('复活法术尚未冷却。');caster.rest=null;const timing=beginSpellTiming(caster,sp,s.clock);
 s.activity={type:'resurrect',timing,caster:caster.id,target:target.id,spell,startedAt:s.clock,endsAt:s.clock+sp.castMs};
 caster.cast={spell,target:target.id,startedAt:s.clock,until:s.activity.endsAt,friendly:true};
 log(s,caster.name+' 正在复活 '+target.name,'cast',{actorId:caster.id,targetId:target.id,spellId:spell,duration:sp.castMs});
}
export function finishResurrection(s){
 const a=s.activity,caster=[s,...s.party].find(c=>c.id===a.caster),target=[s,...s.party].find(c=>c.id===a.target);
 if(caster)caster.cast=null;if(!caster||caster.hp<=0||!target||target.hp>0)return;
 if(!finishSpellTiming(caster,a.timing,s.clock))return;const sp=spellInfo(caster,a.spell),st=stats(target);target.hp=Math.min(st.maxHp,effectRange(caster,sp)[0]);target.mana=Math.min(st.maxMana,sp.EffectMiscValue1);target.cast=null;target.spiritRedemptionUsed=false;
 log(s,target.name+' 接受复活，重新站了起来。','info');
}
export function startRecovery(s){let needed=false;
 for(const c of recoveryMembers(s)){
  if(c.hp<=0)continue;if(c.rest){needed=true;continue;}
  const st=stats(c),foodNeeded=c.hp<st.maxHp*s.settings.health/100,waterNeeded=c.mana<st.maxMana*s.settings.mana/100;
  if(!foodNeeded&&!waterNeeded)continue;needed=true;
  const find=aura=>s.bag.find(i=>items[i.id]?.RequiredLevel<=c.level&&spells[items[i.id]?.spellid_1]?.EffectApplyAuraName1===aura);
  const food=foodNeeded&&s.settings.autoFood?find(84):null,water=waterNeeded&&s.settings.autoWater?find(85):null;
  // Keep the activity pending while passive regeneration restores missing resources.
  // Food and water accelerate recovery independently; neither is required.
  if(!food&&!water)continue;
  const fs=food&&spellInfo(c,items[food.id].spellid_1),ws=water&&spellInfo(c,items[water.id].spellid_1);
  const foodUntil=fs?s.clock+fs.durationMs:0,waterUntil=ws?s.clock+ws.durationMs:0;
  c.rest={until:Math.max(foodUntil,waterUntil),foodUntil,waterUntil,food:fs?fs.EffectBasePoints1+1:0,water:ws?ws.EffectBasePoints1+1:0,nextFood:s.clock+5000,foodPeriod:fs?.EffectAmplitude1||5000};
  if(food){takeItem(s,food.id,1);s.totals.food++;}if(water){takeItem(s,water.id,1);s.totals.water++;}
  log(s,c.name+' 坐下恢复生命与法力。','rest');
 }
 return needed;
}
export function healthRegen(c,sitting=false){
 // Pinned Unit::OCTRegenHPPerSpirit and Player::RegenerateHealth, 2s tick.
 const [factor,offset]={1:[1.26,-22.6],2:[.25,0],3:[.43,-5.5],4:[.84,-13],5:[.15,1.4],7:[.28,-3.6],8:[.11,1],9:[.12,1.5],11:[.11,1]}[c.classId]||[0,0];
 return Math.floor(Math.max(0,stats(c).spi*factor+offset)*2*(sitting?1.5:1)*((c.raceId||1)===8?1.1:1));
}
export function recoveryTick(s,regenTick){
 for(const c of recoveryMembers(s)){
  c.time=s.clock;if(c.hp<=0)continue;const st=stats(c);
  if(regenTick){
   if(!s.combat||(c.raceId||1)===8)c.hp=Math.min(st.maxHp,c.hp+Math.floor(healthRegen(c,!!c.rest)*(s.combat?.1:1)));
   if(st.maxMana){const [divisor,offset]={2:[5,15],3:[5,15],5:[4,12.5],7:[5,17],8:[4,12.5],9:[5,15],11:[5,15]}[c.classId]||[4,12.5],innervate=c.innervateUntil>s.clock,fullSpirit=(st.spi/divisor+offset)*(1+(talentModifiers(c).manaRegenPct||0))*(innervate?1+(spells[29166].EffectBasePoints2+1)/100:1),spirit=fullSpirit*(innervate||s.clock-c.lastManaUse>=5000?1:st.regenCasting||0),drink=!s.combat&&c.rest&&s.clock<=c.rest.waterUntil?c.rest.water*2/5:0;const enchantMana=(st.manaRegen||0)*2/5+(c.enchantManaRemainder||0);if(st.manaRegen)c.enchantManaRemainder=enchantMana-Math.floor(enchantMana);c.mana=Math.min(st.maxMana,c.mana+Math.floor(spirit+drink)+Math.floor(enchantMana));}
  }
  if(c.rest&&!s.combat&&s.clock>=c.rest.nextFood&&s.clock<=c.rest.foodUntil){c.hp=Math.min(st.maxHp,c.hp+c.rest.food);c.rest.nextFood+=c.rest.foodPeriod;}
  if(c.rest&&(s.clock>=c.rest.until||c.hp>=st.maxHp&&c.mana>=st.maxMana))c.rest=null;
 }
}
