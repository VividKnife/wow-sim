import reference from '../../../game-data/data/professions-reference.json' with {type:'json'};
export const professionSkillIds={herbalism:182,mining:186,skinning:393,fishing:356,alchemy:171,blacksmithing:164,leatherworking:165,tailoring:197,engineering:202,enchanting:333,cooking:185,firstaid:129};
export const professions=[
 ['herbalism','采药','采集','在林地与农田采集草药'],['mining','采矿','采集','采集矿脉并熔炼金属'],['skinning','剥皮','采集','击杀野兽后自动剥皮'],['fishing','钓鱼','副职业','在湖岸与海岸收获鱼类'],
 ['alchemy','炼金术','制造','制造生命与法力药水'],['blacksmithing','锻造','制造','打造金属武器'],['leatherworking','制皮','制造','制作皮甲'],['tailoring','裁缝','制造','制作布甲与背包'],['engineering','工程学','制造','制作枪械与零件'],['enchanting','附魔','制造','分解装备并制造附魔羊皮纸'],['cooking','烹饪','副职业','烹制恢复食物'],['firstaid','急救','副职业','制作并使用绷带'],
].map(([id,name,kind,description])=>({id,name,kind,description,cost:reference.ranks[id][0].cost,skillId:professionSkillIds[id]}));
export const professionRanks=reference.ranks;
export const specializations=reference.specializations;
export const professionReference=reference.meta;
export const recipes=reference.recipes;
export const enchants=reference.enchants;
export const professionNames={...reference.names};
const statNames={health:'生命',mana:'法力',str:'力量',agi:'敏捷',sta:'耐力',int:'智力',spi:'精神',armor:'护甲',spellPower:'法术伤害',healing:'治疗效果',weaponDamage:'武器伤害',attackPower:'攻击强度',rangedAttackPower:'远程攻击强度',manaRegen:'每 5 秒法力',schoolPower4:'火焰法术伤害',schoolPower16:'冰霜法术伤害',schoolPower32:'暗影法术伤害',crit:'暴击',hit:'命中',dodge:'躲闪',defense:'防御技能',threat:'威胁'};
for(const e of Object.values(enchants)){const stats=Object.entries(e.stats).map(([k,v])=>`${statNames[k]||k} +${v}`).join(' · ');e.description=e.name+(stats?'：'+stats:'')+(e.effects.some(x=>x.type===1)||!stats?' · 特殊效果资料已收录，战斗效果待接入':'');}
export const scrolls=recipes.filter(r=>enchants[r.spell]).map(r=>({id:r.item,enchant:String(r.spell),name:'附魔羊皮纸：'+r.name}));
export const supplementalItems=scrolls.map(r=>({entry:r.id,name:r.name,enchant:r.enchant,class:0,subclass:0,Quality:2,RequiredLevel:0,ItemLevel:1,InventoryType:0,armor:0,stackable:20,MaxDurability:0,SellPrice:20,BuyPrice:80,BuyCount:1,bonding:0,maxcount:0}));
for(const r of scrolls)professionNames[r.id]=r.name;
export const potions=reference.potions;
export const bandages=reference.bandages;
export const disenchantLoot=Object.groupBy(reference.disenchant,r=>r.entry);
export const materialIds=new Set(recipes.flatMap(r=>r.materials.map(m=>m.id)).concat(reference.disenchant.map(r=>r.item)));
export const marketIds=[...new Set([...materialIds,...recipes.flatMap(r=>[r.item,...r.tools,...r.recipeItems]),...Object.keys(potions).map(Number),...Object.keys(bandages).map(Number),2318,2319,4234,4304,8170,4496,4498])];
export const priceOverrides={2447:35,765:35,2449:60,785:65,2450:70,3820:80,2770:25,2771:80,2840:35,3576:100,2841:80,2835:10,2318:50,2319:150,2589:40,2592:100,3371:5,10940:80,10938:180,118:90,858:200,929:400,2455:120,3385:240,1251:45,2581:90,6291:10,2996:95,2997:340,4238:850,4240:1300};
export const specializationKnown=(p,id)=>!id||p?.specialization===id||specializations.find(x=>x.id===p?.specialization)?.parent===id;
export function enchantFits(def,item,slot){return !!(def&&item&&def.slots.includes(slot)&&(def.class<0||def.class===item.class)&&(!def.subclassMask||def.subclassMask<0||def.subclassMask&(1<<item.subclass))&&(!def.inventoryMask||def.inventoryMask&(1<<item.InventoryType)));}
