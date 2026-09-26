import {ensureNpcWorld,progressNpcWorld,syncNpcWorld,recordNpcRaid} from './npc-world.js';
import {equipNpcItem} from './npc-equipment.js';
import {raidAttemptReview} from './raid-command.js';
import {raidAttunementReason} from './raid-attunement.js';
import {raidRouteState,raidMapView,raidBossesFor,raidNameFor} from './molten-core-content.js';
import {navigateRaid,advanceRaid,pauseRaid,settleRaidRoute,raidLootBlocksNavigation} from './molten-core-navigation.js';
import {raidNextMechanics} from './molten-core-mechanics.js';
import {items,nameOf} from './catalog.js';
import {rng,stats,makeItem,canEquip,slotOf,log} from './character.js';
import {combatRole} from './combat-roles.js';
import {beginMoltenCoreBattle} from './molten-core-battle.js';
import {moltenCoreBosses,defaultRaidTactics} from './molten-core-encounter.js';
import {restoreRaidMember} from './raid-recovery.js';
import {raidLoot,rollRaidLoot,canReceiveRaidLoot,raidItemIsEquipment} from './raid-rewards.js';
import {GOLD,createGoldApplicants,goldNpcView,npcPriceLimit,prepareGoldNpc,personalities} from './gold-raid-npcs.js';
import {meterRows} from '../../../sim-core/src/combat-meter.js';

export const GOLD_RAID_ID='molten-core-gold';
export const goldCommands=['goldNavigate','goldPause','goldRules','goldPublish','goldInvite','goldRecommend','goldLaunch','goldStart','goldRecover','goldTactics','goldBid','goldPass','goldAuctionStep','goldSettle'];
const need=(ok,text)=>{if(!ok)throw new Error(text);};
const active=s=>{need(s.goldRaid?.active,'请先创建金团。');return s.goldRaid;};
const announce=(s,text)=>{const g=s.goldRaid;g.chat.push({at:s.clock,text});g.chat=g.chat.slice(-50);};
const gold=amount=>`${(amount/GOLD).toFixed(1)}金`;
const WEEK=604800000,weekAt=at=>Math.floor((at-345600000)/WEEK);
export function enterGoldRaid(s,raidId='molten-core'){
 need(['molten-core','onyxias-lair'].includes(raidId),'未知团队副本。');
 need(s.level===60&&!s.npcPlayer&&s.hp>0&&!s.combat&&!s.dungeon&&!s.goldRaid?.active&&s.activity.type==='idle','需要空闲且存活的60级团长。');
 need(!raidAttunementReason(s,raidId),raidAttunementReason(s,raidId));
 ensureNpcWorld(s);syncNpcWorld(s);progressNpcWorld(s);
 const serial=(s.goldRaid?.serial||0)+1,week=weekAt(s.wallAt);
 s.goldRaidSaves??={};const saved=s.goldRaidSaves[raidId];
 const progress=saved?.week===week?saved:{week,cleared:[],...raidRouteState()};
 need(progress.cleared.length<raidBossesFor(raidId).length,'本周已全通该金团，请下周再来。');
 s.party=[];
 s.goldRaid={...structuredClone(progress),raidId,active:true,serial,phase:'draft',rules:{leaderFee:5,dpsBonus:10,supportBonus:10},tactics:{...defaultRaidTactics},applicants:[],selected:[],coreIds:[s.id],seats:[],contributions:{},attempts:[],lots:[],auction:null,sales:[],pot:0,paidOut:0,chat:[],settlement:null,recoverUntil:0,autoAdvance:false,destination:null};
 s.activity={type:'idle'};s.lastCombat=null;announce(s,`你创建了${raidNameFor(raidId)}金团。先公告分金规则，再邀请24名熟悉的冒险者。本周进度保留。`);
}
function inPhase(g,...phases){need(phases.includes(g.phase),'当前阶段不能执行此操作。');}
function roleCounts(actors){return {tank:actors.filter(c=>combatRole(c)==='tank').length,healer:actors.filter(c=>combatRole(c)==='healer').length,damage:actors.filter(c=>!['tank','healer'].includes(combatRole(c))).length};}
function bidder(s,id){return id==='player'?s:s.party.find(c=>c.goldNpc&&c.id===id);}
function cash(s,id){const b=bidder(s,id);return b?.money||0;}
function changeCash(s,id,amount){const b=bidder(s,id);need(b,'竞拍者不存在。');b.money+=amount;}
function schedule(s){s.goldRaid.auction.nextRoundAt=s.clock+4000;}
function nextLot(s){
 const g=s.goldRaid,lot=g.lots.shift();
 if(!lot){g.auction=null;return;}
 const item=items[lot.itemId];
 g.auction={...lot,price:0,leader:null,recipient:null,opening:lot.rare?50*GOLD:10*GOLD,step:lot.rare?25*GOLD:5*GOLD,quiet:0,round:0,playerPassed:false,limits:Object.fromEntries(s.party.filter(c=>c.goldNpc).map(c=>[c.id,npcPriceLimit(c,item,lot.rare,s)])),bids:[]};
 announce(s,`开始竞拍：${nameOf('items',item.entry)} ×${lot.count}${lot.rare?'（传说）':''}。`);schedule(s);
}
function bid(s,id,amount,recipient=null,quotedMinimum=null){
 const g=s.goldRaid,a=g.auction;
 need(a,'当前没有拍卖。');
 need(Number.isSafeInteger(amount)&&amount>0,'出价必须是有效整数。');
 need(id!==a.leader,'你已经是最高出价者。');
 need(amount<=cash(s,id),'金币不足，不能透支竞拍。');
 if(id==='player'){const target=[s,...s.party].find(c=>g.coreIds.includes(c.id)&&c.id===recipient);need(target&&canReceiveRaidLoot(target,items[a.itemId]),'你的角色不符合该物品的领取条件。');}
 const minimum=a.price?a.price+a.step:a.opening;
 // Commit competing bids computed during command catch-up instead of rolling
 // them back and returning the same stale quote on the next snapshot.
 if(id==='player'&&amount<minimum&&Number.isSafeInteger(quotedMinimum)&&quotedMinimum>0&&amount>=quotedMinimum){
  a.bidNotice='NPC 已抢先加价，本次未扣款。最低价已更新，请确认后重新出价。';
  schedule(s);return;
 }
 need(amount>=minimum,'出价低于起拍价或最低加价。');
 if(id==='player'){a.playerPassed=false;a.bidNotice=null;}
 if(a.leader)changeCash(s,a.leader,a.price);
 changeCash(s,id,-amount);a.leader=id;a.price=amount;a.recipient=recipient;a.quiet=0;
 a.bids.push({name:id==='player'?s.name:s.party.find(c=>c.id===id).name,amount});a.bids=a.bids.slice(-15);
 announce(s,`${a.bids.at(-1).name} 出价 ${gold(amount)}。`);schedule(s);
}
function award(s){
 const g=s.goldRaid,a=g.auction,item=items[a.itemId];
 if(a.leader){
  const instance={...makeItem(s,a.itemId,a.count),raidSource:'gold:'+a.bossId};
  if(a.leader==='player')s.pending.push(instance);
  else{const c=s.party.find(c=>c.id===a.leader);if(!raidItemIsEquipment(a.itemId))(c.raidCollection??=[]).push(instance);else if(s.combat)(c.raidPendingEquipment??=[]).push(instance);else if(!equipNpcItem(c,instance))(c.raidCollection??=[]).push(instance);}
  g.pot+=a.price;
 }
 const winner=a.leader==='player'?s.name:s.party.find(c=>c.id===a.leader)?.name;
 g.sales.push({id:a.id,itemId:a.itemId,count:a.count,name:nameOf('items',a.itemId),rare:a.rare,winner:winner||'流拍',winnerId:a.leader,recipient:a.recipient,price:a.price});
 announce(s,a.leader?`${nameOf('items',a.itemId)} 以 ${gold(a.price)} 成交给 ${winner}。`:`${nameOf('items',a.itemId)} 流拍。`);
 nextLot(s);
}
export function goldAuctionStep(s){
 const g=active(s),a=g.auction;need(a,'当前没有拍卖。');a.round++;
 const minimum=a.price?a.price+a.step:a.opening;
 const bidders=s.party.filter(c=>c.goldNpc&&c.id!==a.leader&&Math.min(a.limits[c.id]||0,c.money)>=minimum);
 if(bidders.length){
  const c=bidders[Math.floor(rng(s)*bidders.length)],p=c.goldProfile,limit=Math.min(a.limits[c.id],c.money);
  let offer=minimum;
  if(['whale','impulsive'].includes(p.personality)||a.round>12)offer=Math.min(limit,Math.max(minimum,Math.ceil((minimum*1.3)/a.step)*a.step));
  bid(s,c.id,offer);
  if(p.personality==='impulsive'&&rng(s)<.4)announce(s,`${c.name}：别劝了，再加！`);
 }else{a.quiet++;announce(s,`无人加价，第 ${a.quiet} 次询价。`);if(a.quiet>=3)award(s);else schedule(s);}
}
export function goldRaidAction(s,a){
 const g=active(s);
 if(a.type==='goldPause'){pauseRaid(s,g);return;}
 // Auction commands operate independently of combat, travel and recovery.
 if(['goldBid','goldPass','goldAuctionStep'].includes(a.type)){
  need(g.auction&&a.lotId===g.auction.id,'拍品已更新，请重新出价。');
  if(a.type==='goldBid')bid(s,'player',a.amount,a.recipient,a.quotedMinimum);
  else if(a.type==='goldPass'){need(g.auction.leader!=='player','你已领先，不能放弃已托管的出价。');g.auction.playerPassed=true;announce(s,`${s.name}：这件先让。`);goldAuctionStep(s);}
  else goldAuctionStep(s);
  return;
 }
 need(!s.combat,'战斗结束后再处理团务。');need(!g.recoverUntil,'团队正在休整。');
 if(a.type==='goldRules'){
  inPhase(g,'draft');const r=a.rules;
  need(r&&['leaderFee','dpsBonus','supportBonus'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<=(k==='leaderFee'?10:20)),'团长抽成0—10%，DPS与坦奶奖金各0—20%。');
  g.rules={leaderFee:r.leaderFee,dpsBonus:r.dpsBonus,supportBonus:r.supportBonus};
 }else if(a.type==='goldPublish'){inPhase(g,'draft');g.phase='recruiting';g.applicants=createGoldApplicants(s);announce(s,`公告：团长${g.rules.leaderFee}% / DPS前三${g.rules.dpsBonus}% / 坦奶${g.rules.supportBonus}%，余款均分。申请者已阅读并接受，规则锁定。`);
 }else if(a.type==='goldInvite'){inPhase(g,'recruiting');need(g.applicants.some(c=>c.id===a.id),'申请已失效。');if(g.selected.includes(a.id))g.selected=g.selected.filter(id=>id!==a.id);else{need(g.selected.length<24,'团队最多邀请24名NPC玩家。');g.selected.push(a.id);}
 }else if(a.type==='goldRecommend'){
  inPhase(g,'recruiting');const priority=a.priority||'balanced';need(['balanced','progress','buyers','friends'].includes(priority),'未知组团偏好。');g.priority=priority;const core=[s,...s.party],picked=[];
  const score=c=>({expert:3,regular:2,novice:1}[c.goldProfile.skill])*(priority==='progress'?200:100)+(c.goldProfile.friend?(priority==='friends'?350:30):0)+Math.min(20,c.goldProfile.runs)+(priority==='buyers'?Math.min(300,c.money/GOLD):0)+Object.values(c.equipment).reduce((n,e)=>n+(items[e.id]?.ItemLevel||0),0)/20;
  const pool=[...g.applicants].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
  for(const [role,n]of [['tank',2],['healer',5]]){let missing=Math.max(0,n-core.filter(c=>combatRole(c)===role).length);for(const c of pool.filter(c=>combatRole(c)===role).slice(0,missing))picked.push(c);}
  // Cover dispels and tranquilizing shot before filling damage seats.
  for(const classId of [5,8,3])if(![...core,...picked].some(c=>c.classId===classId)){const c=pool.find(c=>c.classId===classId&&!picked.includes(c));if(c)picked.push(c);}
  for(const c of pool.filter(c=>!picked.includes(c)&&!['tank','healer'].includes(combatRole(c))))if(picked.length<24)picked.push(c);
  for(const c of pool)if(picked.length<24&&!picked.includes(c))picked.push(c);
  g.selected=picked.slice(0,24).map(c=>c.id);
 }else if(a.type==='goldLaunch'){
  inPhase(g,'recruiting');need(g.selected.length===24,'请先邀请24名60级NPC玩家。');
  const chosen=g.selected.map(id=>g.applicants.find(c=>c.id===id)),actors=[s,...s.party,...chosen],counts=roleCounts(actors);
  need(counts.tank>=2&&counts.healer>=5,'全团至少需要2名坦克、5名治疗。');
  need(chosen.every(Boolean)&&new Set(g.selected).size===24,'申请名单无效。');s.party.push(...chosen);recordNpcRaid(s);g.seats=actors.map(c=>({id:c.id,name:c.name,role:combatRole(c),core:!c.goldNpc}));g.applicants=[];g.phase='camp';announce(s,'25人名单已锁定。首领掉落全部进入公开拍卖，金币到账后才能分金。');
 }else if(a.type==='goldTactics'){inPhase(g,'camp');need(a.patch&&Object.entries(a.patch).every(([k,v])=>Object.hasOwn(defaultRaidTactics,k)&&typeof v==='boolean'),'战术无效。');Object.assign(g.tactics,a.patch);
 }else if(a.type==='goldRecover'){inPhase(g,'camp');g.autoAdvance=false;g.recoverUntil=s.clock+10000;s.activity={type:'goldRecovery',endsAt:g.recoverUntil};
 }else if(a.type==='goldStart'||a.type==='goldNavigate'){
  inPhase(g,'camp');navigateRaid(s,g,a.destination||a.bossId,id=>launchGoldEncounter(s,id));
 } else if(a.type==='goldSettle'){inPhase(g,'camp','draft','recruiting');finishGoldRun(s);}
 else throw new Error('未知金团指令。');
}
function launchGoldEncounter(s,id){
 for(const c of [s,...s.party]){
  if(c.raidPendingEquipment){for(const item of c.raidPendingEquipment)if(!equipNpcItem(c,item))(c.raidCollection??=[]).push(item);c.raidPendingEquipment=[];}
  restoreRaidMember(c,s);if(c.goldNpc)prepareGoldNpc(s,c);
 }
 beginMoltenCoreBattle(s,id,s.goldRaid.tactics);s.goldRaid.phase='combat';
}
export function advanceGoldRoute(s){if(s.goldRaid?.phase==='camp')advanceRaid(s,s.goldRaid,id=>launchGoldEncounter(s,id));}
export function settleGoldRaid(s){
 const g=s.goldRaid;if(!g?.active)return;
 if(g.recoverUntil&&s.clock>=g.recoverUntil){for(const c of [s,...s.party])restoreRaidMember(c,s);g.recoverUntil=0;s.activity={type:'idle'};}
 const b=s.lastCombat;if(s.combat||g.phase!=='combat'||!b?.raidEncounter||b.raidMode!=='gold'||b.goldSettled)return;
 b.goldSettled=true;const won=!b.abandoned&&b.enemies.every(e=>e.hp<=0),seconds=Math.max(1,(b.endedAt-b.startedAt)/1000);
 g.attempts.push({review:raidAttemptReview(s,b),bossId:g.activeBoss,won,seconds,deaths:[s,...s.party].filter(c=>c.hp<=0).length});g.attempts=g.attempts.slice(-20);
 const rows=meterRows(b,s.clock);
 for(const c of [s,...s.party]){const row=rows.find(r=>r.actorId===c.id),p=c.goldProfile;if(p){p.damage+=row?.damage||0;p.healing+=row?.healing||0;p.seconds+=seconds;if(c.hp<=0)p.deaths++;}
  if(won){const entry=g.contributions[c.id]??={damage:0,healing:0,seconds:0,kills:0};entry.damage+=row?.damage||0;entry.healing+=row?.healing||0;entry.seconds+=seconds;entry.kills++;}}
 g.phase='camp';s.activity={type:'idle'};
 const isTrash=b.raidEncounter.kind==='trash',encounterId=b.raidEncounter.id;
 if(won&&!(isTrash?g.clearedPacks:g.cleared).includes(encounterId)){
  const loot=rollRaidLoot(s,encounterId);
  if(!isTrash)g.cleared.push(encounterId);
  announce(s,`${isTrash?'怪物群':raidBossesFor(g.raidId).find(b=>b.id===encounterId).name} 已击败。掉落 ${loot.length} 组战利品。`);
  for(const [i,drop]of loot.entries()){
   if(drop.quest){s.pending.push({...makeItem(s,drop.itemId,drop.count),raidSource:'gold:'+encounterId});continue;}
   g.lots.push({id:`${g.serial}:${encounterId}:${i}`,bossId:encounterId,...drop,rare:items[drop.itemId].Quality===5});
  }
  settleRaidRoute(s,g,b,true);s.goldRaidSaves[g.raidId]={week:g.week,cleared:[...g.cleared],clearedPacks:[...g.clearedPacks],locationId:g.locationId};if(!g.auction)nextLot(s);
 }else {settleRaidRoute(s,g,b,false);announce(s,'本次挑战失败。没有拍卖收入，已成交金币与已击败首领保留。休整后可重试。');}
}
function split(amount,seats,field,ledger){if(!seats.length)return amount;const each=Math.floor(amount/seats.length),remainder=amount%seats.length;seats.forEach((seat,i)=>ledger[seat.id][field]+=each+(i<remainder?1:0));return 0;}
export function finishGoldRun(s){
 const g=active(s);need(!g.auction&&!g.lots.length&&!s.combat,'战斗与拍卖完成后才能分金。');need(!g.settlement,'本团已经完成分金。');
 const eligible=g.seats.filter(c=>g.contributions[c.id]?.kills>0),ledger=Object.fromEntries(eligible.map(c=>[c.id,{...c,base:0,dpsBonus:0,supportBonus:0}]));
 const fee=eligible.length?Math.floor(g.pot*g.rules.leaderFee/100):0;
 const dps=eligible.filter(c=>!['tank','healer'].includes(c.role)).sort((a,b)=>(g.contributions[b.id]?.damage||0)-(g.contributions[a.id]?.damage||0)||a.id.localeCompare(b.id)).slice(0,3);
 const supports=eligible.filter(c=>['tank','healer'].includes(c.role));
 let base=g.pot-fee;const dpsPool=Math.floor(g.pot*g.rules.dpsBonus/100),supportPool=Math.floor(g.pot*g.rules.supportBonus/100);
 if(dps.length){split(dpsPool,dps,'dpsBonus',ledger);base-=dpsPool;}if(supports.length){split(supportPool,supports,'supportBonus',ledger);base-=supportPool;}split(base,eligible,'base',ledger);
 const rows=Object.values(ledger).map(r=>({...r,total:r.base+r.dpsBonus+r.supportBonus,dps:g.contributions[r.id].damage/g.contributions[r.id].seconds}));
 let playerIncome=fee;for(const r of rows){if(r.core)playerIncome+=r.total;else{const npc=s.party.find(c=>c.id===r.id);if(npc)npc.money+=r.total;}}
 need(rows.reduce((n,r)=>n+r.total,fee)===g.pot,'账本不平，不能分金。');
 for(const c of s.party)for(const item of c.raidPendingEquipment?.splice(0)||[])if(!equipNpcItem(c,item))(c.raidCollection??=[]).push(item);
 s.money+=playerIncome;g.paidOut=g.pot;g.settlement={pot:g.pot,fee,playerIncome,rows};recordNpcRaid(s,true);g.phase='settled';g.autoAdvance=false;s.activity={type:'idle'};announce(s,`分金完成：总收入 ${gold(g.pot)}，你收到 ${gold(playerIncome)}。`);
}
export function emergencyGoldExit(s){
 const g=s.goldRaid;if(!g?.active)return;
 if(g.auction?.leader)changeCash(s,g.auction.leader,g.auction.price);
 g.auction=null;g.lots=[];s.combat=null;
 if(!g.settlement)finishGoldRun(s);
 syncNpcWorld(s);g.active=false;g.recoverUntil=0;g.autoAdvance=false;s.party=[];s.activity={type:'idle'};
}
export function leaveGoldRaid(s){const g=active(s);need(g.phase==='settled','请先结束拍卖并结算本团，即使提前散团也需要分金。');syncNpcWorld(s);g.active=false;s.party=[];s.activity={type:'idle'};}
export function goldRaidView(s){
 const g=s.goldRaid,actors=[s,...s.party],r=s.combat?.raidEncounter;
 if(!g?.active)return {active:false,raids:['molten-core','onyxias-lair'].map(raidId=>{
  const saved=s.goldRaidSaves?.[raidId],cleared=saved?.week===weekAt(s.wallAt)?saved.cleared:[];
  const reason=raidAttunementReason(s,raidId)||(cleared.length===raidBossesFor(raidId).length?'本周已全通，下周重置。':s.level!==60||s.hp<=0?'需要存活的60级团长。':s.combat||s.dungeon||s.activity.type!=='idle'?'请先结束当前活动。':'');
  return {id:raidId+'-gold',name:raidNameFor(raidId),canEnter:!reason,reason,cleared:cleared.length,bossCount:raidBossesFor(raidId).length};
 }),previous:g?.settlement||null};
 const a=g.auction;
 return {map:raidMapView(s,g,g.phase==='camp'&&!s.combat&&!g.recoverUntil&&!raidLootBlocksNavigation(s)&&actors.every(c=>c.hp>0)),active:true,name:raidNameFor(g.raidId),requiredSeats:24,priority:g.priority||'balanced',phase:g.phase,rules:g.rules,tactics:g.tactics,selected:g.selected,applicants:g.applicants.map(goldNpcView),members:s.party.filter(c=>c.goldNpc).map(goldNpcView),core:actors.filter(c=>g.coreIds.includes(c.id)).map(c=>({id:c.id,name:c.name,role:combatRole(c),canBid:a?canReceiveRaidLoot(c,items[a.itemId]):false})),roles:roleCounts(g.phase==='recruiting'?[...actors,...g.applicants.filter(c=>g.selected.includes(c.id))]:actors),cleared:g.cleared,bosses:raidBossesFor(g.raidId).map(b=>({...b,loot:(raidLoot[b.id]||[]).map(id=>({id,name:nameOf('items',id)}))})),activeBoss:g.activeBoss,pot:g.pot,paidOut:g.paidOut,settlement:g.settlement,sales:g.sales,chat:g.chat,attempts:g.attempts,remaining:Math.max(0,g.recoverUntil-s.clock),recovering:!!g.recoverUntil,
 auction:a?{id:a.id,name:nameOf('items',a.itemId),itemId:a.itemId,count:a.count,rare:a.rare,price:a.price,minimum:a.price?a.price+a.step:a.opening,step:a.step,leader:a.leader,winner:a.leader==='player'?s.name:s.party.find(c=>c.id===a.leader)?.name,quiet:a.quiet,bidNotice:a.bidNotice||null,bids:a.bids,remainingLots:g.lots.length,nextRoundAt:a.nextRoundAt,playerPassed:a.playerPassed}:null,
 nextMechanics:raidNextMechanics(r)};
}
