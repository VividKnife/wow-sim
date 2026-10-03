import {items,quests,questXp,xpTable,creatures,creatureLoot,referenceLoot,nameOf} from './catalog.js';
import {rng,stats} from './character.js';
import {buildUnit} from './npc-world.js';
import {npcIncome,buyNpcLuxury} from './npc-economy.js';
import {equipmentUpgrade,equipNpcItem} from './npc-equipment.js';
import {dungeonDefinitions} from './dungeon-registry.js';
import {dungeonJournal} from './dungeon-journal.js';
import {itemAvailableInPhase,contentPhase} from './content-phase.js';
import {rollClassicLoot,rollRaidLoot} from './raid-rewards.js';
import {raidBossesFor} from './molten-core-content.js';
import {npcBidValuation} from './gold-raid-npcs.js';

export const NPC_PROGRESS={stepMs:20*60000,dungeonMs:45*60000,dailyRuns:2,weeklyRuns:10,resetCooldownMs:30*60000,raidFallbackMs:6*3600000};
export const RAID_WEEK_MS=604800000,raidWeek=wall=>Math.floor((wall-345600000)/RAID_WEEK_MS);
export const raidResetWall=wall=>(raidWeek(wall)+1)*RAID_WEEK_MS+345600000;
const training=['learned','talents','rules','strategyPolicy','autoBuffs','potions','npcBuild','professions'];
const note=(p,text)=>{p.history.unshift({sequence:++p.events,text});p.history=p.history.slice(0,12);};
const roleContext=p=>({id:'realm',raceId:p.unit.raceId,clock:0,wallAt:0,location:p.unit.location});
function train(p){const fresh=buildUnit(roleContext(p),p.index,p.unit.level,false,{skill:p.raidProfile.skill,temperament:p.personality.id,spending:p.raidProfile.personality});for(const key of training)p.unit[key]=fresh[key];}
export function redistributeNpc(p,level,wall){
 if(p.unit.level===60||level<10||level>=60||!Number.isInteger(level))throw new Error('Only leveling NPCs may be redistributed');
 const money=p.wallet,sequence=p.unit.itemSequence,identity=p.id;
 p.unit=buildUnit(roleContext(p),p.index,level,true,{skill:p.raidProfile.skill,temperament:p.personality.id,spending:p.raidProfile.personality});
 p.unit.itemSequence=sequence;p.unit.id=identity;
 // Issued leveling gear is replaced, never sold; IDs cannot be reused for a new template.
 p.generation=(p.generation??0)+1;
 for(const item of Object.values(p.unit.equipment))item.uid=`${identity}:distribution:${p.generation}:${++p.unit.itemSequence}`;
 p.wallet=money;p.unit.money=money;p.completedQuests=[];p.activityMs=0;p.growthLevel=level;p.lastRedistributionWall=wall;
 note(p,`公共队伍需要${level}级伙伴，已调整等级及基础配装。金币不变。`);
}
function award(p,id,source){const item=items[id],plan=item&&equipmentUpgrade(p.unit,item);if(!plan?.need)return false;
 equipNpcItem(p.unit,{id,uid:`${p.id}:${source}:${++p.unit.itemSequence}`,count:1,durability:item.MaxDurability},plan);return true;}
function gain(p,amount,ceiling){const c=p.unit;if(c.level>=60)return; c.xp+=Math.max(0,Math.floor(amount));const before=c.level;
 while(c.level<ceiling&&c.xp>=xpTable[c.level].xp_for_next_level){c.xp-=xpTable[c.level].xp_for_next_level;c.level++;}
 c.xp=c.level===60?0:Math.min(c.xp,xpTable[c.level].xp_for_next_level-1);
 if(c.level!==before){train(p);note(p,`冒险历练升至${c.level}级。`);}
}
function levelingStep(p,ceiling,multiplier){
 const c=p.unit,expert=p.raidProfile.skill==='expert',kills=expert?27:18;
 const level=c.level,killXp=45+5*level;
 const pool=Object.values(quests).filter(q=>q.QuestLevel>=level-3&&q.QuestLevel<=level+1&&q.MinLevel<=level&&q.RewOrReqMoney>=0&&!p.completedQuests.includes(q.entry)&&(!q.RequiredClasses||q.RequiredClasses&(1<<(c.classId-1)))&&(!q.RequiredRaces||q.RequiredRaces&(1<<(c.raceId-1)))&&(!q.PrevQuestId||q.PrevQuestId<0||p.completedQuests.includes(q.PrevQuestId)));
 const q=pool[Math.floor(rng(p)*pool.length)];
 let xp=kills*killXp,money=0;
 const mobs=Object.values(creatures).filter(m=>m.Rank===0&&m.MinLevel<=level&&m.MaxLevel>=level&&m.MaxLootGold>0);
 const mob=mobs[Math.floor(rng(p)*mobs.length)];
 money=mob?Math.round(kills*(mob.MinLootGold+mob.MaxLootGold)/2):level*kills;
 if(q){p.completedQuests.push(q.entry);xp+=questXp[q.entry]?.[level-1]??0;money+=q.RewOrReqMoney;
  const fixed=[1,2,3,4].map(n=>q['RewItemId'+n]).filter(id=>items[id]);
  const choices=[1,2,3,4,5,6].map(n=>q['RewChoiceItemId'+n]).filter(id=>items[id]).sort((a,b)=>(equipmentUpgrade(c,items[b]).improvement??0)-(equipmentUpgrade(c,items[a]).improvement??0));
  for(const id of [...fixed,...choices.slice(0,1)])award(p,id,'quest');
 }
 // Travel, supplies and repair consume 20% of gross adventure income.
 money=Math.floor(money*.8);p.wallet+=money;gain(p,xp*multiplier,ceiling);
 p.lastAdventure={level,kills,questId:q?.entry??null,xp:Math.floor(xp*multiplier),money};
 note(p,`${level}级历练：击败${kills}个敌人${q?'并完成任务':''}，获得${Math.floor(xp*multiplier)}经验、${(money/10000).toFixed(2)}金。`);
}
const fiveMan=()=>dungeonJournal.filter(d=>d.playable&&dungeonDefinitions[d.id]?.recommendedLevel>=52&&dungeonDefinitions[d.id]?.recommendedLevel<=60);
export function fiveManUpgrades(p){return fiveMan().flatMap(d=>d.bosses.flatMap(b=>b.loot.filter(l=>!l.shared&&itemAvailableInPhase(l.id,contentPhase(p.unit))&&items[l.id]?.InventoryType&&equipmentUpgrade(p.unit,items[l.id]).need).map(l=>({dungeon:d,boss:b,id:l.id}))));}
export function recordNpcFiveMan(p,runKey,wall){
 const e=p.endgame??={};const day=Math.floor(wall/86400000),week=raidWeek(wall);
 if(e.day!==day){e.day=day;e.daily=0;}
 if(e.week!==week){e.week=week;e.weekly=0;}
 e.recentRuns??=[];if(e.recentRuns.includes(runKey))return false;
 e.recentRuns=[...e.recentRuns,runKey].slice(-64);e.daily++;e.weekly++;return true;
}
export function recordNpcRaidVisit(p,raidId,wall){p.raidAttendance??={};p.raidAttendance[raidId]=raidWeek(wall);}
export function npcRaidFallbackEligible(p,raidId,wall){return npcRaidEligible(p,raidId,wall)&&p.raidAttendance?.[raidId]!==raidWeek(wall);}
export function recordNpcRaidAttendance(p,raidId,wall,bossId,source='player'){
 recordNpcRaidVisit(p,raidId,wall);
 p.raidLockouts??={};const week=raidWeek(wall),previous=p.raidLockouts[raidId];
 const lock=previous?.week===week?previous:{week,bosses:[],source};
 if(bossId&&!lock.bosses.includes(bossId))lock.bosses.push(bossId);
 p.raidLockouts[raidId]=lock;
}
export function npcRaidEligible(p,raidId,wall){return p.unit.level===60&&p.raidLockouts?.[raidId]?.week!==raidWeek(wall);}
function simulateFiveMan(p,wall){
 const e=p.endgame??={};
 const gearKey=JSON.stringify([contentPhase(p.unit),p.unit.equipment]);
 if(e.gearKey!==gearKey){e.gearKey=gearKey;e.targets=[...new Set(fiveManUpgrades(p).map(u=>u.dungeon.id))];e.graduated=!e.targets.length;}
 if(e.graduated)return;
 const day=Math.floor(wall/86400000),week=raidWeek(wall);
 if((e.day===day&&e.daily>=NPC_PROGRESS.dailyRuns)||(e.week===week&&e.weekly>=NPC_PROGRESS.weeklyRuns))return;
 const duration=p.raidProfile.skill==='expert'?30*60000:NPC_PROGRESS.dungeonMs;
 if((e.activityMs??0)<duration)return;e.activityMs-=duration;
 const dungeonId=e.targets[Math.floor(rng(p)*e.targets.length)],dungeon=fiveMan().find(d=>d.id===dungeonId);
 recordNpcFiveMan(p,`simulation:${++p.steps}:${wall}`,wall);let won=0;
 // A targeted five-man outing covers at most six bosses, rather than every optional branch.
 const bosses=dungeon.bosses.map(b=>({b,tie:rng(p)})).sort((a,b)=>a.tie-b.tie).slice(0,6).map(v=>v.b);
 for(const boss of bosses){
  const creature=creatures[boss.id];
  for(const drop of rollClassicLoot(creatureLoot[creature?.LootId]??[],referenceLoot,()=>rng(p),r=>r.ChanceOrQuestChance>=0&&!r.condition_id)){
   // A five-player group competes for needs; vendor proceeds are split five ways.
   if(itemAvailableInPhase(drop.itemId,contentPhase(p.unit))&&equipmentUpgrade(p.unit,items[drop.itemId]??{}).need&&rng(p)<.5){if(award(p,drop.itemId,'dungeon'))won++;}
   else p.wallet+=Math.floor((items[drop.itemId]?.SellPrice??0)*drop.count/5);
  }
  p.wallet+=Math.floor(((creature?.MinLootGold??0)+(creature?.MaxLootGold??0))/10);
 }
 const repair=Math.min(p.wallet,2*10000);p.wallet-=repair;
 delete e.gearKey;e.graduated=fiveManUpgrades(p).length===0;note(p,`模拟挑战${dungeon.name}，获得${won}件装备提升，补给维修${repair/10000}金。`);
}
/** Only the public pool passes verified online activity time, never offline catch-up. */
export function progressPublicNpc(p,elapsed,wall,ceiling=60,multiplier=2){
 if(elapsed<=0)return;
 p.activityMs=(p.activityMs??0)+elapsed;
 if(p.unit.level===60){const e=p.endgame??={};e.activityMs=Math.min(NPC_PROGRESS.dungeonMs*2,(e.activityMs??0)+elapsed*.75);simulateFiveMan(p,wall);}
 while(p.activityMs>=NPC_PROGRESS.stepMs){p.activityMs-=NPC_PROGRESS.stepMs;p.steps++;
  npcIncome(p,NPC_PROGRESS.stepMs,.25);
  if(p.unit.level<60)levelingStep(p,ceiling,multiplier);
  const purchase=buyNpcLuxury(p,wall);if(purchase)note(p,purchase);
 }
 p.unit.money=p.wallet;const st=stats(p.unit);p.unit.hp=st.maxHp;p.unit.mana=st.maxMana;
}
/** One loot table roll per boss and 40 seats per raid. Public participants occupy
 * a subset of those seats; other raiders absorb their share of drops/dividends. */
export function simulateNpcRaid(profiles,raidId,wall){
 const candidates=profiles.filter(p=>npcRaidFallbackEligible(p,raidId,wall));
 for(let offset=0;offset<candidates.length;offset+=40){
  const group=candidates.slice(offset,offset+40),random=group[0];let pot=0;
  for(const p of group)recordNpcRaidAttendance(p,raidId,wall,null,'simulation');
  for(const boss of raidBossesFor(raidId)){
   const s={...random.unit,rngState:random.rngState,completed:{},quests:{},goldRaid:{}};
   const loot=rollRaidLoot(s,boss.id);random.rngState=s.rngState;
   for(const p of group)recordNpcRaidAttendance(p,raidId,wall,boss.id,'simulation');
   for(const drop of loot){
    const item=items[drop.itemId];if(!item||!itemAvailableInPhase(drop.itemId,contentPhase(random.unit))||rng(random)>=group.length/40)continue;
    const bids=group.map(p=>({p,limit:npcBidValuation({...p.unit,money:p.wallet,goldProfile:{personality:p.raidProfile.personality,initialWallet:p.wallet}},item,item.Quality>=4,s,{variation:1}).limit})).filter(b=>b.limit>=5*10000).sort((a,b)=>b.limit-a.limit);
    if(!bids.length)continue;
    const {p,limit}=bids[0],price=Math.min(limit,Math.max(5*10000,(bids[1]?.limit??Math.floor(limit*.5))+10000));
    if(!award(p,drop.itemId,'raid'))continue;p.wallet-=price;pot+=price;
   }
  }
  const dividend=Math.floor(pot*.95/40);
  for(const p of group){p.wallet+=dividend;p.unit.money=p.wallet;p.raidRuns++;const skill=p.raidRuns>=3?'expert':p.raidProfile.skill==='novice'?'regular':p.raidProfile.skill;if(skill!==p.raidProfile.skill){p.raidProfile.skill=skill;train(p);}note(p,`本 CD 未参团，模拟参加${raidId}金团，分红${(dividend/10000).toFixed(2)}金；竞拍按实际余额扣款。`);}
 }
}
