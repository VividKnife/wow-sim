import {items,spells,nameOf,itemSets,raidItemAssets,classDefinitions,raceDefinitions,localize} from './catalog.js';

const schools=['物理','神圣','火焰','自然','冰霜','暗影','奥术'];
const statNames={0:'法力',1:'生命',3:'敏捷',4:'力量',5:'智力',6:'精神',7:'耐力'};
const skillNames={129:'急救',164:'锻造',165:'制皮',171:'炼金术',182:'草药学',185:'烹饪',186:'采矿',197:'裁缝',202:'工程学',333:'附魔',356:'钓鱼',393:'剥皮',762:'骑术'};
function effectText(spell){
 if(!spell)return '';
 const parts=[];
 for(let n=1;n<=3;n++){
  const aura=spell['EffectApplyAuraName'+n],value=(spell['EffectBasePoints'+n]||0)+1,misc=spell['EffectMiscValue'+n];
  if(aura===99)parts.push(`攻击强度提高 ${value} 点`);
  else if(aura===124&&!parts.some(p=>p.startsWith('攻击强度')))parts.push(`远程攻击强度提高 ${value} 点`);
  else if(aura===29)parts.push(`提高${misc<0?'所有属性':statNames[misc]||'属性'} ${value} 点`);
  else if(aura===13)parts.push(`提高${schools.filter((_,i)=>misc&(1<<i)).join('、')}伤害 ${value} 点`);
  else if(aura===135)parts.push(`治疗效果提高 ${value} 点`);
  else if(aura===8)parts.push(`每 ${(spell['EffectAmplitude'+n]||5000)/1000} 秒恢复 ${value} 点生命`);
  else if(aura===85)parts.push(`每 5 秒恢复 ${value} 点法力`);
  else if([49,51,52,54,55].includes(aura))parts.push(`${({49:'躲闪',51:'格挡',52:'武器暴击',54:'命中',55:'法术命中'})[aura]}几率提高 ${value}%`);
 }
 return [...new Set(parts)].join('；')||nameOf('spells',spell.Id);
}
export function itemDetails(id){
 const i=items[id];if(!i)return {};
 const set=itemSets[i.itemset];
 return {set:set?{...set,pieces:set.pieces.map(id=>({id,name:nameOf('items',id)}))}:null,itemLevel:i.ItemLevel,binding:({1:'拾取后绑定',2:'装备后绑定',3:'使用后绑定',4:'任务物品'})[i.bonding]||null,
  unique:i.maxcount>0?i.maxcount:0,flavor:localize('items',id)?.descriptionZhCN||(/[\u3400-\u9fff]/.test(i.description||'')?i.description:null),block:i.block||0,
  requiredSkill:i.RequiredSkill?{id:i.RequiredSkill,name:skillNames[i.RequiredSkill]||'对应专业技能',rank:i.RequiredSkillRank}:null,
  allowedClasses:i.AllowableClass>0?classDefinitions.filter(c=>i.AllowableClass&(1<<(c.id-1))).map(c=>c.name):[],
  allowedRaces:i.AllowableRace>0?raceDefinitions.filter(r=>i.AllowableRace&(1<<(r.id-1))).map(r=>r.name):[],
  resistances:['holy','fire','nature','frost','shadow','arcane'].flatMap((school,n)=>i[school+'_res']?[{name:schools[n+1],value:i[school+'_res']}]:[]),
  effects:[1,2,3,4,5].filter(n=>i['spellid_'+n]>0).map(n=>({id:i['spellid_'+n],trigger:({0:'使用',1:'装备',2:'击中时可能',4:'灵魂石',5:'学习'})[i['spelltrigger_'+n]]||'效果',text:raidItemAssets[id]?.effects?.[i['spellid_'+n]]||effectText(spells[i['spellid_'+n]])||nameOf('spells',i['spellid_'+n]),cooldown:Math.max(0,i['spellcooldown_'+n]),charges:Math.abs(i['spellcharges_'+n]||0)})),
  dps:i.delay>0?Math.round([1,2,3,4,5].reduce((total,n)=>total+(i['dmg_min'+n]+i['dmg_max'+n]||0)/2,0)/(i.delay/1000)*10)/10:0};
}
