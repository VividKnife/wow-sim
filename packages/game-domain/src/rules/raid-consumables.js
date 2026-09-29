import {items,nameOf} from './catalog.js';
import {spellInfo,log} from './character.js';
import {combatRole} from './combat-roles.js';
import {marketPrice,usableCount,consume} from './inventory.js';

export const flaskItems=[13510,13511,13512];
const elixirItems=[3825,13447,13454,13452];
const premiumBudget={saver:0,value:.03,collector:.08,whale:.2,impulsive:.3};
const stock=(c,id)=>c.bag?usableCount(c,id):0;
const weaponEnchant=(c,slot)=>c.weaponEnchants?.[slot]||(slot===16?c.weaponEnchant:null);

function chooseItem(s,c,economy,premium){
 if(stock(c,premium))return premium;
 if(stock(c,economy))return economy;
 if(!c.npcPlayer)return premium;
 const personality=c.goldProfile?.personality||s.npcWorld?.residents?.find(r=>r.id===c.id)?.raidProfile.personality||'value';
 const budget=(premiumBudget[personality]??premiumBudget.value)*c.money;
 return marketPrice(premium).buy<=budget?premium:economy;
}
function itemStats(sp){
 const values={};
 for(let n=1;n<=3;n++){
  const aura=sp['EffectApplyAuraName'+n],misc=sp['EffectMiscValue'+n],amount=sp['EffectBasePoints'+n]+1;
  if(aura===34)values.health=amount;
  else if(aura===35)values.mana=amount;
  else if(aura===13)values.spellPower=amount;
  else if(aura===29)values[['str','agi','sta','int','spi'][misc]]=amount;
  else if(aura===52)values.crit=amount/100;
 }
 return values;
}

// Inspection and execution share the same choices. Existing weapon coatings
// satisfy the check so rebuffing never replaces poisons or class imbues.
export function raidConsumableChecks(s,c){
 if(c.level<50)return [];
 const role=combatRole(c),caster=role==='ranged'&&c.classId!==3;
 const premium=role==='healer'?13511:caster?13512:13510;
 const economy=role==='healer'?13447:caster?13454:role==='tank'?3825:13452;
 const existing=(c.itemBuffs||[]).find(b=>[economy,premium].includes(b.item)&&b.until>s.clock);
 const id=existing?.item||chooseItem(s,c,economy,premium);
 const requests=[{itemId:id,kind:'flask',slot:null,tier:flaskItems.includes(id)?'premium':'economy'}];
 if(c.classId!==11&&(['tank','melee'].includes(role)||c.classId===3)){
  const sp=spellInfo(c,items[18262].spellid_1),sharp=spellInfo(c,items[12404].spellid_1);
  for(const slot of [16,17]){
   const weapon=items[c.equipment?.[slot]?.id];
   if(weapon?.class===2&&(sp.EquippedItemSubClassMask&(1<<weapon.subclass))){
    const economyStone=sharp.EquippedItemSubClassMask&(1<<weapon.subclass)?12404:12643;
    const current=weaponEnchant(c,slot),active=current?.until>s.clock&&current.weaponUid===c.equipment[slot].uid;
    const itemId=active&&[12404,12643,18262].includes(current.item)?current.item:chooseItem(s,c,economyStone,18262);
    requests.push({itemId,kind:'stone',slot,tier:itemId===18262?'premium':'economy'});
   }
  }
 }
 return requests.map(request=>{
  const {itemId,kind,slot}=request,weapon=c.equipment?.[slot];
  const buff=kind==='flask'?(c.itemBuffs||[]).find(b=>b.item===itemId&&b.until>s.clock):weaponEnchant(c,slot);
  const ready=c.hp>0&&buff?.until>s.clock&&(kind==='flask'||buff.charges!==0&&(!buff.weaponUid||buff.weaponUid===weapon?.uid));
  const count=stock(c,itemId),price=marketPrice(itemId).buy;
  const canBuy=!!c.npcPlayer&&c.money>=price;
  const locked=kind==='stone'&&weapon?.locked;
  const status=c.hp<=0?'dead':ready?'ready':locked?'materials':count||canBuy?'missing':c.npcPlayer?'funds':'materials';
  const reason=status==='dead'?'需先复活':ready?'已就绪':locked?'武器已锁定':count?`使用自备道具（剩余 ${count}）`:canBuy?`按拍卖行价自费补充（${(price/10000).toFixed(2)} 金）`:c.npcPlayer?`金币不足，需 ${(price/10000).toFixed(2)} 金`:'需在背包中准备此道具';
  return {...request,name:nameOf('items',itemId)+(slot===16?'（主手）':slot===17?'（副手）':''),spellId:items[itemId].spellid_1,status,reason,caster:c.name,remaining:ready?buff.until-s.clock:0};
 });
}

export function useRaidConsumable(s,c,request){
 const check=raidConsumableChecks(s,c).find(r=>r.kind===request.kind&&r.slot===request.slot);
 if(check?.status!=='missing')return false;
 const {itemId,kind,slot}=check,sp=spellInfo(c,items[itemId].spellid_1);
 if(stock(c,itemId))consume(c,itemId,1);
 else{
  const cost=marketPrice(itemId).buy;c.money-=cost;
  if(c.goldProfile)c.goldProfile.consumableSpent+=cost;
 }
 c.time=s.clock;
 if(kind==='flask'){
  c.itemBuffs=(c.itemBuffs||[]).filter(b=>![...flaskItems,...elixirItems].includes(b.item));
  c.itemBuffs.push({item:itemId,spell:sp.Id,stats:itemStats(sp),until:s.clock+sp.durationMs,persistThroughDeath:flaskItems.includes(itemId)});
  if(c.goldProfile)c.goldProfile.elixirsUsed++;
 }else{
  const enchant={item:itemId,spell:sp.Id,name:sp.SpellName,until:s.clock+(sp.EffectBasePoints1+1)*1000,weaponUid:c.equipment[slot].uid,slot,charges:null,stats:itemId===18262?{crit:.02}:{weaponDamage:8}};
  c.weaponEnchants??={};c.weaponEnchants[slot]=enchant;if(slot===16)c.weaponEnchant=enchant;
 }
 log(s,`${c.name} 使用 ${check.name}`,'buff',{actorId:c.id,itemId,spellId:sp.Id});
 return true;
}
