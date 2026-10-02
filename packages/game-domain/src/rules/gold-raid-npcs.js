import {npcRaidEligible} from './npc-progression.js';
import {characterBis,CURRENT_BIS_PHASE} from './item-bis.js';
import {drinkPotion} from './consumables.js';
import {marketPrice} from './inventory.js';
import {canReceiveEquipment,equipmentUpgrade,npcEquipmentValue,equipNpcItem} from './npc-equipment.js';
import {ensureNpcWorld} from './npc-world.js';
import {canReceiveRaidLoot,raidItemIsEquipment} from './raid-rewards.js';
import {items,talents,nameOf,classTalentTrees} from './catalog.js';
import {rng,stats,log,spellInfo} from './character.js';
import {combatRole} from './combat-roles.js';

export const GOLD=10000;
export const personalities={
 saver:{name:'排骨攒金',normal:28,rare:160,ratio:.18,line:'提升不大我就让，主要来分金。'},
 value:{name:'理性提升',normal:90,rare:650,ratio:.6,line:'合适就买，超过预算不追。'},
 collector:{name:'毕业收藏',normal:65,rare:1250,ratio:.85,line:'散件随缘，毕业装我会认真出价。'},
 whale:{name:'豪爽老板',normal:230,rare:2200,ratio:.8,line:'有提升就拿，省得下周再来。'},
 impulsive:{name:'上头土豪',normal:400,rare:4500,ratio:1,line:'别问值不值，今天就想带走。'},
};
// Applicants are snapshots of existing residents, never newly minted characters.
export function createGoldApplicants(s){
 const world=ensureNpcWorld(s);
 return world.residents.filter(p=>npcRaidEligible(p,s.goldRaid?.raidId??'molten-core',s.wallAt)).map(p=>{
  const c=structuredClone(p.unit),profile=p.raidProfile;
  c.npcPlayer=true;c.goldNpc=true;c.raidMainTank=false;c.money=p.wallet;
  c.goldProfile={skill:profile.skill,quality:Object.values(c.equipment).some(e=>items[e.id]?.Quality>=3)?'精良':'混搭',personality:profile.personality,friend:(s.npcFriendIds??[]).includes(p.id),runs:p.runs,initialWallet:p.wallet,consumableSpent:0,potionsUsed:0,elixirsUsed:0,damage:0,healing:0,seconds:0,participations:0,fireHits:0,deaths:0};
  c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;return c;
 });
}
export function npcWantsConsumables(c,rules){return c.goldProfile.skill==='expert'||c.goldProfile.personality!=='saver'&&(combatRole(c)==='healer'||combatRole(c)==='tank'?rules.supportBonus>=10:rules.dpsBonus>=10);}
export function prepareGoldNpc(s,c){
 const p=c.goldProfile;p.fireDecisions={};p.nextThink=s.clock;p.usingConsumables=npcWantsConsumables(c,s.goldRaid.rules);
 // Elixir of Fortitude: real item 3825, +120 health for one hour.
 const id=3825,sp=spellInfo(c,items[id].spellid_1),cost=marketPrice(id).buy;
 if(p.usingConsumables&&!(c.itemBuffs||[]).some(b=>b.item===id&&b.until>s.clock)&&c.money>=cost){
  c.money-=cost;p.consumableSpent+=cost;p.elixirsUsed++;
  c.itemBuffs=(c.itemBuffs||[]).filter(b=>b.item!==id);
  c.itemBuffs.push({item:id,spell:sp.Id,stats:{health:sp.EffectBasePoints1+1},until:s.clock+sp.durationMs});
  log(s,`${c.name} 使用 ${nameOf('items',id)}`,'buff',{actorId:c.id,itemId:id});
 }
}
export function goldNpcTick(s,actors){
 if(!s.goldRaid?.active)return;
 for(const c of actors.filter(c=>c.goldNpc&&c.hp>0)){
  const p=c.goldProfile;
  if(s.clock>=p.nextThink){p.nextThink=s.clock+3000;if(p.skill==='novice'&&rng(s)<.38&&!c.cast)c.nextAction=Math.max(c.nextAction,s.clock+1500);}
  const st=stats(c);
  if(p.usingConsumables&&(c.potionReady||0)<=s.clock){
   const id=c.hp<st.maxHp*.35?13446:st.maxMana>0&&c.mana<st.maxMana*.35?13444:0;
   const cost=id&&marketPrice(id).buy;
   if(id&&c.money>=cost&&drinkPotion(s,c,id)){c.money-=cost;p.consumableSpent+=cost;p.potionsUsed++;}
  }
 }
}
export function goldAvoidsFire(s,c,fire){
 if(!c.goldNpc)return true;const p=c.goldProfile;
 p.fireDecisions??={};
 if(!Object.hasOwn(p.fireDecisions,fire.id))p.fireDecisions[fire.id]={avoid:rng(s)<({novice:.3,regular:.84,expert:.99}[p.skill]),at:fire.startedAt+({novice:2100,regular:900,expert:150}[p.skill])};
 const d=p.fireDecisions[fire.id];return d.avoid&&s.clock>=d.at;
}
// Evaluate purchases already won or escrowed before considering another lot.
export function npcAuctionLoadout(c,s,lotId){
 const projected={...c,equipment:{...c.equipment},bag:[...(c.bag||[])],raidCollection:[...(c.raidCollection||[])]};
 const reserved=(s.goldRaid?.auctions||[]).filter(a=>a.id!==lotId&&a.leader===c.id).map(a=>({id:a.itemId,count:a.count}));
 for(const instance of [...(c.raidPendingEquipment||[]),...reserved]){
  if(!equipNpcItem(projected,instance))projected.bag.push(instance);
 }
 projected.bag.push(...projected.raidCollection);
 return projected;
}
/** @param {{variation?: number, lotId?: string}} [options] */
export function npcBidValuation(c,item,rare,s,options={}){
 const {variation=1,lotId}=options;
 const p=c.goldProfile,profile=personalities[p.personality],projected=npcAuctionLoadout(c,s,lotId);
 const reject=reason=>({limit:0,reason,bis:false});
 if(!canReceiveRaidLoot(c,item)||!canReceiveEquipment(projected,item))return reject('不符合领取条件或已达持有上限');
 const reserve=Math.min(10*GOLD,Math.floor(p.initialWallet*.05));
 const budget=Math.max(0,Math.min(c.money-reserve,Math.floor(c.money*profile.ratio)));
 if(!budget)return reject('保留补给费后没有预算');
 if(!raidItemIsEquipment(item.entry)){
  // Materials are modest collection purchases, not unlimited legendary bids.
  if(projected.bag.some(e=>e.id===item.entry))return reject('已收藏该物品');
  const fair=Math.min((rare?profile.rare:profile.normal)*GOLD,Math.max(10*GOLD,item.SellPrice*4)*(rare?20:1));
  return {limit:Math.floor(Math.min(budget,fair*variation)),reason:'收藏预算',bis:false};
 }
 const upgrade=equipmentUpgrade(projected,item);
 if(!upgrade.need)return reject(upgrade.reason);
 const improvement=upgrade.improvement/Math.max(1,npcEquipmentValue(projected));
 const bis=characterBis(c,item.entry,s.goldRaid?.bisPhase??CURRENT_BIS_PHASE).length>0;
 // A small upgrade stays cheap; a current-phase target carries a bounded premium.
 const utility=Math.max(.15,Math.min(1.8,improvement*12));
 const premium=bis?(p.personality==='collector'?2.4:1.6):1;
 const fair=(rare?profile.rare:profile.normal)*utility*premium*variation*GOLD;
 return {limit:Math.floor(Math.min(budget,fair)),reason:bis?'当前阶段 BIS 提升':'当前配装提升',bis,improvement};
}
export function npcPriceLimit(c,item,rare,s,options={}){
 return npcBidValuation(c,item,rare,s,{...options,variation:options.variation??(.8+rng(s)*.4)}).limit;
}
export function goldNpcView(c){
 const p=c.goldProfile,st=stats(c);
 return {id:c.id,name:c.name,classId:c.classId,role:combatRole(c),hp:c.hp,maxHp:st.maxHp,mana:c.mana,maxMana:st.maxMana,skill:p.skill,quality:p.quality,personality:p.personality,personalityName:personalities[p.personality].name,quote:personalities[p.personality].line,wallet:c.money,friend:!!p.friend,runs:p.runs,damage:p.damage,healing:p.healing,dps:p.seconds?p.damage/p.seconds:0,consumableSpent:p.consumableSpent,potionsUsed:p.potionsUsed,elixirsUsed:p.elixirsUsed,fireHits:p.fireHits,deaths:p.deaths,
 build:{name:c.npcBuild?.name,temperament:{steady:'稳健派',keen:'热心派',collector:'装备控'}[c.npcBuild?.temperament],skills:(c.rules||[]).map(r=>nameOf('spells',r.spell))},
 equipment:Object.entries(c.equipment).map(([slot,e])=>({slot,id:e.id,name:nameOf('items',e.id),quality:items[e.id]?.Quality,level:items[e.id]?.ItemLevel,stats:Array.from({length:10},(_,i)=>({type:items[e.id]?.['stat_type'+(i+1)],value:items[e.id]?.['stat_value'+(i+1)]})).filter(x=>x.value)})),
 trees:classTalentTrees.filter(t=>t.classId===c.classId).map(t=>({name:({41:'火焰',61:'冰霜',81:'奥术'}[t.id]||t.nameZhCN||t.name),points:t.talents.reduce((n,x)=>n+(c.talents[x.id]||0),0)})),talents:Object.entries(c.talents).map(([id,rank])=>({id,name:talents[id].nameZhCN||talents[id].name,rank,maxRank:talents[id].maxRank}))};
}
