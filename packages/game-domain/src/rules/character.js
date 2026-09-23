import {partyUnlocked} from './party-unlock.js';
import {recordJourneyLog} from './journey.js';
import {agilityChances,intellectCrit,baseAttackPower} from '../../../sim-core/src/class-stats.js';
import {racialModifiers} from './racial-effects.js';
import {table,items,spells,spellChain,xpTable,talents,classAbilities,classDefinitions,classStartingItems,lookup,creatures,nameOf} from './catalog.js';
import {armorWithAuras} from '../../../sim-core/src/combat-auras.js';
import {enchants,professionSkillIds,specializationKnown} from './profession-data.js';
import {talentModifiers,talentCombatDefense,modifySpell} from './talent-effects.js';
export const clone=x=>JSON.parse(JSON.stringify(x));
export const LEVEL_CAP=60;
// Content tables are immutable during play. Index their first matching rows once;
// dynamic equipment, buffs and talents are still evaluated on every stats call.
const statTables=new Map();
function statRow(name,fields,values){
 let rows=statTables.get(name);
 if(!rows){
  rows=new Map();
  for(const row of table(name)){const key=fields.map(field=>row[field]).join(':');if(!rows.has(key))rows.set(key,row);}
  statTables.set(name,rows);
 }
 return rows.get(values.join(':'));
}
const itemStatMetadata=new WeakMap();
function itemStats(item){
 let metadata=itemStatMetadata.get(item);
 if(!metadata){
  const attributes=[],auras=[];
  for(let n=1;n<=10;n++){const key={3:'agi',4:'str',5:'int',6:'spi',7:'sta'}[item['stat_type'+n]];if(key)attributes.push([key,item['stat_value'+n]]);}
  for(let n=1;n<=5;n++){
   const aura=spells[item['spellid_'+n]];if(item['spelltrigger_'+n]!==1||!aura)continue;
   for(let j=1;j<=3;j++)auras.push({type:aura['EffectApplyAuraName'+j],misc:aura['EffectMiscValue'+j],amount:aura['EffectBasePoints'+j]+1});
  }
  metadata={attributes,auras};itemStatMetadata.set(item,metadata);
 }
 return metadata;
}
export function rng(s){let x=s.rngState>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rngState=x>>>0;return s.rngState/4294967296;}
export const roll=(s,min,max)=>Math.floor(min+rng(s)*(max-min+1));
export function log(s,text,kind='info',detail={}){s.logs.push({id:++s.logSequence,encounterId:s.combat?.id??null,at:s.clock,text,kind,...detail});if(s.logs.length>140)s.logs.shift();recordJourneyLog(s,s.logs.at(-1));}
export const slotOf=i=>({20:5,17:16,13:16,21:16,22:17,23:17,14:17,15:18,25:18,26:18,16:15,12:13,28:18})[i.InventoryType]||i.InventoryType;
const weaponProficiency={0:196,1:197,2:264,3:266,4:198,5:199,6:200,7:201,8:202,10:227,13:15590,15:1180,16:2567,18:5011,19:5009};
export function canEquip(c,i){
 if(!i||i.RequiredLevel>c.level)return false;
 if(i.AllowableClass&&i.AllowableClass!==-1&&!(i.AllowableClass&(1<<(c.classId-1))))return false;
 if(i.AllowableRace&&i.AllowableRace!==-1&&!(i.AllowableRace&(1<<((c.raceId||1)-1))))return false;
 const profession=Object.keys(professionSkillIds).find(k=>professionSkillIds[k]===i.RequiredSkill);
 if(i.RequiredSkill&&(c.professions?.[profession]?.skill||0)+(c.professions?.[profession]?racialModifiers(c).professionSkill[i.RequiredSkill]||0:0)<i.RequiredSkillRank)return false;
 if(i.requiredspell&&!Object.values(c.professions||{}).some(p=>specializationKnown(p,i.requiredspell))&&!c.learned?.includes(i.requiredspell))return false;
 if(i.InventoryType===4)return true;
 if(i.class===4){const armor={1:c.level>=40&&c.learned?.includes(750)?4:3,2:c.level>=40&&c.learned?.includes(750)?4:3,3:c.level>=40&&c.learned?.includes(8737)?3:2,4:2,5:1,7:c.level>=40&&c.learned?.includes(8737)?3:2,8:1,9:1,11:2}[c.classId]||1;
  return i.subclass<=armor||i.subclass===6&&[1,2,7].includes(c.classId)||i.InventoryType===28&&({2:7,7:9,11:8})[c.classId]===i.subclass;
 }
 if(i.class!==2)return false;
 if(weaponProficiency[i.subclass]&&!c.learned?.includes(weaponProficiency[i.subclass]))return false;
 const weapons={1:[0,1,2,3,4,5,6,7,8,10,13,15,16,18],2:[0,1,4,5,6,7,8],3:[0,1,2,3,6,7,8,10,13,15,16,18],4:[0,2,3,4,7,13,15,16,18],5:[4,10,15,19],7:[0,4,10,13,15,...(c.learned?.includes(16269)?[1,5]:[])],8:[7,10,15,19],9:[7,10,15,19],11:[4,5,10,13,15]};
 return(weapons[c.classId]||[]).includes(i.subclass);
}
export function talentRank(c,name){const t=Object.values(talents).find(t=>t.name===name&&(!t.classId||t.classId===c.classId));return t?c.talents?.[t.id]||0:0;}
function resistances(c){
 const result={...talentCombatDefense(c).resistances},auras=(c.auras||[]).filter(a=>a.until>(c.time||0));
 for(let school=1;school<=6;school++){
  const field=['','holy_res','fire_res','nature_res','frost_res','shadow_res','arcane_res'][school];
  let base=0,value=result[school]||0;
  for(const e of Object.values(c.equipment||{})){const i=items[e.id];if(i&&!(e.durability===0&&i.MaxDurability))base+=i[field]||0;}
  const relevant=auras.filter(a=>a.misc&(1<<school)),exclusive=relevant.filter(a=>a.type===143).map(a=>a.amount);
  for(const a of relevant)if(a.type===83)base+=a.amount;
  for(const a of relevant)if(a.type===142)base*=1+a.amount/100;
  value+=base;
  value+=Math.max(0,...exclusive)+Math.min(0,...exclusive);
  for(const a of relevant)if(a.type===22)value+=a.amount;
  for(const a of relevant)if(a.type===101)value*=1+a.amount/100;
  result[school]=Math.max(0,Math.floor(value));
 }
 return result;
}
function petPassiveAuras(c){
 const selected=new Map();
 for(const id of c.learned||[]){const sp=spells[id];if(!sp||(sp.Attributes&64)===0)continue;const key=sp.Rank1?`${sp.SpellFamilyName}:${sp.SpellName}`:sp.Id,rank=Number(sp.Rank1?.match(/\d+/)?.[0]||0),old=selected.get(key);if(!old||rank>old.rank)selected.set(key,{sp,rank});}
 return [...selected.values()].flatMap(({sp})=>[1,2,3].filter(n=>sp['Effect'+n]===6).map(n=>({spell:sp.Id,effect:n,type:sp['EffectApplyAuraName'+n],misc:sp['EffectMiscValue'+n],amount:sp['EffectBasePoints'+n]+1,until:Infinity})));
}
function petStats(c){
 const source=statRow('pet_levelstats',['creature_entry','level'],[c.kind==='beast'?1:c.entry,c.level])||c.petStatBase||{hp:c.maxHp||0,mana:c.maxMana||0,armor:c.armor||0};
 const result={str:source.str||0,agi:source.agi||0,sta:source.sta||0,int:source.inte||0,spi:source.spi||0,armor:source.armor||0,maxHp:0,maxMana:0,baseMana:0,attackPower:0,rangedAttackPower:0,crit:.05,spellCrit:0,dodge:0,parry:0,hit:0,spellHit:0,spellPower:0,healing:0,regenCasting:0};
 const auras=[...petPassiveAuras(c),...(c.auras||[]).filter(a=>a.until>(c.time||0))],mod=c.ownerPetModifiers||{};let health=0,mana=0,healthPct=1,manaPct=1;
 for(const a of auras){if(a.type===29)for(const [i,key]of ['str','agi','sta','int','spi'].entries())if(a.misc===-1||a.misc===i)result[key]+=a.amount;if(a.type===34)health+=a.amount;if(a.type===35&&a.misc===0)mana+=a.amount;if(a.type===133)healthPct*=1+a.amount/100;if(a.type===132)manaPct*=1+a.amount/100;}
 for(const a of auras)if(a.type===137)for(const [i,key]of ['str','agi','sta','int','spi'].entries())if(a.misc===-1||a.misc===i)result[key]*=1+a.amount/100;
 const stamina=result.sta-(source.sta||0),intellect=result.int-(source.inte||0);
 // Pinned Pet::UpdateMaxHealth uses bonus stamina, with the first 20 worth 1 HP.
 result.maxHp=Math.max(1,Math.floor(((source.hp||0)+health+Math.min(20,stamina)+Math.max(0,stamina-20)*10)*healthPct*(mod.health||1)));
 result.maxMana=c.kind==='beast'?0:Math.max(0,Math.floor(((source.mana||0)+mana+Math.max(0,(intellect-20)*15+20))*manaPct*(mod.mana||1)));
 for(const a of auras)if(a.type===142&&(a.misc&1))result.armor*=1+a.amount/100;
 const view={...c,auras};result.armor=armorWithAuras(view,result.armor,c.time||0)*(mod.armor||1);result.resistances=resistances(view);return result;
}
export function refreshPetStats(owner,pet,{heal=false}={}){
 if(!pet?.petUnit||!pet.kind)return;
 pet.petStatBase??={hp:pet.maxHp||0,mana:pet.maxMana||0,armor:pet.armor||0};
 const mods=talentModifiers(owner);pet.ownerPetModifiers={health:1+(mods.petHealthPct||0),armor:1+(mods.petArmorPct||0),mana:1+(mods.petManaPct||0)};
 const computed=petStats(pet);pet.maxHp=computed.maxHp;pet.maxMana=computed.maxMana;pet.armor=petStats({...pet,auras:[]}).armor;
 pet.hp=heal?pet.maxHp:Math.max(0,Math.min(pet.hp||0,pet.maxHp));pet.mana=heal?pet.maxMana:Math.max(0,Math.min(pet.mana||0,pet.maxMana));
}
export function stats(c){
 if(c.petUnit&&c.kind)return petStats(c);
 if(c.escortNpc||c.petUnit)return{str:0,agi:0,sta:0,int:0,spi:0,armor:armorWithAuras(c,c.armor||0,c.time||0),maxHp:c.maxHp||0,maxMana:c.maxMana||0,baseMana:0,attackPower:0,rangedAttackPower:0,crit:.05,spellCrit:0,dodge:0,parry:0,hit:0,spellHit:0,spellPower:0,healing:0,resistances:resistances(c),regenCasting:0};
 const base=statRow('player_levelstats',['race','class','level'],[c.raceId||1,c.classId,Math.min(LEVEL_CAP,c.level)]);
 const classBase=statRow('player_classlevelstats',['class','level'],[c.classId,Math.min(LEVEL_CAP,c.level)]);
 if(!base||!classBase)throw new Error('缺少角色等级属性数据');
 const result={str:base.str,agi:base.agi,sta:base.sta,int:base.inte,spi:base.spi,armor:base.agi*2,maxHp:0,maxMana:0,spellPower:0,healing:0,weaponDamage:0,manaRegen:0,threat:0,schoolPower4:0,schoolPower16:0,schoolPower32:0};
 let gearArmor=0;const equipmentAuras=[];
 for(const e of Object.values(c.equipment||{})){
  const i=items[e.id];if(!i||e.durability===0&&i.MaxDurability)continue;
  result.armor+=i.armor;gearArmor+=i.armor||0;
  const metadata=itemStats(i);
  for(const [key,value]of metadata.attributes)result[key]+=value;
  equipmentAuras.push(...metadata.auras);
 }
 let enchantHealth=0,enchantMana=0,enchantDodge=0;
 for(const e of Object.values(c.equipment||{})){if(e.durability===0&&items[e.id]?.MaxDurability)continue;for(const [key,value]of Object.entries(enchants[e.enchant]?.stats||{})){if(key==='health')enchantHealth+=value;else if(key==='mana')enchantMana+=value;else if(key==='dodge')enchantDodge+=value/100;else if(key in result)result[key]+=value;}}
 for(const a of Object.values(c.buffs||{})){if(a.until<=c.time)continue;if(a.kind==='int')result.int+=a.amount;if(a.kind==='armor')result.armor+=a.amount;if(a.kind==='sta')result.sta+=a.amount;}
 for(const buff of c.itemBuffs||[]){if(buff.until<=(c.time||0))continue;for(const [key,value]of Object.entries(buff.stats)){if(key==='health')enchantHealth+=value;else if(key in result)result[key]+=value;}}
 let attackPowerFlat=0,rangedAttackPowerFlat=0;
 for(const buff of c.classBuffs||[]){if(buff.until<=(c.time||0))continue;for(const [key,value]of Object.entries(buff.stats||{})){if(key==='attackPower')attackPowerFlat+=value;else if(key==='rangedAttackPower')rangedAttackPowerFlat+=value;else if(key in result)result[key]+=value;}if(buff.armorPct)result.armor*=1+buff.armorPct;}
 const mods=talentModifiers(c);
 const liveAuras=(c.auras||[]).filter(a=>a.until>(c.time||0));
 attackPowerFlat+=liveAuras.filter(a=>a.type===99).reduce((n,a)=>n+a.amount,0);
 for(const a of liveAuras)if(a.type===29&&!(c.classBuffs||[]).some(b=>b.spell===a.spell&&b.until>(c.time||0)))for(const [index,key]of ['str','agi','sta','int','spi'].entries())if(a.misc===-1||a.misc===index)result[key]+=a.amount;
 result.resistances=resistances(c);result.regenCasting=Math.min(1,(mods.regenCasting||0)+liveAuras.filter(a=>a.type===134).reduce((n,a)=>n+a.amount/100,0));
 for(const a of c.auras||[]){if(a.until<=(c.time||0))continue;if(a.type===137)for(const [index,key]of ['str','agi','sta','int','spi'].entries())if(a.misc===-1||a.misc===index)result[key]*=1+a.amount/100;}

 for(const key of ['str','agi','sta','int','spi'])result[key]=Math.floor(result[key]*(1+(mods[key+'Pct']||0)));
 result.armor+=(result.agi-base.agi)*2;
 result.armor+=gearArmor*(mods.itemArmorPct||0);
 result.maxHp=classBase.basehp+Math.min(20,result.sta)+Math.max(0,result.sta-20)*10;
 result.maxMana=classBase.basemana?classBase.basemana+Math.min(20,result.int)+Math.max(0,result.int-20)*15:0;
 result.maxMana=Math.floor(result.maxMana*(1+(mods.manaPct||0)));
 result.maxHp=Math.floor(result.maxHp*(1+(mods.healthPct||0)));
 result.maxHp+=enchantHealth;if(result.maxMana)result.maxMana+=enchantMana;
 const agility=agilityChances(c.classId,c.level,result.agi);result.baseMana=classBase.basemana;result.crit=agility.crit+(mods.crit||0);result.dodge=agility.dodge+(mods.dodge||0)+enchantDodge;result.parry=(mods.parry||0)+(c.learned?.some(id=>[3127,18848].includes(id))?.05:0);result.hit=mods.hit||0;result.spellHit=mods.spellHit||0;
 const statAuras=[...equipmentAuras,...liveAuras];
 for(const a of statAuras){
  if(a.type===13){if((a.misc&126)===126)result.spellPower+=a.amount;else for(let school=1;school<=6;school++)if(a.misc&(1<<school))result['schoolPower'+(1<<school)]=(result['schoolPower'+(1<<school)]||0)+a.amount;}
  if(a.type===135)result.healing+=a.amount;
  if(a.type===52)result.crit+=a.amount/100;
  if(a.type===54)result.hit+=a.amount/100;
  if(a.type===55)result.spellHit+=a.amount/100;
 }
 const skillBonus=skill=>statAuras.filter(a=>[30,98].includes(a.type)&&a.misc===skill).reduce((n,a)=>n+a.amount,0);
 const skillIds={0:44,1:172,2:45,3:46,4:54,5:160,6:229,7:43,8:55,10:136,13:473,15:173,16:176,18:226,19:228};
 const skillAt=slot=>{const subclass=items[c.equipment?.[slot]?.id]?.subclass;return c.level*5+(mods.weaponSkill||0)+(racialModifiers(c).weaponSkillBySubclass[subclass]||0)+skillBonus(skillIds[subclass]);};
 result.maxEnergy=100+(mods.energyFlat||0);result.maxRage=1000;result.block=(mods.block||0)+(c.learned?.includes(107)?.05:0);result.blockValuePct=mods.blockValuePct||0;result.defense=c.level*5+(mods.defense||0)+skillBonus(95);result.weaponSkill=skillAt(16);result.offhandWeaponSkill=skillAt(17);result.rangedWeaponSkill=skillAt(18);result.rangedCrit=result.crit+(mods.rangedCrit||0);
 result.spellPower+=result.spi*(mods.spellPowerFromSpiritPct||0);result.healing+=result.spi*(mods.healingFromSpiritPct||0);result.armor+=result.int*(mods.armorFromIntPct||0);
 result.spellCrit=intellectCrit(c.classId,c.level,result.int)+(mods.spellCrit||0)+statAuras.filter(a=>a.type===57).reduce((n,a)=>n+a.amount/100,0);
 const power=baseAttackPower(c.classId,c.level,result.str,result.agi,c.form);
 result.attackPower=Math.max(0,(power.attackPower+attackPowerFlat+(mods.attackPowerFlat||0))*(1+(mods.attackPowerPct||0)));
 result.rangedAttackPower=Math.max(0,(power.rangedAttackPower+rangedAttackPowerFlat)*(1+(mods.rangedAttackPowerPct||0)));
 const formArmor=c.form==='bear'?((c.classBuffs||[]).some(b=>b.name==='Dire Bear Form'&&b.until>(c.time||0))?4.6:2.8):c.form==='moonkin'?4.6:1;
 result.armor=armorWithAuras(c,(result.armor+gearArmor*(1+(mods.itemArmorPct||0))*(formArmor-1))*(1+(mods.armorPct||0)),c.time||0);
 return result;
}
export function newCharacter(name,classId=8,level=1,raceId=1,gender='male'){const def=classDefinitions.find(c=>c.id===classId),learned=(classAbilities[classId]||[]).filter(a=>a.startingSpell&&(!a.startingRaces||a.startingRaces.includes(raceId))).map(a=>a.spellId);return{id:'player',name,classId,raceId,gender,pvpProfile:null,strategyProfiles:[],power:def?.power||'mana',level,xp:0,equipment:{},talents:{},talentResetCount:0,learned:[...new Set(learned)],cooldowns:{},buffs:{},hp:0,mana:0,rage:0,energy:100,time:0,lastManaUse:-5000,...(classId===3?{ammunition:{},ammoPolicy:{enabled:false,target:400}}:{})};}
export function makeItem(s,id,count=1){const i=items[id];if(!i)throw new Error('物品数据缺失：'+id);return{uid:'i'+(++s.itemSequence),id,count,durability:i.MaxDurability,bound:!!(i.bonding===1||i.bonding===4)};}
export function equipStarter(s){
 for(const row of classStartingItems[`${s.raceId||1}:${s.classId}`]||[]){
  const i=items[row.itemId],item=makeItem(s,row.itemId,row.count||1);
  if(i.class===6){s.ammunition??={};s.ammunition[row.itemId]=(s.ammunition[row.itemId]||0)+(row.count||1);}
  else if(i.ContainerSlots)s.bags.push(item);
  else if(i.InventoryType&&[2,4].includes(i.class))s.equipment[slotOf(i)]=item;
  else s.bag.push(item);
 }
 const st=stats(s);s.hp=st.maxHp;s.mana=st.maxMana;s.rage=0;s.energy=100;
}
export const countItem=(s,id)=>s.bag.filter(i=>i.id===id).reduce((n,i)=>n+i.count,0);
export const bagCapacity=s=>16+s.bags.reduce((n,i)=>n+(items[i.id]?.ContainerSlots||0),0);
export function equipmentBlockedReason(c,item,requestedSlot,partyState=c){
 const data=items[item?.id];
 if(!c||!item||!canEquip(c,data)||!data.InventoryType)return '当前角色无法装备：职业、等级或熟练度不符。';
 if(item.ownerId&&item.ownerId!==c.id&&(item.issued||![partyState,...(partyState?.party||[])].some(member=>member?.id===item.ownerId)))return '装备不属于可共享的队员，无法装备这件物品。';
 const naturalSlot=slotOf(data);
 if(requestedSlot!==undefined&&requestedSlot!==naturalSlot&&!([12,14].includes(requestedSlot)&&naturalSlot===requestedSlot-1)&&!(requestedSlot===17&&data.class===2&&[13,22].includes(data.InventoryType)))return '装备栏位不匹配';
 const slot=requestedSlot??naturalSlot;
 if(slot===17&&data.class===2&&!c.learned.includes(674))return '需要先学习双武器';
 if(slot===17&&items[c.equipment[16]?.id]?.InventoryType===17)return '双手武器不能与副手同时装备，请先换下双手武器。';
 return '';
}
export function equipFromBag(s,uid,target,requestedSlot){
 const c=!target||target===s.id?s:s.party.find(c=>c.id===target),item=s.bag.find(i=>i.uid===uid),data=items[item?.id];
 const blocked=equipmentBlockedReason(c,item,requestedSlot,s);if(blocked)throw new Error(blocked);
 const slot=requestedSlot??slotOf(data);
 const displaced=[c.equipment[slot],...(data.InventoryType===17?[c.equipment[17]]:[])].filter(Boolean),bag=s.bag.filter(i=>i.uid!==uid);
 bag.push(...displaced.filter(i=>!i.issued));if(bag.length>bagCapacity(s))throw new Error('背包需要空间存放换下的装备。');
 const bound=item.bound||data.bonding===2;
 c.equipment[slot]={...item,bound};if(bound)c.equipment[slot].ownerId=c.id;else delete c.equipment[slot].ownerId;
 if(data.InventoryType===17)delete c.equipment[17];s.bag=bag;
 c.hp=Math.min(c.hp,stats(c).maxHp);c.mana=Math.min(c.mana,stats(c).maxMana);
}
export function takeItem(s,id,count){if(countItem(s,id)<count)throw new Error('缺少 '+nameOf('items',id));for(const item of [...s.bag]){if(item.id!==id)continue;const used=Math.min(item.count,count);item.count-=used;count-=used;if(!item.count)s.bag.splice(s.bag.indexOf(item),1);if(!count)break;}}
export function addItem(s,id,count=1,pending=true){const data=items[id];if(!data)return false;if(data.maxcount>0)count=Math.min(count,Math.max(0,data.maxcount-countItem(s,id)-Object.values(s.equipment).filter(i=>i.id===id).length));const max=Math.max(1,data.stackable);for(const item of s.bag.filter(i=>i.id===id&&i.count<max)){const n=Math.min(count,max-item.count);item.count+=n;count-=n;}
 while(count>0&&s.bag.length<bagCapacity(s)){const n=Math.min(max,count);s.bag.push(makeItem(s,id,n));count-=n;}
 if(count&&pending)s.pending.push(makeItem(s,id,count));return count===0;
}
export function gainXp(s,c,amount){if(c.level>=LEVEL_CAP)return;if(!Number.isFinite(amount)||amount<0)throw new Error('经验值无效');const wasPartyUnlocked=partyUnlocked(s);c.xp+=amount;if(c===s)s.totals.xp+=amount;while(c.level<LEVEL_CAP&&c.xp>=xpTable[c.level].xp_for_next_level){c.xp-=xpTable[c.level].xp_for_next_level;c.level++;const st=stats(c);c.hp=st.maxHp;c.mana=st.maxMana;log(s,`${c.name} 升到了 ${c.level} 级！`,'level');}if(c.level===LEVEL_CAP)c.xp=0;if(!wasPartyUnlocked&&partyUnlocked(s)&&s.growthPolicy!=='companion')log(s,'队友系统已开通！可在队友页随时招募或更换队友。','party');}
export function killXp(playerLevel,mobLevel,elite=false,dungeon=false){const diff=mobLevel-playerLevel;const base=playerLevel*5+45;const trivial=playerLevel<10?4:playerLevel<20?5:playerLevel<30?6:playerLevel<40?7:playerLevel<45?8:playerLevel<50?9:playerLevel<55?10:playerLevel<60?11:12;const zd=playerLevel<8?5:playerLevel<10?6:playerLevel<12?7:playerLevel<16?8:playerLevel<20?9:playerLevel<30?11:playerLevel<40?12:playerLevel<45?13:playerLevel<50?14:playerLevel<55?15:playerLevel<60?16:17;let amount=diff>=0?base*(1+.05*Math.min(4,diff)):-diff<=trivial?base*(1+diff/zd):0;if(elite)amount*=dungeon?2.5:2;const integer=Math.floor(amount),fraction=amount-integer;return fraction===.5?integer+(integer%2):Math.round(amount);}
export function knownRank(c,first){const original=spells[first];return c.learned.filter(id=>spells[id]&&((spellChain[id]?.first_spell||id)===first||spells[id].SpellName===original?.SpellName)).sort((a,b)=>spells[b].SpellLevel-spells[a].SpellLevel)[0]||null;}
export function spellInfo(c,id){const sp=spells[id];if(!sp)return null;const cast=lookup.SpellCastTimes[sp.CastingTimeIndex];const duration=lookup.SpellDuration[sp.DurationIndex];const range=lookup.SpellRange[sp.RangeIndex];let castMs=Math.max(cast?.minimumMs||0,(cast?.baseMs||0)+(cast?.perLevelMs||0)*c.level);
 let mana=sp.ManaCost+sp.ManaCostPerlevel*Math.max(0,c.level-sp.SpellLevel)+stats(c).baseMana*sp.ManaCostPercentage/100;
 if(c.auras?.some(a=>a.raidCurse&&a.until>(c.time||0)))mana*=2;
 const info={...sp,baseCastMs:Math.max(0,castMs),castMs:Math.max(0,castMs),durationMs:Math.max(0,duration?.baseMs||0),range:range?.maximumYards||0,minRange:range?.minimumYards||0,radius:Math.max(0,...[1,2,3].map(n=>lookup.SpellRadius[sp['EffectRadiusIndex'+n]]?.radiusYards||0)),mana:Math.floor(mana),spellCooldownMs:sp.RecoveryTime||0,categoryCooldownMs:sp.CategoryRecoveryTime||0,cooldownMs:Math.max(sp.RecoveryTime||0,sp.CategoryRecoveryTime||0)};
 return modifySpell(c,sp,info);
}
export function effectRange(c,sp,n=1){const level=Math.max(0,Math.min(c.level,sp.MaxLevel||c.level)-sp.SpellLevel);const base=sp['EffectBasePoints'+n]+level*sp['EffectRealPointsPerLevel'+n];const dice=Math.max(1,sp['EffectDieSides'+n]+level*sp['EffectDicePerLevel'+n]);return[Math.floor(base+Math.max(1,sp['EffectBaseDice'+n])),Math.floor(base+dice)];}
export const armorReduction=(armor,level)=>Math.min(.75,Math.max(0,armor)/(Math.max(0,armor)+400+85*level));
export function enemy(s,id,key){const raw=creatures[id];if(!raw)throw new Error('怪物数据不存在');const level=roll(s,raw.MinLevel,raw.MaxLevel);const base=table('creature_template_classlevelstats').find(r=>r.Level===level&&r.Class===raw.UnitClass)||table('creature_template_classlevelstats').find(r=>r.Level===level);const fraction=raw.MaxLevel===raw.MinLevel?0:(level-raw.MinLevel)/(raw.MaxLevel-raw.MinLevel);const hp=Math.round(raw.MinLevelHealth>0?raw.MinLevelHealth+(raw.MaxLevelHealth-raw.MinLevelHealth)*fraction:base.BaseHealthExp0*raw.HealthMultiplier);const armor=raw.Armor||Math.round(base.BaseArmor*raw.ArmorMultiplier);const swing=raw.MeleeBaseAttackTime||2000;const low=raw.MinMeleeDmg||((base.BaseDamageExp0+base.BaseMeleeAttackPower/14)*swing/1000*raw.DamageMultiplier);const high=raw.MaxMeleeDmg||low*(raw.DamageVariance||1);
 const mana=raw.MinLevelMana||base.BaseMana*raw.PowerMultiplier;
 const spawnEventRolls=Object.fromEntries(table('creature_ai_scripts').filter(r=>r.creature_id===id&&r.event_type===11).map(r=>[r.id,rng(s)*100<r.event_chance]));
 return{id:key,entry:id,name:nameOf('npcs',id),level,hp,maxHp:hp,mana,maxMana:mana,spawnEventRolls,armor,low,high,swing,rank:raw.Rank,moveSpeed:7*(raw.SpeedRun||1),walkSpeed:2.5*(raw.SpeedWalk||1),modelId:raw.ModelId1,threat:{},distance:30,slowUntil:0,rootUntil:0,stunUntil:0,polyUntil:0,cast:null,nextAttack:0,nextSpell:6000,dots:[],dead:false};}
