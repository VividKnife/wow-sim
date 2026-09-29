import {spells} from './catalog.js';
import {stats,spellInfo,knownRank,effectRange} from './character.js';
import {conservingRaidMana,raidHealingThreshold} from './raid-healing.js';
import {combatRole} from './combat-roles.js';
import {classAbilityKind} from './class-spell-registry.js';
import {selectClass} from './class-mechanics.js';
import {spellPowerBonus} from './spell-scaling.js';
import {healingMultiplier,spellCritBonus} from './talent-effects.js';
import {distance} from '../../../sim-core/src/geometry.js';

export const raidHealingMode=(s,c)=>s.combat?.raidEncounter?.command&&combatRole(c)==='healer'?s.combat.raidEncounter.command.healingMode:null;
const rankedHeal=sp=>!!sp&&classAbilityKind(sp)==='heal'&&!['Rebirth','Lay on Hands','Mend Pet','Health Funnel'].includes(sp.SpellName);

// Read-only estimates, not settlement: compare expected effective healing without
// rolling RNG or spending resources. Periodic healing is spread over its duration.
export function raidHealMetrics(s,c,sp,target,actors,readStats=stats){
 let recipients=[target];
 if(['Prayer of Healing','Holy Nova','Tranquility'].includes(sp.SpellName))recipients=actors.filter(a=>a.hp>0&&distance(c,a)<=(sp.radius||30));
 if(sp.SpellName==='Chain Heal')recipients=[target,...actors.filter(a=>a!==target&&a.hp>0&&distance(target,a)<=12).sort((a,b)=>a.hp/readStats(a).maxHp-b.hp/readStats(b).maxHp)].slice(0,3);
 const sheet=readStats(c),occupancy=Math.max(1000,sp.StartRecoveryTime||0,sp.ChannelInterruptFlags?sp.durationMs:sp.castMs||0)/1000;
 let effective=0,hps=0,immediate=0,firstHealMs=Infinity;const directByTarget={};
 for(const [index,a]of recipients.entries()){
  let direct=0,periodic=0,firstTick=Infinity;
  const auras=(a.auras||[]).filter(aura=>aura.until>s.clock);
  const received=auras.filter(aura=>aura.type===118).reduce((v,aura)=>v*(1+aura.amount/100),1)*(a.racialBuff?.kind==='bloodfury'&&a.racialBuff.until>s.clock?.5:1);
  const scale=healingMultiplier(c,sp,a)*received*(sp.SpellName==='Chain Heal'?Math.pow(.5,index):1);
  for(const n of [1,2,3]){
   const isHot=[8,161].includes(sp['EffectApplyAuraName'+n]);
   if(![10,77].includes(sp['Effect'+n])&&!isHot)continue;
   const mean=effectRange(c,sp,n).reduce((sum,v)=>sum+v,0)/2;
   const flat=isHot?0:auras.filter(aura=>aura.type===115||['Holy Light','Flash of Light'].includes(sp.SpellName)&&spells[aura.spell]?.SpellName?.includes('Blessing of Light')&&aura.effect===(sp.SpellName==='Holy Light'?1:2)).reduce((v,aura)=>v+aura.amount,0);
   const amount=(mean+flat+spellPowerBonus(sheet,sp,{healing:true,periodic:isHot,effect:n}))*scale;
   if(isHot){const interval=sp['EffectAmplitude'+n]||3000;periodic+=amount*Math.floor(sp.durationMs/interval);firstTick=Math.min(firstTick,interval);}
   else direct+=amount*(1+.5*Math.max(0,Math.min(1,sheet.spellCrit+spellCritBonus(c,sp))));
  }
  if(sp.SpellName==='Swiftmend'){
   const hot=a.hots?.find(h=>h.caster===c.id&&h.until>s.clock&&['Rejuvenation','Regrowth'].includes(h.name));
   direct=hot?hot.amount*(hot.name==='Rejuvenation'?4:6):0;
  }
  const deficit=Math.max(0,readStats(a).maxHp-a.hp),directEffective=Math.min(deficit,direct),hotEffective=Math.min(Math.max(0,deficit-directEffective),periodic);
  effective+=directEffective+hotEffective;immediate+=directEffective;
  directByTarget[a.id]=directEffective;
  hps+=directEffective/occupancy+hotEffective/Math.max(occupancy,(sp.durationMs||0)/1000);
  if(directEffective>0)firstHealMs=Math.min(firstHealMs,sp.castMs||0);
  else if(hotEffective>0)firstHealMs=Math.min(firstHealMs,(sp.castMs||0)+firstTick);
 }
 return {effective,hps,hpm:effective/Math.max(1,sp.mana),immediate,firstHealMs,directByTarget};
}

export function selectRaidHealing(s,c,enemy,actors){
 const mode=raidHealingMode(s,c);if(!mode)return null;
 if(mode==='conserve')actors=projectRaidHealingTargets(s,c,actors);
 const sheets=new Map(),readStats=a=>{if(!sheets.has(a))sheets.set(a,stats(a));return sheets.get(a);};
 // Configured conditions and disabled skills still apply. Without a configured
 // rotation, consider every learned healing family, resolving its highest rank.
 const rules=c.rules??[...new Set((c.learned||[]).filter(id=>rankedHeal(spells[id])).map(id=>knownRank(c,id)))].map(spell=>({spell,enabled:true,condition:'always',value:0}));
 const candidates=[];
 for(const rule of rules){
  if(!rule.enabled||!rankedHeal(spells[rule.spell]))continue;
  const intent=selectClass(s,c,enemy,actors,null,[rule]);if(!intent)continue;
  const sp=spellInfo(c,knownRank(c,rule.spell)),target=actors.find(a=>a.id===intent.targetId);if(!target)continue;
  const metrics=raidHealMetrics(s,c,sp,target,actors,readStats);if(!(metrics.effective>0))continue;
  candidates.push({intent,metrics,urgent:target.hp/readStats(target).maxHp<.3});
 }
 candidates.sort((a,b)=>{
  const cast=Number(b.intent.kind==='cast')-Number(a.intent.kind==='cast');if(cast)return cast;
  if(a.urgent!==b.urgent)return Number(b.urgent)-Number(a.urgent);
  if(a.urgent){const direct=Number(b.metrics.immediate>0)-Number(a.metrics.immediate>0);if(direct)return direct;const time=a.metrics.firstHealMs-b.metrics.firstHealMs;if(time)return time;}
  const metric=mode==='conserve'?'hpm':'hps',other=mode==='conserve'?'hps':'hpm';
  return b.metrics[metric]-a.metrics[metric]||b.metrics[other]-a.metrics[other];
 });
 return candidates[0]?.intent||null;
}

// Reserve only observed, imminent direct heals. No future boss events or random
// rolls are visible to this policy. Critically injured allies still get rescue.
export function projectRaidHealingTargets(s,c,actors){
 const incoming=new Map();
 for(const healer of actors){
  const cast=healer.cast,sp=cast&&spells[cast.spell],target=cast&&actors.find(a=>a.id===cast.target);
  if(healer.hp<=0||!cast||cast.channel||!sp||!rankedHeal(sp)||!target||target.hp<=0||cast.until>s.clock+3000||cast.until<s.clock)continue;
  const info=spellInfo(healer,cast.spell);
  if(distance(healer,target)>(info.range||40))continue;
  // Once a cast is due it is still pending until settlement in this tick.
  const amounts=raidHealMetrics(s,healer,info,target,actors).directByTarget;
  for(const [id,amount]of Object.entries(amounts))incoming.set(id,(incoming.get(id)||0)+amount);
 }
 return actors.map(a=>a.hp>0&&a.hp/stats(a).maxHp>=.3&&incoming.has(a.id)?{...a,hp:Math.min(stats(a).maxHp,a.hp+incoming.get(a.id))}:a);
}
export function cancelWastefulRaidHeal(s,c,actors){
 const cast=c.cast;
 if(!conservingRaidMana(s,c)||!cast?.policyControlled||cast.commanded||cast.channel||!rankedHeal(spells[cast.spell]))return false;
 const target=actors.find(a=>a.id===cast.target);if(!target||target.hp<=0)return false;
 // Cancel only on observed recovery, never because another heal might land.
 return target.hp>=stats(target).maxHp*raidHealingThreshold(s,c,target,.95);
}
