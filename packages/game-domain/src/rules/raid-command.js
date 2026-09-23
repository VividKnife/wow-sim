import {items} from './catalog.js';
import {stats,knownRank,spellInfo} from './character.js';
import {combatRole} from './combat-roles.js';
import {classEffect} from './class-mechanics.js';
import {stanceAllows} from './companion-combat.js';
import {beginSpellTiming,spellReady,cooldownUntil} from './spell-timing.js';
import {controlled} from '../../../sim-core/src/combat-auras.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {raidBossesFor} from './molten-core-content.js';
import {raidNotice} from './molten-core-mechanics.js';

const owner=s=>s.goldRaid?.active?s.goldRaid:s.guildRaid?.active?s.guildRaid:null;
const members=s=>[s,...s.party];
const require=(ok,message)=>{if(!ok)throw new Error(message);};
export const raidJobs={magic:{name:'末日 / 魔法驱散',spell:527},curse:{name:'解除诅咒',spell:475},tranquilize:{name:'宁神轮换',spell:19801},ward:{name:'主坦防恐',spell:6346}};
export const raidCooldowns={wall:{name:'盾墙',spell:871,hint:'主坦承伤，或生命低于45%时；需要战士持盾且姿态正确。'},rescue:{name:'圣疗术',spell:633,hint:'主坦生命低于25%时救急；施法者耗尽法力。'},mana:{name:'激活',spell:29166,hint:'为法力最低的治疗回蓝；治疗法力低于25%时触发。'}};
const eligible=(s,spell)=>members(s).filter(c=>knownRank(c,spell));
export function recommendedRaidPlan(s,bossId){
 const tanks=members(s).filter(c=>combatRole(c)==='tank');
 return {mainTank:tanks[0]?.id||'',offTank:tanks[1]?.id||'',focus:bossId==='golemagg'?'boss':'adds',formation:'spread',movement:'early',dispelPolicy:'assigned',
  jobs:Object.fromEntries(Object.entries(raidJobs).map(([key,j])=>[key,eligible(s,j.spell).slice(0,2).map(c=>c.id)])),
  cooldowns:Object.fromEntries(Object.entries(raidCooldowns).map(([key,j])=>[key,{actorId:(key==='wall'?tanks.filter(c=>knownRank(c,j.spell)):eligible(s,j.spell))[0]?.id||'',trigger:'automatic'}]))};
}
export function raidPlan(s,bossId){return structuredClone(owner(s)?.plans?.[bossId]||recommendedRaidPlan(s,bossId));}
export function raidCommandAction(s,a){
 const r=owner(s);require(r,'请先集结团本队伍。');
 if(a.type==='raidPlan'){
  require(!s.combat&&!r.recoverUntil&&!r.autoAdvance&&(!s.goldRaid?.active||r.phase==='camp'),'请在停止推进的营地发布指挥。');
  require(raidBossesFor(r.raidId).some(b=>b.id===a.bossId),'未知首领。');
  const p=a.plan,actors=members(s),tank=id=>actors.some(c=>c.id===id&&combatRole(c)==='tank');
  require(p&&tank(p.mainTank)&&tank(p.offTank)&&p.mainTank!==p.offTank,'主坦、副坦必须是两名不同的坦克。');
  require(['adds','boss'].includes(p.focus)&&['spread','compact'].includes(p.formation)&&['early','finishCast'].includes(p.movement)&&['assigned','all'].includes(p.dispelPolicy),'作战纪律无效。');
  for(const [key,j]of Object.entries(raidJobs)){const ids=p.jobs?.[key];require(Array.isArray(ids)&&ids.length<=2&&new Set(ids).size===ids.length&&ids.every(id=>eligible(s,j.spell).some(c=>c.id===id)),`${j.name}需要指定已掌握技能的成员，主备不能重复。`);}
  for(const [key,j]of Object.entries(raidCooldowns)){const slot=p.cooldowns?.[key];require(slot&&(key==='wall'?['automatic','manual','frenzy','fear']:['automatic','manual']).includes(slot.trigger)&&typeof slot.actorId==='string'&&(!slot.actorId||eligible(s,j.spell).some(c=>c.id===slot.actorId)),`${j.name}安排无效。`);if(key==='wall'&&slot.actorId)require(slot.actorId===p.mainTank,'盾墙应安排给主坦。');}
  require(!['frenzy','fear'].includes(p.cooldowns.wall.trigger)||a.bossId==='magmadar','狂暴与恐慌时间轴触发仅用于玛格曼达。');
  r.plans??={};r.plans[a.bossId]={mainTank:p.mainTank,offTank:p.offTank,focus:p.focus,formation:p.formation,movement:p.movement,dispelPolicy:p.dispelPolicy,jobs:structuredClone(p.jobs),cooldowns:structuredClone(p.cooldowns)};
  return;
 }
 require(a.type==='raidOrder'&&s.combat?.raidEncounter?.command&&a.encounterId===s.combat.id,'当前战斗已变化，请重新下令。');
 const command=s.combat.raidEncounter.command;
 if(a.order==='focusAdds'||a.order==='focusBoss'){
  require(s.clock>=(command.focusReadyAt||0),'集火口令每5秒只能切换一次。');
  s.combat.raidEncounter.tactics.focusAdds=a.order==='focusAdds';command.focusReadyAt=s.clock+5000;
  record(s,`团长下令：${a.order==='focusAdds'?'先清小怪':'集中首领'}`,'focus');return;
 }
 require(Object.hasOwn(raidCooldowns,a.order),'未知团队口令。');
 const reason=executeCooldown(s,a.order);require(!reason,reason);
}
function record(s,text,key,actorId){const c=s.combat.raidEncounter.command;c.events.push({at:s.clock,text,key,actorId});c.events=c.events.slice(-40);raidNotice(s,text,'raid-command',{actorId});}
export function initRaidCommand(s,bossId){
 const enc=s.combat.raidEncounter,plan=raidPlan(s,bossId);
 enc.command={plan,events:[],used:{},dead:[],firstDeath:null,focusReadyAt:0};
 enc.tactics.focusAdds=plan.focus==='adds';enc.tactics.dispel=true;enc.tactics.tranquilize=true;enc.tactics.fearWard=true;enc.tactics.avoidFire=true;
 for(const c of members(s))c.raidReservedSpells=Object.entries(raidCooldowns).filter(([key])=>plan.cooldowns[key].actorId===c.id).map(([,j])=>j.spell);
}
function cooldownContext(s,key){
 const enc=s.combat?.raidEncounter,command=enc?.command,job=raidCooldowns[key],slot=command?.plan.cooldowns[key];
 const actor=members(s).find(c=>c.id===slot?.actorId),id=actor&&knownRank(actor,job.spell),sp=id&&spellInfo(actor,id);
 const main=members(s).find(c=>c.id===command?.plan.mainTank);
 const target=key==='wall'?actor:key==='rescue'?main:members(s).filter(c=>c.hp>0&&combatRole(c)==='healer'&&stats(c).maxMana>0).sort((a,b)=>a.mana/stats(a).maxMana-b.mana/stats(b).maxMana)[0];
 let reason='';
 if(!actor||!sp)reason='未安排可用施法者';
 else if(actor.hp<=0)reason='负责人已倒下';
 else if(!target||target.hp<=0)reason='目标已倒下';
 else if(controlled(actor,s.clock)||actor.silenceUntil>s.clock)reason='负责人被控制';
 else if(key==='wall'&&(items[actor.equipment[17]?.id]?.InventoryType!==14||!stanceAllows(actor,sp)))reason='需要持盾并切换防御姿态';
 else if(!spellReady(actor,sp,s.clock))reason='技能或公共冷却中';
 else if(actor.mana<(sp.mana||0))reason='法力不足';
 else if(actor!==target&&distance(actor,target)>(sp.range||30))reason='目标超出施法距离';
 return {actor,target,sp,reason,slot,remaining:sp?Math.max(0,cooldownUntil(actor,sp)-s.clock):0};
}
function executeCooldown(s,key){
 const {actor,target,sp,reason}=cooldownContext(s,key);if(reason)return reason;
 actor.cast=null; // Emergency assignments interrupt the caster's ordinary rotation.
 const timing=beginSpellTiming(actor,sp,s.clock);if(!timing.committed)return '资源不足，无法执行';
 classEffect(s,actor,target,sp,members(s),{});
 s.combat.raidEncounter.command.used[key]=(s.combat.raidEncounter.command.used[key]||0)+1;
 record(s,`${actor.name} 执行${raidCooldowns[key].name} → ${target.name}`,key,actor.id);return '';
}
export function raidCommandTick(s,actors){
 const command=s.combat?.raidEncounter?.command;if(!command)return;
 if(command.nextCheck>s.clock)return;command.nextCheck=s.clock+200;
 for(const c of actors.filter(c=>!c.petUnit&&!c.totemUnit&&c.hp<=0))if(!command.dead.includes(c.id)){
  const hit=s.logs.findLast(l=>l.kind==='incoming'&&l.targetId===c.id&&l.at>=s.combat.startedAt);
  command.dead.push(c.id);command.firstDeath??={name:c.name,at:s.clock,role:combatRole(c),cause:hit?.action||'未知伤害'};
 }
 for(const key of Object.keys(raidCooldowns)){
  const x=cooldownContext(s,key);if(x.slot?.trigger==='manual'||x.reason)continue;
  const enc=s.combat.raidEncounter;
  const needed=x.slot.trigger==='frenzy'?!!s.combat.enemies.find(e=>e.id===enc.bossId)?.enraged:x.slot.trigger==='fear'?enc.id==='magmadar'&&enc.nextFear-s.clock<=2000:key==='mana'?x.target.mana/stats(x.target).maxMana<.25:x.target.hp/stats(x.target).maxHp<(key==='wall'?.45:.25);
  if(needed)executeCooldown(s,key);
 }
}
export function assignedRaidSupport(s,c,job){
 const p=s.combat?.raidEncounter?.command?.plan;
 return !p||(['magic','curse'].includes(job)&&p.dispelPolicy==='all')||p.jobs[job].includes(c.id);
}
export function raidDispelTargets(s,c,living,job,type){
 const targets=living.filter(a=>(a.auras||[]).some(e=>e.dispel===type&&e.until>s.clock));
 const ids=s.combat?.raidEncounter?.command?.plan.jobs[job]||[],index=ids.indexOf(c.id);
 // Divide squads, then cover other squads when the assigned work is complete.
 return targets.sort((a,b)=>Number((b.raidSquad||0)%ids.length===index)-Number((a.raidSquad||0)%ids.length===index)||Math.min(...(a.auras||[]).map(e=>e.explodesAt||Infinity))-Math.min(...(b.auras||[]).map(e=>e.explodesAt||Infinity)));
}
export function raidAttemptReview(s,b){
 const e=b.raidEncounter,c=e.command;if(!c)return null;
 const boss=b.enemies.find(a=>a.id===e.bossId),actors=members(s),healers=actors.filter(a=>combatRole(a)==='healer');
 const remaining=Math.round(100*Math.max(0,boss?.hp||0)/Math.max(1,boss?.maxHp||1));
 const mana=healers.length?Math.round(100*healers.reduce((n,a)=>n+a.mana/Math.max(1,stats(a).maxMana),0)/healers.length):0;
 const suggestions=[];
 if(e.failures.doom)suggestions.push('末日漏驱散：安排两名牧师分管小队；仍来不及时改为全员协助，代价是治疗读条减少。');
 if(e.failures.fire)suggestions.push('火区受伤：改为提前撤离、分散站位；金团优先招募执行机制更稳定的成员。');
 if(e.failures.feared)suggestions.push('多人恐惧：检查防恐负责人是否存活、能否覆盖主坦；为主坦预留盾墙应对空档。');
 if(c.firstDeath?.role==='tank')suggestions.push('坦克最先倒下：为主坦安排盾墙和圣疗，避免都留到同一低血量时刻。');
 if(mana<20)suggestions.push('治疗法力不足：安排激活；减少全员驱散占用，先清治疗小怪以缩短战斗。');
 if(b.endedAt>=e.enrageAt)suggestions.push('触发狂暴时限：检查集火目标是否正确；先清治疗小怪，古雷曼格集中首领。');
 if(!suggestions.length)suggestions.push('机制处理暂未出现明显缺口。结合伤害与治疗统计，检查阵容和关键技能是否在需要时执行。');
 return {bossRemaining:remaining,healerMana:mana,firstDeath:c.firstDeath,plan:structuredClone(c.plan),events:structuredClone(c.events),used:{...c.used},failures:{...e.failures},suggestions,unused:Object.entries(c.plan.cooldowns).filter(([key,slot])=>slot.actorId&&!c.used[key]).map(([key])=>raidCooldowns[key].name)};
}
export function raidCommandView(s){
 const r=owner(s);if(!r||members(s).length!==25)return null;
 const moltenCoreBosses=raidBossesFor(r.raidId);
 const enc=s.combat?.raidEncounter,command=enc?.command;
 return {bosses:moltenCoreBosses.map(b=>({id:b.id,name:b.name,description:b.description})),plans:Object.fromEntries(moltenCoreBosses.map(b=>[b.id,{plan:raidPlan(s,b.id),published:!!r.plans?.[b.id]}])),
  members:members(s).map(c=>({id:c.id,name:c.name,role:combatRole(c),classId:c.classId})),
  jobs:Object.entries(raidJobs).map(([id,j])=>({id,...j,candidates:eligible(s,j.spell).map(c=>({id:c.id,name:c.name}))})),
  cooldowns:Object.entries(raidCooldowns).map(([id,j])=>({id,...j,candidates:eligible(s,j.spell).map(c=>({id:c.id,name:c.name})),...(command?{reason:cooldownContext(s,id).reason,remaining:cooldownContext(s,id).remaining,actorId:command.plan.cooldowns[id].actorId,trigger:command.plan.cooldowns[id].trigger,used:command.used[id]||0}:{})})),
  locked:!!s.combat||!!r.recoverUntil||!!r.autoAdvance||!!s.goldRaid?.active&&r.phase!=='camp',
  live:command?{bossId:enc.id,encounterId:s.combat.id,focusAdds:enc.tactics.focusAdds,focusReadyAt:command.focusReadyAt,events:command.events.slice(-5)}:null,
  attempts:r.attempts.filter(a=>a.review).slice(-20)};
}
