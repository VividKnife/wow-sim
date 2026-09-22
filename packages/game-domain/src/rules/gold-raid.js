import {raidRouteState,raidMapView} from './molten-core-content.js';
import {navigateRaid,advanceRaid,pauseRaid,settleRaidRoute} from './molten-core-navigation.js';
import {raidNextMechanics} from './molten-core-mechanics.js';
import {items,nameOf} from './catalog.js';
import {rng,stats,makeItem,canEquip,slotOf,log} from './character.js';
import {combatRole} from './combat-roles.js';
import {beginMoltenCoreBattle} from './molten-core-battle.js';
import {moltenCoreBosses,defaultRaidTactics} from './molten-core-encounter.js';
import {restoreRaidMember,raidLoot} from './guild-raid.js';
import {GOLD,createGoldApplicants,goldNpcView,npcPriceLimit,prepareGoldNpc,personalities} from './gold-raid-npcs.js';
import {meterRows} from '../../../sim-core/src/combat-meter.js';

export const GOLD_RAID_ID='molten-core-gold';
export const goldCommands=['goldNavigate','goldPause','goldRules','goldPublish','goldRefresh','goldInvite','goldRecommend','goldLaunch','goldStart','goldRecover','goldTactics','goldBid','goldPass','goldAuctionStep','goldSettle'];
const need=(ok,text)=>{if(!ok)throw new Error(text);};
const active=s=>{need(s.goldRaid?.active,'请先创建金团。');return s.goldRaid;};
const announce=(s,text)=>{const g=s.goldRaid;g.chat.push({at:s.clock,text});g.chat=g.chat.slice(-50);};
const gold=amount=>`${(amount/GOLD).toFixed(1)}金`;
export function enterGoldRaid(s){
 need(s.level===60&&s.growthPolicy!=='companion'&&!s.combat&&!s.dungeon&&!s.guildRaid?.active&&!s.goldRaid?.active,'需要空闲的60级团长。');
 need(s.party.length===4&&[s,...s.party].every(c=>c.level===60&&c.hp>0),'请带上五名存活的60级核心成员。');
 const serial=(s.goldRaid?.serial||0)+1;
 s.goldRaid={...raidRouteState(),active:true,serial,phase:'draft',rules:{leaderFee:5,dpsBonus:10,supportBonus:10},tactics:{...defaultRaidTactics},applicants:[],applicantSequence:0,refreshes:0,selected:[],coreIds:[s,...s.party].map(c=>c.id),seats:[],contributions:{},cleared:[],attempts:[],lots:[],auction:null,sales:[],pot:0,paidOut:0,chat:[],settlement:null,recoverUntil:0};
 s.activity={type:'idle'};s.lastCombat=null;announce(s,'你创建了熔火之心金团。先公告分金规则，再招募20名玩家。');
}
function inPhase(g,...phases){need(phases.includes(g.phase),'当前阶段不能执行此操作。');}
function roleCounts(actors){return {tank:actors.filter(c=>combatRole(c)==='tank').length,healer:actors.filter(c=>combatRole(c)==='healer').length,damage:actors.filter(c=>!['tank','healer'].includes(combatRole(c))).length};}
function bidder(s,id){return id==='player'?s:s.party.find(c=>c.goldNpc&&c.id===id)?.goldProfile;}
function cash(s,id){const b=bidder(s,id);return id==='player'?b.money:b?.wallet||0;}
function changeCash(s,id,amount){const b=bidder(s,id);need(b,'竞拍者不存在。');if(id==='player')b.money+=amount;else b.wallet+=amount;}
function schedule(s){s.activity={type:'goldAuction',endsAt:s.clock+4000};}
function nextLot(s){
 const g=s.goldRaid,lot=g.lots.shift();
 if(!lot){g.auction=null;g.phase='camp';s.activity={type:'idle',reason:'拍卖结束，可继续挑战或结算分金。'};return;}
 const item=items[lot.itemId];
 g.auction={...lot,price:0,leader:null,recipient:null,opening:lot.rare?50*GOLD:10*GOLD,step:lot.rare?25*GOLD:5*GOLD,quiet:0,round:0,playerPassed:false,limits:Object.fromEntries(s.party.filter(c=>c.goldNpc).map(c=>[c.id,npcPriceLimit(c,item,lot.rare,s)])),bids:[]};
 g.phase='auction';announce(s,`开始竞拍：${nameOf('items',item.entry)}${lot.rare?'（稀有·阶段毕业）':''}。`);schedule(s);
}
function bid(s,id,amount,recipient=null,quotedMinimum=null){
 const g=s.goldRaid,a=g.auction;
 need(a&&g.phase==='auction','当前没有拍卖。');
 need(Number.isSafeInteger(amount)&&amount>0,'出价必须是有效整数。');
 need(id!==a.leader,'你已经是最高出价者。');
 need(amount<=cash(s,id),'金币不足，不能透支竞拍。');
 if(id==='player'){const target=[s,...s.party].find(c=>g.coreIds.includes(c.id)&&c.id===recipient);need(target&&canEquip(target,items[a.itemId]),'请选择能使用装备的核心队员。');}
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
  const instance={...makeItem(s,a.itemId),bound:true,raidSource:'gold:'+a.bossId};
  if(a.leader==='player')s.pending.push(instance);
  else{const c=s.party.find(c=>c.id===a.leader);c.equipment[slotOf(item)]=instance;}
  g.pot+=a.price;
 }
 const winner=a.leader==='player'?s.name:s.party.find(c=>c.id===a.leader)?.name;
 g.sales.push({id:a.id,itemId:a.itemId,name:nameOf('items',a.itemId),rare:a.rare,winner:winner||'流拍',winnerId:a.leader,recipient:a.recipient,price:a.price});
 announce(s,a.leader?`${nameOf('items',a.itemId)} 以 ${gold(a.price)} 成交给 ${winner}。`:`${nameOf('items',a.itemId)} 流拍。`);
 nextLot(s);
}
export function goldAuctionStep(s){
 const g=active(s);inPhase(g,'auction');const a=g.auction;a.round++;
 const minimum=a.price?a.price+a.step:a.opening;
 const bidders=s.party.filter(c=>c.goldNpc&&c.id!==a.leader&&Math.min(a.limits[c.id]||0,c.goldProfile.wallet)>=minimum);
 if(bidders.length){
  const c=bidders[Math.floor(rng(s)*bidders.length)],p=c.goldProfile,limit=Math.min(a.limits[c.id],p.wallet);
  let offer=minimum;
  if(['whale','impulsive'].includes(p.personality)||a.round>12)offer=Math.min(limit,Math.max(minimum,Math.ceil((minimum*1.3)/a.step)*a.step));
  bid(s,c.id,offer);
  if(p.personality==='impulsive'&&rng(s)<.4)announce(s,`${c.name}：别劝了，再加！`);
 }else{a.quiet++;announce(s,`无人加价，第 ${a.quiet} 次询价。`);if(a.quiet>=3)award(s);else schedule(s);}
}
export function goldRaidAction(s,a){
 const g=active(s);
 if(a.type==='goldPause'){pauseRaid(s,g);return;}
 need(!s.combat,'战斗结束后再处理团务。');need(!g.recoverUntil,'团队正在休整。');
 if(a.type==='goldRules'){
  inPhase(g,'draft');const r=a.rules;
  need(r&&['leaderFee','dpsBonus','supportBonus'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<=(k==='leaderFee'?10:20)),'团长抽成0—10%，DPS与坦奶奖金各0—20%。');
  g.rules={leaderFee:r.leaderFee,dpsBonus:r.dpsBonus,supportBonus:r.supportBonus};
 }else if(a.type==='goldPublish'){inPhase(g,'draft');g.phase='recruiting';g.applicants=createGoldApplicants(s);announce(s,`公告：团长${g.rules.leaderFee}% / DPS前三${g.rules.dpsBonus}% / 坦奶${g.rules.supportBonus}%，余款均分。申请者已阅读并接受，规则锁定。`);
 }else if(a.type==='goldRefresh'){inPhase(g,'recruiting');need(g.refreshes<5,'本次招募已经发布六批申请。');g.refreshes++;g.applicants=[...g.applicants.filter(c=>g.selected.includes(c.id)),...createGoldApplicants(s,24)];
 }else if(a.type==='goldInvite'){inPhase(g,'recruiting');need(g.applicants.some(c=>c.id===a.id),'申请已失效。');if(g.selected.includes(a.id))g.selected=g.selected.filter(id=>id!==a.id);else{need(g.selected.length<20,'只剩20个NPC席位。');g.selected.push(a.id);}
 }else if(a.type==='goldRecommend'){
  inPhase(g,'recruiting');const core=[s,...s.party],picked=[];
  const score=c=>({expert:3,regular:2,novice:1}[c.goldProfile.skill])*100+Object.values(c.equipment).reduce((n,e)=>n+(items[e.id]?.ItemLevel||0),0)/20;
  const pool=[...g.applicants].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
  for(const [role,n]of [['tank',2],['healer',5]]){let missing=Math.max(0,n-core.filter(c=>combatRole(c)===role).length);for(const c of pool.filter(c=>combatRole(c)===role).slice(0,missing))picked.push(c);}
  for(const c of pool.filter(c=>!['tank','healer'].includes(combatRole(c))))if(picked.length<20)picked.push(c);
  for(const c of pool)if(picked.length<20&&!picked.includes(c))picked.push(c);
  g.selected=picked.slice(0,20).map(c=>c.id);
 }else if(a.type==='goldLaunch'){
  inPhase(g,'recruiting');need(g.selected.length===20,'请先录取20名NPC。');
  const chosen=g.selected.map(id=>g.applicants.find(c=>c.id===id)),actors=[s,...s.party,...chosen],counts=roleCounts(actors);
  need(counts.tank>=2&&counts.healer>=5,'全团至少需要2名坦克、5名治疗。');
  s.party.push(...chosen);g.seats=actors.map(c=>({id:c.id,name:c.name,role:combatRole(c),core:!c.goldNpc}));g.applicants=[];g.phase='camp';announce(s,'25人名单已锁定。首领掉落全部进入公开拍卖，金币到账后才能分金。');
 }else if(a.type==='goldTactics'){inPhase(g,'camp');need(a.patch&&Object.entries(a.patch).every(([k,v])=>Object.hasOwn(defaultRaidTactics,k)&&typeof v==='boolean'),'战术无效。');Object.assign(g.tactics,a.patch);
 }else if(a.type==='goldRecover'){inPhase(g,'camp');g.autoAdvance=false;g.recoverUntil=s.clock+10000;s.activity={type:'goldRecovery',endsAt:g.recoverUntil};
 }else if(a.type==='goldStart'||a.type==='goldNavigate'){
  inPhase(g,'camp');navigateRaid(s,g,a.destination||a.bossId,id=>launchGoldEncounter(s,id));
 }else if(a.type==='goldBid'){inPhase(g,'auction');need(a.lotId===g.auction.id,'拍品已更新，请重新出价。');bid(s,'player',a.amount,a.recipient,a.quotedMinimum);
 }else if(a.type==='goldPass'){inPhase(g,'auction');need(a.lotId===g.auction.id,'拍品已更新。');g.auction.playerPassed=true;announce(s,`${s.name}：这件先让。`);goldAuctionStep(s);
 }else if(a.type==='goldAuctionStep'){need(a.lotId===g.auction?.id,'拍品已更新。');goldAuctionStep(s);}
 else if(a.type==='goldSettle'){inPhase(g,'camp','draft','recruiting');finishGoldRun(s);}
 else throw new Error('未知金团指令。');
}
function launchGoldEncounter(s,id){
 for(const c of [s,...s.party]){restoreRaidMember(c,s);if(c.goldNpc)prepareGoldNpc(s,c);}
 beginMoltenCoreBattle(s,id,s.goldRaid.tactics);s.goldRaid.phase='combat';
}
export function advanceGoldRoute(s){if(s.goldRaid?.phase==='camp')advanceRaid(s,s.goldRaid,id=>launchGoldEncounter(s,id));}
export function settleGoldRaid(s){
 const g=s.goldRaid;if(!g?.active)return;
 if(g.recoverUntil&&s.clock>=g.recoverUntil){for(const c of [s,...s.party])restoreRaidMember(c,s);g.recoverUntil=0;s.activity={type:'idle'};}
 const b=s.lastCombat;if(s.combat||g.phase!=='combat'||!b?.raidEncounter||b.raidMode!=='gold'||b.goldSettled)return;
 b.goldSettled=true;const won=!b.abandoned&&b.enemies.every(e=>e.hp<=0),seconds=Math.max(1,(b.endedAt-b.startedAt)/1000);
 g.attempts.push({bossId:g.activeBoss,won,seconds,deaths:[s,...s.party].filter(c=>c.hp<=0).length});g.attempts=g.attempts.slice(-20);
 const rows=meterRows(b,s.clock);
 for(const c of [s,...s.party]){const row=rows.find(r=>r.actorId===c.id),p=c.goldProfile;if(p){p.damage+=row?.damage||0;p.healing+=row?.healing||0;p.seconds+=seconds;if(c.hp<=0)p.deaths++;}
  if(won){const entry=g.contributions[c.id]??={damage:0,healing:0,seconds:0,kills:0};entry.damage+=row?.damage||0;entry.healing+=row?.healing||0;entry.seconds+=seconds;entry.kills++;}}
 g.phase='camp';s.activity={type:'idle'};
 if(b.raidEncounter.kind==='trash'){
  settleRaidRoute(s,g,b,won);announce(s,won?'怪物群已清理。':'清怪失败，休整后可重试。');return;
 }
 if(won&&!g.cleared.includes(g.activeBoss)){
  g.cleared.push(g.activeBoss);announce(s,`${moltenCoreBosses.find(b=>b.id===g.activeBoss).name} 已击败。开始分配三件战利品。`);
  const pool=[...raidLoot[g.activeBoss]];
  for(let i=0;i<3;i++){const rare=i===2&&rng(s)<.3,itemId=rare?[992001,992002,992003][Math.floor(rng(s)*3)]:pool.splice(Math.floor(rng(s)*pool.length),1)[0];g.lots.push({id:`${g.serial}:${g.activeBoss}:${i}`,bossId:g.activeBoss,itemId,rare});}
  settleRaidRoute(s,g,b,true);g.autoAdvance=false;nextLot(s);
 }else {settleRaidRoute(s,g,b,false);announce(s,'本次挑战失败。没有拍卖收入，已成交金币与已击败首领保留。休整后可重试。');}
}
function split(amount,seats,field,ledger){if(!seats.length)return amount;const each=Math.floor(amount/seats.length),remainder=amount%seats.length;seats.forEach((seat,i)=>ledger[seat.id][field]+=each+(i<remainder?1:0));return 0;}
export function finishGoldRun(s){
 const g=active(s);need(!g.auction&&!s.combat,'战斗与拍卖完成后才能分金。');need(!g.settlement,'本团已经完成分金。');
 const eligible=g.seats.filter(c=>g.contributions[c.id]?.kills>0),ledger=Object.fromEntries(eligible.map(c=>[c.id,{...c,base:0,dpsBonus:0,supportBonus:0}]));
 const fee=eligible.length?Math.floor(g.pot*g.rules.leaderFee/100):0;
 const dps=eligible.filter(c=>!['tank','healer'].includes(c.role)).sort((a,b)=>(g.contributions[b.id]?.damage||0)-(g.contributions[a.id]?.damage||0)||a.id.localeCompare(b.id)).slice(0,3);
 const supports=eligible.filter(c=>['tank','healer'].includes(c.role));
 let base=g.pot-fee;const dpsPool=Math.floor(g.pot*g.rules.dpsBonus/100),supportPool=Math.floor(g.pot*g.rules.supportBonus/100);
 if(dps.length){split(dpsPool,dps,'dpsBonus',ledger);base-=dpsPool;}if(supports.length){split(supportPool,supports,'supportBonus',ledger);base-=supportPool;}split(base,eligible,'base',ledger);
 const rows=Object.values(ledger).map(r=>({...r,total:r.base+r.dpsBonus+r.supportBonus,dps:g.contributions[r.id].damage/g.contributions[r.id].seconds}));
 let playerIncome=fee;for(const r of rows){if(r.core)playerIncome+=r.total;else{const npc=s.party.find(c=>c.id===r.id);if(npc)npc.goldProfile.wallet+=r.total;}}
 need(rows.reduce((n,r)=>n+r.total,fee)===g.pot,'账本不平，不能分金。');
 s.money+=playerIncome;g.paidOut=g.pot;g.settlement={pot:g.pot,fee,playerIncome,rows};g.phase='settled';g.autoAdvance=false;s.activity={type:'idle'};announce(s,`分金完成：总收入 ${gold(g.pot)}，核心队与团长共收到 ${gold(playerIncome)}。`);
}
export function emergencyGoldExit(s){const g=s.goldRaid;if(!g?.active)return;if(g.auction?.leader==='player')s.money+=g.auction.price;g.auction=null;g.lots=[];s.combat=null;if(!g.settlement)finishGoldRun(s);g.active=false;g.recoverUntil=0;}
export function leaveGoldRaid(s){const g=active(s);need(g.phase==='settled','请先结束拍卖并结算本团，即使提前散团也需要分金。');g.active=false;s.party=s.party.filter(c=>!c.goldNpc);s.activity={type:'idle'};}
export function goldRaidView(s){
 const g=s.goldRaid,actors=[s,...s.party],r=s.combat?.raidEncounter;
 if(!g?.active)return {active:false,canEnter:s.level===60&&!s.combat&&!s.dungeon&&!s.guildRaid?.active&&s.party.length===4&&actors.every(c=>c.level===60&&c.hp>0),previous:g?.settlement||null};
 const a=g.auction;
 return {map:raidMapView(s,g,g.phase==='camp'&&!s.combat&&!g.recoverUntil&&!s.pending.length&&actors.every(c=>c.hp>0)),active:true,phase:g.phase,rules:g.rules,tactics:g.tactics,selected:g.selected,refreshes:g.refreshes,applicants:g.applicants.map(goldNpcView),members:s.party.filter(c=>c.goldNpc).map(goldNpcView),core:actors.filter(c=>g.coreIds.includes(c.id)).map(c=>({id:c.id,name:c.name,role:combatRole(c),canBid:a?canEquip(c,items[a.itemId]):false})),roles:roleCounts(g.phase==='recruiting'?[...actors,...g.applicants.filter(c=>g.selected.includes(c.id))]:actors),cleared:g.cleared,bosses:moltenCoreBosses,activeBoss:g.activeBoss,pot:g.pot,paidOut:g.paidOut,settlement:g.settlement,sales:g.sales,chat:g.chat,attempts:g.attempts,remaining:Math.max(0,g.recoverUntil-s.clock),recovering:!!g.recoverUntil,
 auction:a?{id:a.id,name:nameOf('items',a.itemId),itemId:a.itemId,rare:a.rare,price:a.price,minimum:a.price?a.price+a.step:a.opening,step:a.step,leader:a.leader,winner:a.leader==='player'?s.name:s.party.find(c=>c.id===a.leader)?.name,quiet:a.quiet,bidNotice:a.bidNotice||null,bids:a.bids,remainingLots:g.lots.length,playerPassed:a.playerPassed}:null,
 nextMechanics:raidNextMechanics(r)};
}
