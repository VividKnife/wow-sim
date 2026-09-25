import {canReceiveRaidLoot,raidItemIsEquipment} from './raid-rewards.js';
import {createRoster,gearScore} from '../molten-core-roster.ts';
import {items,talents,nameOf,classTalentTrees} from './catalog.js';
import {rng,stats,canEquip,slotOf,log} from './character.js';
import {combatRole} from './combat-roles.js';
import {grantTalentRank,resetTalentGrants} from './talent-acquisition.js';
import {supportedTalentNames} from './class-support.js';

export const GOLD=10000;
export const personalities={
 saver:{name:'排骨攒金',normal:28,rare:160,ratio:.18,line:'提升不大我就让，主要来分金。'},
 value:{name:'理性提升',normal:90,rare:650,ratio:.6,line:'合适就买，超过预算不追。'},
 collector:{name:'毕业收藏',normal:65,rare:1250,ratio:.85,line:'散件随缘，毕业装我会认真出价。'},
 whale:{name:'豪爽老板',normal:230,rare:2200,ratio:.8,line:'有提升就拿，省得下周再来。'},
 impulsive:{name:'上头土豪',normal:400,rare:4500,ratio:1,line:'别问值不值，今天就想带走。'},
};
const first=['浮生','晚风','老陈','星河','雪落','龙少','咕咕','摸鱼','阿布','一刀','白夜','山海','秋水','橘子','无眠','风铃','小满','沉舟','追光','大橙'];
const last=['不加班','很有钱','要毕业','打工中','来旅游','只打本','会走位','没睡醒'];
const pick=(s,a)=>a[Math.floor(rng(s)*a.length)];
const gearPools=new Map();
function randomGear(s,c,quality){
 const role=combatRole(c),key=c.classId+':'+role;
 if(!gearPools.has(key))gearPools.set(key,Object.values(items).filter(i=>[2,3,4].includes(i.Quality)&&i.ItemLevel>=48&&i.ItemLevel<=68&&!i.raidReward&&!i.RequiredSkill&&!i.requiredspell&&!i.RequiredReputationFaction&&!i.requiredhonorrank&&canEquip(c,i)).sort((a,b)=>gearScore(b,role,c.classId)-gearScore(a,role,c.classId)||a.entry-b.entry));
 for(const [slot,old] of Object.entries(c.equipment)){
  const original=items[old.id],pool=gearPools.get(key).filter(i=>slotOf(i)===slotOf(original)&&i.InventoryType===original.InventoryType&&i.Quality>=(quality==='精良'?3:2)&&!(i.maxcount===1&&Object.entries(c.equipment).some(([other,e])=>other!==slot&&e.id===i.entry))).slice(0,quality==='精良'?5:12);
  const chosen=pick(s,pool)||original;c.equipment[slot]={...old,id:chosen.entry,uid:`${c.id}:${slot}`,durability:chosen.MaxDurability||undefined};
 }
}
function randomTalents(s,c){
 const current=Object.entries(c.talents).reduce((map,[id,n])=>{const tree=talents[id]?.tree;map[tree]=(map[tree]||0)+n;return map;},{});
 const main=Number(Object.keys(current).sort((a,b)=>current[b]-current[a])[0]);
 resetTalentGrants(c);
 for(let used=0;used<51;used++){
  const pool=Object.values(talents).filter(t=>t.classId===c.classId&&supportedTalentNames.has(t.name)&&(c.talents[t.id]||0)<t.maxRank&&Object.entries(c.talents).filter(([id])=>talents[id].tree===t.tree).reduce((n,[,v])=>n+v,0)>=t.requiredTreePoints&&(t.prerequisites||[]).every(p=>(c.talents[p.talentId]||0)>=p.requiredRank));
  const preferred=pool.filter(t=>t.tree===main),t=pick(s,preferred.length&&rng(s)<.84?preferred:pool);if(!t)break;grantTalentRank(c,t,(c.talents[t.id]||0)+1);
 }
}
export function createGoldApplicants(s,count=32){
 const g=s.goldRaid,templates=createRoster().slice(5),result=[];
 for(let i=0;i<count;i++){
  const seq=++g.applicantSequence,c=structuredClone(templates[i<20?i:Math.floor(rng(s)*templates.length)]),personality=pick(s,Object.keys(personalities));
  const attraction=(g.rules.dpsBonus+g.rules.supportBonus)/100-g.rules.leaderFee/100;
  const skillRoll=rng(s)+attraction*.6,skill=skillRoll>.76?'expert':skillRoll<.22?'novice':'regular';
  const quality=rng(s)+attraction*.5>.5?'精良':'混搭';
  c.id=`gold:${s.id}:${g.serial}:${seq}`;c.name=pick(s,first)+pick(s,last)+seq;c.guildUnit=true;c.growthPolicy='goldNpc';c.goldNpc=true;c.raidMainTank=false;
  randomTalents(s,c);randomGear(s,c,quality);
  if(skill==='expert'){
   const bursts={1:[2687,12292],3:[3045],4:[13750,13877],8:[12042,12043]}[c.classId]||[];
   c.rules=[...bursts.filter(id=>c.learned.includes(id)).map(spell=>({spell,condition:'always',value:0,enabled:true})),...c.rules];
  }
  const wealthy=['whale','impulsive'].includes(personality),wallet=Math.round(wealthy?1200+rng(s)*4800:45+rng(s)*650)*GOLD;
  c.goldProfile={skill,quality,personality,wallet,initialWallet:wallet,consumableSpent:0,potionsUsed:0,elixirsUsed:0,damage:0,healing:0,seconds:0,participations:0,fireHits:0,deaths:0};
  c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;result.push(c);
 }
 return result;
}
export function npcWantsConsumables(c,rules){return c.goldProfile.skill==='expert'||c.goldProfile.personality!=='saver'&&(combatRole(c)==='healer'||combatRole(c)==='tank'?rules.supportBonus>=10:rules.dpsBonus>=10);}
export function prepareGoldNpc(s,c){
 const p=c.goldProfile;p.fireDecisions={};p.nextThink=s.clock;p.nextPotion=s.clock;p.usingConsumables=npcWantsConsumables(c,s.goldRaid.rules);
 if(p.usingConsumables&&p.wallet>=5*GOLD){p.wallet-=5*GOLD;p.consumableSpent+=5*GOLD;p.elixirsUsed++;c.auras.push({spell:992100,type:29,misc:-1,amount:12,positive:true,until:s.clock+240000});}
}
export function goldNpcTick(s,actors){
 if(!s.goldRaid?.active)return;
 for(const c of actors.filter(c=>c.goldNpc&&c.hp>0)){
  const p=c.goldProfile;
  if(s.clock>=p.nextThink){p.nextThink=s.clock+3000;if(p.skill==='novice'&&rng(s)<.38&&!c.cast)c.nextAction=Math.max(c.nextAction,s.clock+1500);}
  const st=stats(c);
  if(p.usingConsumables&&s.clock>=p.nextPotion&&p.wallet>=2*GOLD&&(c.hp<st.maxHp*.35||st.maxMana>0&&c.mana<st.maxMana*.35)){
   p.wallet-=2*GOLD;p.consumableSpent+=2*GOLD;p.potionsUsed++;p.nextPotion=s.clock+45000;c.hp=Math.min(st.maxHp,c.hp+Math.round(st.maxHp*.3));c.mana=Math.min(st.maxMana,c.mana+Math.round(st.maxMana*.3));log(s,`${c.name} 使用自费战斗药水。`,'raid-support');
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
 if(!canReceiveRaidLoot(c,item))return 0;
 if(!raidItemIsEquipment(item.entry)){const p=c.goldProfile;return Math.min(p.wallet,Math.max(10*GOLD,item.SellPrice*4)*(rare?20:1));}
 const p=c.goldProfile,profile=personalities[p.personality],role=combatRole(c),old=items[c.equipment[slotOf(item)]?.id];
 const before=old?gearScore(old,role,c.classId):0,after=gearScore(item,role,c.classId),improvement=(after-before)/Math.max(1,before);
 if(improvement<=0&&p.personality!=='impulsive')return 0;
 const fair=(rare?profile.rare:profile.normal)*Math.max(.35,Math.min(1.8,1+improvement));
 return Math.min(p.wallet,Math.floor(Math.min(p.wallet*profile.ratio,fair*(.8+rng(s)*.4)*GOLD)));
}
export function goldNpcView(c){
 const p=c.goldProfile,st=stats(c);
 return {id:c.id,name:c.name,classId:c.classId,role:combatRole(c),hp:c.hp,maxHp:st.maxHp,mana:c.mana,maxMana:st.maxMana,skill:p.skill,quality:p.quality,personality:p.personality,personalityName:personalities[p.personality].name,quote:personalities[p.personality].line,wallet:p.wallet,damage:p.damage,healing:p.healing,dps:p.seconds?p.damage/p.seconds:0,consumableSpent:p.consumableSpent,potionsUsed:p.potionsUsed,elixirsUsed:p.elixirsUsed,fireHits:p.fireHits,deaths:p.deaths,
 equipment:Object.entries(c.equipment).map(([slot,e])=>({slot,id:e.id,name:nameOf('items',e.id),quality:items[e.id]?.Quality,level:items[e.id]?.ItemLevel,stats:Array.from({length:10},(_,i)=>({type:items[e.id]?.['stat_type'+(i+1)],value:items[e.id]?.['stat_value'+(i+1)]})).filter(x=>x.value)})),
 trees:classTalentTrees.filter(t=>t.classId===c.classId).map(t=>({name:t.nameZhCN||t.name,points:t.talents.reduce((n,x)=>n+(c.talents[x.id]||0),0)})),talents:Object.entries(c.talents).map(([id,rank])=>({id,name:talents[id].nameZhCN||talents[id].name,rank,maxRank:talents[id].maxRank}))};
}
