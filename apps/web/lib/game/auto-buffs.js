import {knownRank,spellInfo,stats,log} from './character.js';
import {startRecovery,recoveryMembers} from './recovery.js';

export const defaultAutoBuffs={enabled:false,armor:true,int:true,sta:true,targets:'party',refreshSeconds:30};
export function validateAutoBuffs(value){
 if(!value||['enabled','armor','int','sta'].some(k=>typeof value[k]!=='boolean')||!['self','party'].includes(value.targets)||!Number.isInteger(value.refreshSeconds)||value.refreshSeconds<0||value.refreshSeconds>300)throw new Error('自动增益设置无效');
 return {...defaultAutoBuffs,...value};
}
export const autoBuffsEnabled=s=>recoveryMembers(s).some(c=>c.autoBuffs?.enabled);
export function applyLongBuff(s,c,target,sp,kind){
 target.buffs??={};target.buffs[kind]={kind,amount:sp.EffectBasePoints1+1,spell:sp.Id,until:s.clock+sp.durationMs,caster:c.id};
 log(s,`${c.name} 为 ${target.name} 施放 ${sp.SpellName==='Power Word: Fortitude'?'真言术：韧':sp.SpellName==='Arcane Intellect'?'奥术智慧':'霜甲术'}`,'buff',{actorId:c.id,targetId:target.id,spellId:sp.Id});
}
// Only an authorized hunt/encounter calls this preparation step. One cast per step
// makes ownership deterministic and the resulting buff immediately visible.
export function prepareAutoBuffs(s){
 if(s.combat||s.hp<=0)return false;
 const members=recoveryMembers(s).filter(c=>c.hp>0);
 if(members.some(c=>c.cast||(c.autoBuffReadyAt||0)>s.clock))return true;
 const requests=[];
 for(const c of members){
  const settings={...defaultAutoBuffs,...c.autoBuffs};if(!settings.enabled)continue;
  for(const [kind,first,classId]of [['armor',168,8],['int',1459,8],['sta',1243,5]]){
   if(!settings[kind]||c.classId!==classId)continue;const id=knownRank(c,first),sp=id&&spellInfo(c,id);if(!sp)continue;
   const targets=kind==='armor'||settings.targets==='self'?[c]:members.filter(a=>kind!=='int'||stats(a).maxMana>0);
   for(const target of targets)requests.push({c,target,sp,kind,refresh:settings.refreshSeconds*1000});
  }
 }
 requests.sort((a,b)=>b.sp.SpellLevel-a.sp.SpellLevel||a.c.id.localeCompare(b.c.id));
 const assigned=new Set();
 for(const {c,target,sp,kind,refresh}of requests){
  const key=target.id+':'+kind;if(assigned.has(key))continue;assigned.add(key);
  const buff=target.buffs?.[kind],amount=sp.EffectBasePoints1+1;
  if(buff&&buff.until>s.clock&&buff.amount>amount||buff&&buff.amount>=amount&&buff.until>s.clock+refresh)continue;
  if(c.rest||(c.globalCooldown||0)>s.clock||(c.cooldowns[sp.Id]||0)>s.clock)return true;
  if(c.mana<sp.mana){
   if(sp.mana>stats(c).maxMana){s.activity={type:'idle',reason:c.name+' 的法力上限不足以补充增益。'};return true;}
   const previous=s.settings;s.settings={...previous,mana:100};try{startRecovery(s);}finally{s.settings=previous;}
   return true;
  }
  c.mana-=sp.mana;c.lastManaUse=s.clock;c.globalCooldown=s.clock+Math.max(1500,sp.castMs);c.autoBuffReadyAt=c.globalCooldown;c.cooldowns[sp.Id]=s.clock+sp.cooldownMs;
  applyLongBuff(s,c,target,sp,kind);return true;
 }
 return false;
}
