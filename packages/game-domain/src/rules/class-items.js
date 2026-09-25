import {beginSpellTiming,cooldownUntil} from './spell-timing.js';
import {usableCount,consume} from './inventory.js';
import {talentSpellValue} from './talent-effects.js';
import {items,spells,classEnchantments,nameOf} from './catalog.js';
import {stats,spellInfo,effectRange,roll,log} from './character.js';
import {dispelClassEffects,applyClassWeaponEnchant} from './class-spell-effects.js';

function effectFor(s,id){
 const item=items[id],sp=item&&spellInfo(s,item.spellid_1);if(!sp)return null;
 if(/Healthstone/.test(item.name)&&sp.Effect1===10)return{kind:'health',sp};
 if(/^Mana (Agate|Jade|Citrine|Ruby)$/.test(item.name)&&sp.Effect1===30)return{kind:'mana',sp};
 if(/Soulstone/.test(item.name)&&sp.SpellName==='Soulstone Resurrection')return{kind:'soulstone',sp};
 if(/Spellstone/.test(item.name)&&sp.Effect1===38)return{kind:'spellstone',sp};
 if(sp.Effect1===54&&classEnchantments[sp.EffectMiscValue1])return{kind:'enchant',sp};
 return null;
}
export function classItemUse(s,instance,slot=16){
 const effect=effectFor(s,instance.id);if(!effect)return null;const item=items[instance.id];
 let reason=s.hp<=0?'角色已死亡':instance.locked?'物品已锁定':instance.issued?'无法使用借用物品':instance.ownerId&&instance.ownerId!==s.id?'物品属于其他角色':item.RequiredLevel>s.level?'等级不足':s.activity.type!=='idle'&&s.activity.type!=='hunt'?'请先结束当前活动':'';
 const remaining=Math.max(0,(s.itemCooldowns?.['item:'+item.entry]||0)-s.clock,(s.itemCooldowns?.['category:'+item.spellcategory_1]||0)-s.clock);
 if(!reason&&remaining)reason='物品尚未冷却';
 if(!reason&&effect.kind==='health'&&s.hp>=stats(s).maxHp)reason='生命已满';
 if(!reason&&effect.kind==='mana'&&s.mana>=stats(s).maxMana)reason='法力已满';
 if(!reason&&['soulstone','enchant'].includes(effect.kind)&&s.combat)reason='战斗中无法使用';
 if(!reason&&effect.kind==='enchant'&&s.equipment[slot]?.locked)reason='武器已锁定';
 if(!reason&&effect.kind==='enchant'&&(![16,17].includes(slot)||items[s.equipment[slot]?.id]?.class!==2))reason='需要装备近战武器';
 return{canUse:!reason,reason,remaining,label:effect.kind==='enchant'?'涂抹主手':effect.kind==='soulstone'?'绑定灵魂':'使用',description:effect.kind==='soulstone'?'死亡后可使用灵魂石原地复活':effect.kind==='spellstone'?'驱散魔法并获得法术吸收护盾':effect.kind==='enchant'?'为武器附加临时效果':`恢复${effectRange(s,effect.sp).join('—')}点${effect.kind==='mana'?'法力':'生命'}`};
}
export function useClassItem(s,instance,slot=16){
 const use=classItemUse(s,instance,slot);if(!use)return false;if(!use.canUse)throw new Error(use.reason);
 const item=items[instance.id],{kind,sp}=effectFor(s,instance.id);s.itemCooldowns??={};
 if(item.spellcooldown_1>0)s.itemCooldowns['item:'+item.entry]=s.clock+item.spellcooldown_1;
 if(item.spellcategory_1>0&&item.spellcategorycooldown_1>0)s.itemCooldowns['category:'+item.spellcategory_1]=s.clock+item.spellcategorycooldown_1;
 if(kind==='health'||kind==='mana'){const key=kind==='health'?'hp':'mana',max=kind==='health'?stats(s).maxHp:stats(s).maxMana;s[key]=Math.min(max,s[key]+roll(s,...effectRange(s,sp)));}
 if(kind==='soulstone')s.soulstone={spell:sp.Id,until:s.clock+(sp.durationMs||1800000)};
 if(kind==='spellstone'){dispelClassEffects(s,[1]);const n=[1,2,3].find(n=>sp['EffectApplyAuraName'+n]===69);if(n)s.absorb={spell:sp.Id,amount:effectRange(s,sp,n)[0],schoolMask:sp['EffectMiscValue'+n],until:s.clock+sp.durationMs};}
 if(kind==='enchant')applyClassWeaponEnchant(s,s,sp,slot);
 instance.count--;if(!instance.count)s.bag=s.bag.filter(i=>i.uid!==instance.uid);log(s,'使用 '+nameOf('items',item.entry),'buff');return true;
}
export function soulstoneRevive(s){
 if(s.hp>0)throw new Error('角色尚未死亡');if(s.combat)throw new Error('请等待当前战斗结束');const stone=s.soulstone;if(!stone||stone.until<=s.clock)throw new Error('没有可用的灵魂石');
 const resurrection={20707:3026,20762:20758,20763:20759,20764:20760,20765:20761};
 const raw=spells[resurrection[stone.spell]];if(!raw)throw new Error('缺少灵魂石复活数据');
 const st=stats(s);s.hp=Math.min(st.maxHp,Math.max(1,Math.abs(raw.EffectBasePoints1+1)));s.mana=Math.min(st.maxMana,Math.max(0,raw.EffectMiscValue1));s.soulstone=null;s.spiritRedemptionUsed=false;s.activity={type:'idle'};s.cast=null;log(s,'灵魂石复活','info');
}

export function reincarnationUse(s){const sp=spellInfo(s,21169);const reason=s.hp>0?'角色尚未死亡':s.combat?'请等待当前战斗结束':s.classId!==7||!s.learned.includes(20608)?'尚未学习复生':cooldownUntil(s,sp)>s.clock?'复生尚未冷却':usableCount(s,17030)<1?'需要未锁定的十字章':'';return{canUse:!reason,reason,remaining:Math.max(0,cooldownUntil(s,sp)-s.clock),cooldown:sp.cooldownMs};}
export function reincarnate(s){const use=reincarnationUse(s);if(!use.canUse)throw new Error(use.reason);const sp=spellInfo(s,21169),fraction=talentSpellValue(s,sp,3,sp.EffectBasePoints1+1)/100,st=stats(s);consume(s,17030,1);s.hp=Math.max(1,Math.floor(st.maxHp*fraction));s.mana=Math.floor(st.maxMana*fraction);beginSpellTiming(s,{...sp,castMs:0},s.clock,{cost:0});s.activity={type:'idle'};s.cast=null;s.spiritRedemptionUsed=false;log(s,'使用复生重新站起','info');}
