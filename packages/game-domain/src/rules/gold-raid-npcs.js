import {canReceiveEquipment} from './npc-equipment.js';
import {ensureNpcWorld} from './npc-world.js';
import {canReceiveRaidLoot,raidItemIsEquipment} from './raid-rewards.js';
import {gearScore} from '../molten-core-roster.ts';
import {items,talents,nameOf,classTalentTrees} from './catalog.js';
import {rng,stats,slotOf,log} from './character.js';
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
 return world.residents.filter(p=>p.unit.level===60).map(p=>{
  const c=structuredClone(p.unit),profile=p.raidProfile;
  c.npcPlayer=true;c.goldNpc=true;c.raidMainTank=false;c.money=p.wallet;
  c.goldProfile={skill:profile.skill,quality:Object.values(c.equipment).some(e=>items[e.id]?.Quality>=3)?'精良':'混搭',personality:profile.personality,friend:p.friend,runs:p.runs,initialWallet:p.wallet,consumableSpent:0,potionsUsed:0,elixirsUsed:0,damage:0,healing:0,seconds:0,participations:0,fireHits:0,deaths:0};
  c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;return c;
 });
}
export function npcWantsConsumables(c,rules){return c.goldProfile.skill==='expert'||c.goldProfile.personality!=='saver'&&(combatRole(c)==='healer'||combatRole(c)==='tank'?rules.supportBonus>=10:rules.dpsBonus>=10);}
export function prepareGoldNpc(s,c){
 const p=c.goldProfile;p.fireDecisions={};p.nextThink=s.clock;p.nextPotion=s.clock;p.usingConsumables=npcWantsConsumables(c,s.goldRaid.rules);
 if(p.usingConsumables&&!(p.elixirUntil>s.clock)&&c.money>=5*GOLD){c.money-=5*GOLD;p.consumableSpent+=5*GOLD;p.elixirsUsed++;p.elixirUntil=s.clock+240000;}
 if(p.elixirUntil>s.clock)c.auras.push({spell:992100,type:29,misc:-1,amount:12,positive:true,until:p.elixirUntil});
}
export function goldNpcTick(s,actors){
 if(!s.goldRaid?.active)return;
 for(const c of actors.filter(c=>c.goldNpc&&c.hp>0)){
  const p=c.goldProfile;
  if(s.clock>=p.nextThink){p.nextThink=s.clock+3000;if(p.skill==='novice'&&rng(s)<.38&&!c.cast)c.nextAction=Math.max(c.nextAction,s.clock+1500);}
  const st=stats(c);
  if(p.usingConsumables&&s.clock>=p.nextPotion&&c.money>=2*GOLD&&(c.hp<st.maxHp*.35||st.maxMana>0&&c.mana<st.maxMana*.35)){
   c.money-=2*GOLD;p.consumableSpent+=2*GOLD;p.potionsUsed++;p.nextPotion=s.clock+45000;c.hp=Math.min(st.maxHp,c.hp+Math.round(st.maxHp*.3));c.mana=Math.min(st.maxMana,c.mana+Math.round(st.maxMana*.3));log(s,`${c.name} 使用自费战斗药水。`,'raid-support');
  }
 }
}
export function goldAvoidsFire(s,c,fire){
 if(!c.goldNpc)return true;const p=c.goldProfile;
 p.fireDecisions??={};
 if(!Object.hasOwn(p.fireDecisions,fire.id))p.fireDecisions[fire.id]={avoid:rng(s)<({novice:.3,regular:.84,expert:.99}[p.skill]),at:fire.startedAt+({novice:2100,regular:900,expert:150}[p.skill])};
 const d=p.fireDecisions[fire.id];return d.avoid&&s.clock>=d.at;
}
export function npcPriceLimit(c,item,rare,s){
 if(!canReceiveRaidLoot(c,item)||!canReceiveEquipment({...c,bag:[...(c.bag||[]),...(c.raidCollection||[]),...(c.raidPendingEquipment||[])]},item))return 0;
 if(!raidItemIsEquipment(item.entry)){const p=c.goldProfile;return Math.min(c.money,Math.max(10*GOLD,item.SellPrice*4)*(rare?20:1));}
 const p=c.goldProfile,profile=personalities[p.personality],role=combatRole(c),old=items[c.equipment[slotOf(item)]?.id];
 const before=old?gearScore(old,role,c.classId):0,after=gearScore(item,role,c.classId),improvement=(after-before)/Math.max(1,before);
 if(improvement<=0&&p.personality!=='impulsive')return 0;
 const fair=(rare?profile.rare:profile.normal)*Math.max(.35,Math.min(1.8,1+improvement));
 return Math.min(c.money,Math.floor(Math.min(c.money*profile.ratio,fair*(.8+rng(s)*.4)*GOLD)));
}
export function goldNpcView(c){
 const p=c.goldProfile,st=stats(c);
 return {id:c.id,name:c.name,classId:c.classId,role:combatRole(c),hp:c.hp,maxHp:st.maxHp,mana:c.mana,maxMana:st.maxMana,skill:p.skill,quality:p.quality,personality:p.personality,personalityName:personalities[p.personality].name,quote:personalities[p.personality].line,wallet:c.money,friend:p.friend,runs:p.runs,damage:p.damage,healing:p.healing,dps:p.seconds?p.damage/p.seconds:0,consumableSpent:p.consumableSpent,potionsUsed:p.potionsUsed,elixirsUsed:p.elixirsUsed,fireHits:p.fireHits,deaths:p.deaths,
 equipment:Object.entries(c.equipment).map(([slot,e])=>({slot,id:e.id,name:nameOf('items',e.id),quality:items[e.id]?.Quality,level:items[e.id]?.ItemLevel,stats:Array.from({length:10},(_,i)=>({type:items[e.id]?.['stat_type'+(i+1)],value:items[e.id]?.['stat_value'+(i+1)]})).filter(x=>x.value)})),
 trees:classTalentTrees.filter(t=>t.classId===c.classId).map(t=>({name:({41:'火焰',61:'冰霜',81:'奥术'}[t.id]||t.nameZhCN||t.name),points:t.talents.reduce((n,x)=>n+(c.talents[x.id]||0),0)})),talents:Object.entries(c.talents).map(([id,rank])=>({id,name:talents[id].nameZhCN||talents[id].name,rank,maxRank:talents[id].maxRank}))};
}
