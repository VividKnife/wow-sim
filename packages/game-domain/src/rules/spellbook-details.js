import {nameOf,spells} from './catalog.js';
import {effectRange,spellInfo} from './character.js';

const schools=['物理','神圣','火焰','自然','冰霜','暗影','奥术'];
const forms={1:'猎豹形态',2:'潜行',3:'旅行形态',4:'水栖形态',5:'熊形态',8:'巨熊形态',16:'幽魂之狼',17:'战斗姿态',18:'防御姿态',19:'狂暴姿态',31:'枭兽形态'};
const creatures=['野兽','龙类','恶魔','元素生物','巨人','亡灵','人型生物','小动物','机械'];
const maskNames=(mask,names)=>Object.entries(names).filter(([bit])=>(mask&2**(Number(bit)-1))!==0).map(([,name])=>name);
const seconds=ms=>`${Number((ms/1000).toFixed(2))} 秒`;

// Describe source effect amounts explicitly as base values, not predicted combat results.
export function spellbookDetails(c,sp,ancestors=[]){
 if(!sp||ancestors.includes(sp.Id)||ancestors.length>=8)return {facts:[],effects:[],restrictions:[]};
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
  const isAura=[6,27,35,65].includes(effect),misc=sp['EffectMiscValue'+n];
  const schoolNames=schools.filter((_,i)=>(misc&2**i)!==0).join(' / ')||school;
  if(effect===2)effects.push(sp.SpellName==='Bloodthirst'?`造成攻击强度 ${amount}% 的物理伤害`:`基础${school}伤害 ${amount}`);
  else if(effect===10)effects.push(`基础治疗 ${amount}`);
  else if([6,27,35,65].includes(effect)&&[3,8,89].includes(aura))effects.push(`每 ${seconds(interval)} ${aura===8?'恢复生命':'造成'+school+'伤害'} ${amount}（基础）`);
  else if([17,58,121].includes(effect))effects.push(`武器伤害，额外基础伤害 ${amount}`);
  else if(effect===31)effects.push(`武器伤害的 ${amount}%`);
  else if(effect===24&&sp['EffectItemType'+n]>0)effects.push(`制造 ${nameOf('items',sp['EffectItemType'+n])}`);
  else if(isAura&&aura===69)effects.push(`基础吸收伤害 ${amount}`);
  else if(isAura&&[31,33].includes(aura))effects.push(`移动速度变化 ${amount}%`);
  else if(isAura&&aura===29)effects.push(`${['力量','敏捷','耐力','智力','精神'][sp['EffectMiscValue'+n]]||'所有属性'}变化 ${amount}`);
  else if(isAura&&aura===22&&(sp['EffectMiscValue'+n]&1))effects.push(`护甲变化 ${amount}`);
  else if(isAura&&[7,12,5,4,27].includes(aura))effects.push(({7:'恐惧目标',12:'昏迷目标',5:'迷惑目标',4:'魅惑目标',27:'定身目标'})[aura]);
  else if(effect===68)effects.push('打断目标施法');
  else if(effect===67)effects.push('恢复目标全部生命值');
  else if(isAura&&aura===103)effects.push(`暂时降低仇恨 ${Math.abs(min)}，持续 ${seconds(sp.durationMs)}；结束后恢复仇恨`);
  else if(isAura&&[13,14,79,87].includes(aura))effects.push(`${schoolNames}${[14,87].includes(aura)?'承受':'造成'}伤害变化 ${amount}${[79,87].includes(aura)?'%':''}`);
  else if(isAura&&[99,124].includes(aura))effects.push(`${aura===124?'远程':'近战'}攻击强度变化 ${amount}`);
  else if(isAura&&[22,143].includes(aura))effects.push(`${schoolNames}抗性变化 ${amount}`);
  else if(isAura&&aura===10)effects.push(`产生的仇恨变化 ${amount}%`);
  else if(isAura&&[20,24,21].includes(aura))effects.push(`每 ${seconds(sp['EffectAmplitude'+n]||5000)} 恢复${aura===20?'生命':'法力'} ${amount}（基础）`);
  else if(isAura&&aura===15)effects.push(`受到攻击时反弹 ${amount} 点${school}伤害（基础）`);
  else if(isAura&&[49,47,51,52,54].includes(aura))effects.push(`${({49:'躲闪',47:'招架',51:'格挡',52:'近战暴击',54:'法术暴击'})[aura]}几率变化 ${amount}%`);
  else if(isAura&&aura===137)effects.push(`${['力量','敏捷','耐力','智力','精神'][misc]||'所有属性'}变化 ${amount}%`);
  else if(isAura&&[11,16,27,67].includes(aura))effects.push(({11:'强制目标攻击自己',16:'使目标无法施法',27:'使目标无法移动',67:'缴械目标'})[aura]);
  else if(isAura&&aura===36)effects.push(`切换为${forms[misc]||nameOf('spells',sp.Id)}`);
  else if(isAura&&aura===97)effects.push(`消耗法力吸收伤害，基础吸收量 ${amount}，每点伤害消耗 ${sp['EffectMultipleValue'+n]||2} 点法力`);
  else if(isAura&&[53,64].includes(aura))effects.push(`每 ${seconds(interval)} ${aura===53?'造成'+school+'伤害':'吸取目标法力'} ${amount}（基础）${aura===53?`，恢复所造成伤害的 ${(sp['EffectMultipleValue'+n]||1)*100}% 生命值`:''}`);
  else if(isAura&&aura===39)effects.push(`免疫${schoolNames}伤害`);
  else if(isAura&&aura===77)effects.push(`免疫${({1:'魅惑',2:'迷惑',3:'缴械',5:'恐惧',7:'定身',9:'沉默',10:'减速',11:'昏迷',14:'瘫痪',19:'变形',24:'恐惧',25:'无敌',26:'打断',27:'眩晕',30:'闷棍'})[misc]||'控制'}效果`);
  else if(isAura&&[17,19].includes(aura))effects.push(aura===17?`侦测潜行能力变化 ${amount}`:'能够侦测隐形目标');
  else if(isAura&&[98,156,101,138,140,155,134,110].includes(aura))effects.push(`${({98:'武器技能',156:'声望获取',101:'护甲',138:'近战攻击速度',140:'远程攻击速度',155:'水下呼吸时间',134:'法力恢复',110:'资源恢复'})[aura]}变化 ${amount}${aura===98?'':'%'}`);
  else if(isAura&&[82,104,105,106,66,120].includes(aura))effects.push(({82:'可以在水下呼吸',104:'可以在水面行走',105:'减缓下落速度',106:'悬浮在空中',66:'假死以摆脱敌人的攻击',120:'无法被追踪'})[aura]);
  else if(isAura&&aura===44)effects.push(`追踪${creatures.filter((_,i)=>(misc&2**i)!==0).join(' / ')}`);
  else if(isAura&&aura===91)effects.push(`目标警戒距离变化 ${amount} 码`);
  else if(isAura&&aura===68)effects.push(`攻击该目标时远程攻击强度增加 ${amount}`);
  else if(isAura&&aura===153)effects.push(`每次将目标受到的 ${amount} 点伤害转移给施法者`);
  else if(effect===113)effects.push(`复活目标，恢复 ${amount} 点生命值（基础）`);
  else if(effect===5)effects.push(sp.SpellName==='Astral Recall'?'返回绑定的旅店':`传送至${nameOf('spells',sp.Id).replace(/^传送[：:]/,'')}`);
  else if(effect===8)effects.push(`吸取目标 ${amount} 点法力`);
  else if(effect===62)effects.push(`燃烧目标 ${amount} 点法力，并造成被燃烧法力的 ${(sp['EffectMultipleValue'+n]||.5)*100}% 伤害`);
  else if(effect===30)effects.push(`恢复 ${amount} 点${({0:'法力',1:'怒气',3:'能量'})[misc]||'资源'}`);
  else if(effect===38)effects.push(`驱散最多 ${amount} 个${({1:'魔法',2:'诅咒',3:'疾病',4:'中毒'})[misc]||'异常'}效果`);
  else if(effect===63)effects.push(`目标对你的仇恨变化 ${amount}`);
  else if(effect===80)effects.push(`获得 ${amount} 个连击点`);
  else if(effect===96)effects.push('冲向目标');
  else if(effect===114)effects.push('嘲讽目标，使其转而攻击自己');
  else if([20,22,23,40,60,25,26].includes(effect))effects.push(({20:'允许躲闪攻击',22:'允许招架攻击',23:'允许用盾牌格挡攻击',40:'允许同时装备两把单手武器',60:`允许装备${nameOf('spells',sp.Id)}`,25:`学会${nameOf('spells',sp.Id)}武器技能`,26:'学会防御技能'})[effect]);
  if([64,77].includes(effect)||isAura&&[23,42,43].includes(aura)){
   let child=spells[sp['EffectTriggerSpell'+n]];
   // These reactive wrappers are resolved to the matching rank by combat runtime.
   if([28598,28376].includes(child?.Id))child=Object.values(spells).find(p=>p.SpellName===sp.SpellName&&p.Rank1===sp.Rank1&&p.Effect1===2);
   if(child){
    const resolved=spellInfo(c,child.Id),description=spellbookDetails(c,resolved,[...ancestors,sp.Id]).effects;
    const trigger=isAura&&aura===42?'受到非周期攻击时触发':isAura&&aura===23?`每 ${seconds(interval)} 触发`:'触发';
    effects.push(`${trigger}：${description.join('；')||nameOf('spells',child.Id)}${resolved.durationMs>0?`（效果持续 ${seconds(resolved.durationMs)}）`:''}${sp.ProcCharges>0?`，可触发 ${sp.ProcCharges} 次`:''}`);
   }
  }
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
