import {nameOf} from './catalog.js';
import {effectRange} from './character.js';

const schools=['物理','神圣','火焰','自然','冰霜','暗影','奥术'];
const forms={1:'猎豹形态',2:'潜行',3:'旅行形态',4:'水栖形态',5:'熊形态',8:'巨熊形态',16:'幽魂之狼',17:'战斗姿态',18:'防御姿态',19:'狂暴姿态',31:'枭兽形态'};
const creatures=['野兽','龙类','恶魔','元素生物','巨人','亡灵','人型生物','小动物','机械'];
const maskNames=(mask,names)=>Object.entries(names).filter(([bit])=>(mask&2**(Number(bit)-1))!==0).map(([,name])=>name);
const seconds=ms=>`${Number((ms/1000).toFixed(2))} 秒`;

// Describe source effect amounts explicitly as base values, not predicted combat results.
export function spellbookDetails(c,sp){
 if(!sp)return {facts:[],effects:[],restrictions:[]};
 const school=schools[sp.School]||'未知',facts=[`${school}系`,sp.range>0?`施法距离 ${sp.minRange>0?`${sp.minRange}—`:''}${sp.range} 码`:'施法距离：自身 / 近身'];
 facts.push(sp.cooldownMs>0?`冷却 ${seconds(sp.cooldownMs)}`:'无独立冷却');
 if(sp.StartRecoveryTime>0)facts.push(`公共冷却 ${seconds(sp.StartRecoveryTime)}`);
 if(sp.durationMs>0)facts.push(`持续 ${seconds(sp.durationMs)}`);
 if(sp.radius>0)facts.push(`作用半径 ${sp.radius} 码`);
 if(sp.MaxAffectedTargets>0)facts.push(`最多 ${sp.MaxAffectedTargets} 个目标`);
 const effects=[],restrictions=[];
 for(let n=1;n<=3;n++){
  const effect=sp['Effect'+n],aura=sp['EffectApplyAuraName'+n];
  if(!effect)continue;
  const [min,max]=effectRange(c,sp,n),amount=min===max?`${min}`:`${min}—${max}`;
  const interval=sp['EffectAmplitude'+n]||3000;
  if(effect===2)effects.push(sp.SpellName==='Bloodthirst'?`造成攻击强度 ${amount}% 的物理伤害`:`基础${school}伤害 ${amount}`);
  else if(effect===10)effects.push(`基础治疗 ${amount}`);
  else if([6,27,35,65].includes(effect)&&[3,8,89].includes(aura))effects.push(`每 ${seconds(interval)} ${aura===8?'恢复生命':'造成'+school+'伤害'} ${amount}（基础）`);
  else if([17,58,121].includes(effect))effects.push(`武器伤害，额外基础伤害 ${amount}`);
  else if(effect===31)effects.push(`武器伤害的 ${amount}%`);
  else if(effect===24&&sp['EffectItemType'+n]>0)effects.push(`制造 ${nameOf('items',sp['EffectItemType'+n])}`);
  else if(effect===6&&aura===69)effects.push(`基础吸收伤害 ${amount}`);
  else if(effect===6&&[31,33].includes(aura))effects.push(`移动速度变化 ${amount}%`);
  else if(effect===6&&aura===29)effects.push(`${['力量','敏捷','耐力','智力','精神'][sp['EffectMiscValue'+n]]||'所有属性'}变化 ${amount}`);
  else if(effect===6&&aura===22&&(sp['EffectMiscValue'+n]&1))effects.push(`护甲变化 ${amount}`);
  else if(effect===6&&[7,12,5,4,27].includes(aura))effects.push(({7:'恐惧目标',12:'昏迷目标',5:'迷惑目标',4:'魅惑目标',27:'定身目标'})[aura]);
  else if(effect===68)effects.push('打断目标施法');
  else if(effect===67)effects.push('恢复目标全部生命值');
  const combo=sp['EffectPointsPerComboPoint'+n];
  if(combo)effects.push(`每个连击点额外基础效果 ${combo}`);
 }
 const allowed=maskNames(sp.Stances||0,forms),excluded=maskNames(sp.StancesNot||0,forms);
 if(allowed.length)restrictions.push(`需要${allowed.join(' / ')}`);
 if(excluded.length)restrictions.push(`${excluded.join(' / ')}下不可使用`);
 if(sp.Attributes&0x20000)restrictions.push('需要潜行');
 if(sp.Attributes&0x10000000)restrictions.push('仅限非战斗状态');
 if(sp.AttributesEx&0x500000)restrictions.push('需要连击点数');
 const types=creatures.filter((_,i)=>((sp.TargetCreatureType||0)&2**i)!==0);
 if(types.length)restrictions.push(`目标类型：${types.join(' / ')}`);
 if(sp.MaxTargetLevel>0)restrictions.push(`目标等级不超过 ${sp.MaxTargetLevel}`);
 if(sp.EquippedItemClass===2)restrictions.push(sp.EquippedItemSubClassMask===32768?'需要装备匕首':'需要装备符合技能要求的武器');
 if(sp.EquippedItemClass===4&&(sp.EquippedItemSubClassMask&64))restrictions.push('需要装备盾牌');
 for(let n=1;n<=8;n++)if(sp['Reagent'+n]>0&&sp['ReagentCount'+n]>0)restrictions.push(`材料：${nameOf('items',sp['Reagent'+n])} ×${sp['ReagentCount'+n]}`);
 for(let n=1;n<=2;n++)if(sp['Totem'+n]>0)restrictions.push(`需要携带 ${nameOf('items',sp['Totem'+n])}`);
 return {facts,effects:[...new Set(effects)],restrictions:[...new Set(restrictions)]};
}
