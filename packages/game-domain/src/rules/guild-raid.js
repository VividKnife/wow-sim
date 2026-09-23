import {raidAttemptReview} from './raid-command.js';
import {raidRouteState,raidMapView,raidBossesFor,raidNameFor} from './molten-core-content.js';
import {creditKill} from './quests.js';
import {navigateRaid,advanceRaid,pauseRaid,settleRaidRoute} from './molten-core-navigation.js';
import {raidNextMechanics} from './molten-core-mechanics.js';
import {createRoster,guildSquadNames} from '../molten-core-roster.ts';
import {defaultRaidTactics} from './molten-core-encounter.js';
import {beginMoltenCoreBattle} from './molten-core-battle.js';
import {stats,clone,log,makeItem} from './character.js';
import {items,nameOf} from './catalog.js';
import {combatRole} from './combat-roles.js';
import {collectLoot} from './loot.js';
import {raidAttunementReason} from './raid-attunement.js';

export const MOLTEN_CORE_ID='molten-core';
const WEEK=604800000,weekAt=at=>Math.floor((at-345600000)/WEEK);
import {raidLoot,rollRaidLoot} from './raid-rewards.js';
export {raidLoot} from './raid-rewards.js';
const active=s=>{if(!s.guildRaid?.active)throw new Error('请先进入团队副本。');return s.guildRaid;};
const camp=s=>{const r=active(s);if(s.combat)throw new Error('战斗结束后才能调整营地。');if(r.recoverUntil>s.clock)throw new Error('公会正在休整，请稍候。');return r;};
export function enterGuildRaid(s,raidId='molten-core'){
 if(!['molten-core','onyxias-lair'].includes(raidId))throw new Error('未知团队副本。');
 if(s.level!==60||s.growthPolicy==='companion')throw new Error('需要60级主角率队进入。');
 if(s.combat||s.dungeon||s.guildRaid?.active)throw new Error('请先结束当前冒险。');
 if(s.party.length!==4||[s,...s.party].some(c=>c.level!==60||c.hp<=0))throw new Error('需要五名存活的60级核心队员。');
 const attunement=raidAttunementReason(s,raidId);if(attunement)throw new Error(attunement);
 const week=weekAt(s.wallAt);
 s.raidSaves??={};
 if(s.guildRaid?.raidId!==raidId){if(s.guildRaid)s.raidSaves[s.guildRaid.raidId||'molten-core']=s.guildRaid;s.guildRaid=s.raidSaves[raidId];delete s.raidSaves[raidId];}
 const r=s.guildRaid??={version:2,...raidRouteState(),week,cleared:[],claims:{},tactics:{...defaultRaidTactics},attempts:[],rewards:[]};
 r.raidId=raidId;
 if(r.week!==week){r.week=week;Object.assign(r,raidRouteState());r.cleared=[];r.claims={};r.rewards=[];r.attempts=[];}
 r.active=true;r.autoAdvance=false;r.activeBoss=null;r.recoverUntil=0;r.coreIds=[s,...s.party].map(c=>c.id);
 const templates=createRoster().slice(5);
 for(const [i,c]of templates.entries()){c.id=`guild:${s.id}:${i}`;c.guildUnit=true;c.growthPolicy='guild';c.raidSquad=1+Math.floor(i/5);s.party.push(c);}
 s.activity={type:'idle',reason:'公会已集结。检查职责与战术后挑战首领。'};
 log(s,raidNameFor(raidId)+'公会远征：核心5人、公会20人已集结。','raid');
}
export function leaveGuildRaid(s){
 const r=camp(s);r.active=false;r.autoAdvance=false;r.recoverUntil=0;
 s.party=s.party.filter(c=>!c.guildUnit);s.activity={type:'idle'};
 log(s,'已返回营地外，'+raidNameFor(r.raidId)+'进度与战利品已保存。','raid');
}
export function restoreRaidMember(c,s){
 c.time=s.clock;c.cast=null;c.rest=null;c.auras=[];c.dots=[];c.hots=[];c.periodicClass=[];c.buffs=[];c.classBuffs=[];
 c.cooldowns={};c.categoryCooldowns={};c.globalCooldowns={};c.globalCooldown=0;
 c.fearUntil=0;c.stunUntil=0;c.rootUntil=0;c.polyUntil=0;c.silenceUntil=0;c.schoolLockouts={};
 c.rage=0;c.energy=100;c.combo=0;c.talentProcs={};c.nextAction=s.clock;c.nextSwing=s.clock;c.nextRanged=s.clock;
 if(c.classId===3){c.ammunition={11285:2000,11284:2000};if(!c.learned.includes(19801))c.learned.push(19801);}
 const st=stats(c);c.hp=st.maxHp;c.mana=st.maxMana;
}
export function guildRaidAction(s,a){
 if(a.type==='raidPause'){pauseRaid(s,active(s));return;}
 const r=camp(s);
 if(a.type==='raidTactics'){
  if(!a.patch||Array.isArray(a.patch)||typeof a.patch!=='object'||Object.entries(a.patch).some(([k,v])=>!Object.hasOwn(defaultRaidTactics,k)||typeof v!=='boolean'))throw new Error('战术设置无效。');
  Object.assign(r.tactics,a.patch);
 }else if(a.type==='raidRecover'){
  r.autoAdvance=false;r.recoverUntil=s.clock+10000;s.activity={type:'raidRecovery',startedAt:s.clock,endsAt:r.recoverUntil,reason:'公会医护正在复活并补充食物、饮水与弹药。'};

 }else if(a.type==='raidRestart'){
  if(r.cleared.length<raidBossesFor(r.raidId).length)throw new Error('完成本次远征后才能重新挑战。');
  r.cleared=[];Object.assign(r,raidRouteState());r.activeBoss=null;log(s,'开始本周练习远征，已领取过的首领奖励不会重复发放。','raid');
 }else if(a.type==='raidStart'||a.type==='raidNavigate'){
  const actors=[s,...s.party],tanks=actors.filter(c=>combatRole(c)==='tank').length,heals=actors.filter(c=>combatRole(c)==='healer').length;
  if(actors.length!==25||tanks<2||heals<5)throw new Error('需要25名成员、至少2名坦克和5名治疗；请调整核心队职责。');
  navigateRaid(s,r,a.destination||a.bossId,id=>launchGuildEncounter(s,id));
 }else throw new Error('未知公会操作。');
}
function launchGuildEncounter(s,id){for(const c of [s,...s.party])restoreRaidMember(c,s);beginMoltenCoreBattle(s,id,s.guildRaid.tactics);}
export function advanceGuildRoute(s){advanceRaid(s,s.guildRaid,id=>launchGuildEncounter(s,id));}
export function settleGuildRaid(s){
 const r=s.guildRaid;if(!r?.active)return;
 if(r.recoverUntil&&s.clock>=r.recoverUntil){for(const c of [s,...s.party])restoreRaidMember(c,s);r.recoverUntil=0;s.activity={type:'idle',reason:'全团休整完毕，可以继续挑战。'};}
 const b=s.lastCombat;
 if(s.combat||!b?.raidEncounter||b.raidMode!=='guild'||b.guildSettled)return;
 b.guildSettled=true;
 const won=!b.abandoned&&b.enemies.every(e=>e.hp<=0),bossId=b.raidEncounter.id;
 r.attempts.push({bossId,won,abandoned:!!b.abandoned,duration:b.endedAt-b.startedAt,deaths:[s,...s.party].filter(c=>c.hp<=0).length,review:raidAttemptReview(s,b),support:clone(b.raidEncounter.support),failures:clone(b.raidEncounter.failures)});
 r.attempts=r.attempts.slice(-20);
 if(won){
  if(b.raidEncounter.kind==='boss'&&!r.cleared.includes(bossId))r.cleared.push(bossId);
  const claimKey=b.raidEncounter.kind==='boss'?bossId:'trash:'+bossId;
  if(!r.claims[claimKey]){
   for(const entry of new Set(b.enemies.filter(e=>!e.summonedBy).map(e=>e.entry)))creditKill(s,entry);
   for(const {itemId,count} of rollRaidLoot(s,bossId)){
    const max=Math.max(1,items[itemId].stackable);
    for(let left=count;left>0;left-=max)s.pending.push({...makeItem(s,itemId,Math.min(left,max)),lootBattleId:b.id,raidSource:bossId});
    r.rewards.push({bossId,itemId,count,name:nameOf('items',itemId),week:r.week});
    log(s,`掉落：${nameOf('items',itemId)} ×${count}。`,'loot');
   }
   r.claims[claimKey]=true;
  }else if(b.raidEncounter.kind==='boss')log(s,'练习战完成：本周该首领奖励已领取。','raid');
  s.activity={type:s.hp>0?'idle':'dead',reason:b.raidEncounter.kind==='boss'?'首领已击败，领取战利品并休整后继续。':'怪物群已清理，可以继续推进。'};
  if(s.hp>0&&s.settings.autoLoot)collectLoot(s);
 }else s.activity={type:s.hp>0?'idle':'dead',reason:b.abandoned?'已放弃挑战，营地休整后可重试。':'挑战失败，已通关首领进度保留。'};
 settleRaidRoute(s,r,b,won);
}
export function guildRaidView(s){
 const r=s.guildRaid,live=!!r?.active,actors=live?[s,...s.party]:[];
 const battle=s.combat||s.lastCombat,enc=live?battle?.raidEncounter:null;
 const week=weekAt(s.wallAt),current=live||r?.week===week;
 return {id:r?.raidId||MOLTEN_CORE_ID,name:raidNameFor(r?.raidId),raids:['molten-core','onyxias-lair'].map(id=>({id,name:raidNameFor(id),bossCount:raidBossesFor(id).length,attunementReason:raidAttunementReason(s,id)})),active:live,minimumLevel:60,capacity:25,canEnter:s.level===60&&s.growthPolicy!=='companion'&&!live&&!s.combat&&!s.dungeon&&s.party.length===4&&[s,...s.party].every(c=>c.level===60&&c.hp>0),
  map:live?raidMapView(s,r,!s.combat&&!r.recoverUntil&&!s.pending.length&&actors.every(c=>c.hp>0)):null,weekResetAt:(week+1)*WEEK+345600000,cleared:current?r?.cleared||[]:[],claims:current?r?.claims||{}:{},tactics:r?.tactics||defaultRaidTactics,
  recovering:!!r?.recoverUntil,remaining:Math.max(0,(r?.recoverUntil||0)-s.clock),activeBoss:r?.activeBoss,bosses:raidBossesFor(r?.raidId).map(b=>({...b,loot:(raidLoot[b.id]||[]).filter(id=>items[id]).map(id=>({id,name:nameOf('items',id)}))})),squadNames:guildSquadNames,
  attempts:r?.attempts||[],rewards:r?.rewards||[],roles:{tank:actors.filter(c=>combatRole(c)==='tank').length,healer:actors.filter(c=>combatRole(c)==='healer').length,damage:actors.filter(c=>!['tank','healer'].includes(combatRole(c))).length},
  members:actors.map((c,i)=>({id:c.id,name:c.name,classId:c.classId,role:combatRole(c),squad:Math.floor(i/5),guild:!!c.guildUnit,hp:c.hp,maxHp:stats(c).maxHp,mana:c.mana,maxMana:stats(c).maxMana})),events:enc?.events?.slice(-8)||[],fires:enc?.fires||[],nextMechanics:raidNextMechanics(s.combat?.raidEncounter)};
}
