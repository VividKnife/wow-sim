import {activeAuras,controlled,hasAura,schoolImmune} from '../../../sim-core/src/combat-auras.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {pvpControlProfile,pvpControlRemaining,pvpAbilityAllowed} from './pvp-runtime.js';
import {knownRank,spellInfo,log} from './character.js';
import {spells} from './catalog.js';
import {spellReady} from './spell-timing.js';
import {stanceAllows} from './companion-combat.js';
import {detectsTarget,inSpellRange} from './combat-space.js';
import {combatRole} from './combat-roles.js';
import {ruleMatches} from './combat-strategy.js';
import {prepareClassAbility} from './class-spell-effects.js';

export const arenaControlNames=new Set(['Polymorph','Fear','Hammer of Justice','Kidney Shot','Gouge','Bash','Psychic Scream','Intimidating Shout','Blind','Sap']);
const interrupts=new Set(['Counterspell','Kick','Earth Shock','Pummel','Shield Bash','Silence']);
const burstSpells=['Adrenaline Rush','Arcane Power','Recklessness','Rapid Fire','Bestial Wrath','Cold Blood','Elemental Mastery','Power Infusion'];
const labels={focus:'集火',pressure:'压制',protect:'保护',control:'控制接力'};
function usable(s,c,target,names){
 if(!target||c.cast||controlled(c,s.clock)||c.nextAction>s.clock)return[];
 return c.baseRules.filter(r=>r.enabled&&names.has(spells[r.spell]?.SpellName)).map(rule=>({rule,sp:spellInfo(c,knownRank(c,rule.spell))})).filter(({rule,sp})=>{
  if(!sp||!pvpAbilityAllowed(c,target,sp,s.clock)||!stanceAllows(c,sp)||!spellReady(c,sp,s.clock)||!inSpellRange(c,target,sp)||!detectsTarget(c,target,s.clock)||prepareClassAbility(s,c,target,sp,[c,...(s.party||[])])===null)return false;
  const pool=sp.PowerType===1?'rage':sp.PowerType===3?'energy':'mana';
  return (c[pool]||0)>=sp.mana&&!(c.schoolLockouts?.[sp.School]>s.clock)&&!(sp.School>0&&(c.silenceUntil>s.clock||hasAura(c,27,s.clock)))&&ruleMatches(s,c,target,rule,sp);
 });
}
function controlSpell(s,c,target,minDuration){
 return usable(s,c,target,arenaControlNames).find(({sp})=>{
  const profile=pvpControlProfile(sp.Id);
  if(!profile||pvpControlRemaining(target,sp.Id,s.clock,sp.durationMs)<minDuration)return false;
  if(profile.breakOnDamage==='always'&&(target.dots||[]).some(d=>d.remaining>0))return false;
  if(sp.SpellName==='Kidney Shot'&&(!c.combo||c.comboTarget!==target.id))return false;
  return true;
 });
}
export function arenaTacticalTick(root,team,enemy){
 const clock=root.clock,plan=team.plan,alive=enemy.filter(c=>c.hp>0&&!c.petUnit&&!c.totemUnit),control=alive.find(c=>c.id===plan.controlId);
 const ordered=[plan.focusId,...plan.killOrder.filter(id=>id!==plan.focusId)].map(id=>alive.find(c=>c.id===id)).filter(Boolean);
 const vulnerable=ordered.filter(c=>!plan.swapOnImmunity||![0,1,2,3,4,5,6].every(school=>schoolImmune(c,school,clock)));
 const focus=vulnerable.find(c=>c!==control)||vulnerable[0]||ordered.find(c=>c!==control)||ordered[0];
 if(team.currentFocusId!==focus?.id){team.currentFocusId=focus?.id;log(root,'转火：'+(focus?.name||'无目标'),'tactic',{targetId:focus?.id});}
 root.combat.controlTargetId=control&&alive.length>1&&team.members.some(c=>c.hp>0&&plan.assignments.find(a=>a.actorId===c.id)?.task==='control')?control.id:null;
 const remaining=Math.max(0,...(control?activeAuras(control,clock).filter(a=>[5,7,12,27].includes(a.type)).map(a=>a.until-clock):[]));
 const locked=control&&Object.values(control.schoolLockouts||{}).some(until=>until-clock>=plan.minControlMs);
 const window=remaining>=plan.minControlMs||locked;
 if(window)team.lastWindowAt=clock;
 const waited=clock-(team.lastWindowAt||3000)>=plan.maxBurstWaitMs;
 const status=plan.burst==='immediate'||!root.combat.controlTargetId?'持续进攻':window?'爆发窗口':waited?'等待超时，持续施压':'等待控制窗口';
 if(team.tacticalStatus!==status){team.tacticalStatus=status;log(root,status,'tactic');}
 let controller=null,chain=null;
 if(root.combat.controlTargetId&&!team.members.some(c=>c.hp>0&&c.cast?.target===control.id&&pvpControlProfile(c.cast.spell))){
  for(const id of plan.controlOrder){
   const c=team.members.find(c=>c.id===id&&c.hp>0);if(!c)continue;
   const candidate=controlSpell(root,c,control,plan.minControlMs);
   if(candidate&&remaining<=candidate.sp.castMs+200){controller=c;chain=candidate;break;}
  }
 }
 const reservedInterrupts=new Set();
 for(const c of team.members){
  if(c.hp<=0)continue;
  const assignment=plan.assignments.find(a=>a.actorId===c.id),protect=team.members.find(a=>a.id===assignment.protectId&&a.hp>0)||team.members.find(a=>combatRole(a)==='healer'&&a.hp>0);
  const threats=protect?alive.filter(e=>e.target===protect.id&&distance(e,protect)<12).sort((a,b)=>distance(a,protect)-distance(b,protect)):[];
  let target=assignment.task==='pressure'?alive.find(e=>e.id===assignment.targetId)||focus:focus,reason=labels[assignment.task];
  if(assignment.task==='protect'&&threats.length){target=threats[0];reason='保护 '+protect.name;}
  if(target&&!detectsTarget(c,target,clock))target=alive.find(e=>detectsTarget(c,e,clock)&&e!==control);
  const retreat=protect&&protect!==c&&(c.hp/c.maxHp*100<assignment.retreatBelow||distance(c,protect)>assignment.leash||c.arenaRetreatTarget===protect.id&&distance(c,protect)>8);
  c.arenaRetreatTarget=retreat?protect.id:null;if(retreat)reason='回撤寻求支援';
  const peel=c!==controller&&assignment.task==='protect'&&threats[0]&&!controlled(threats[0],clock)?controlSpell(root,c,threats[0],1000):null;
  c.arenaTargetId=target?.id;c.arenaControlTarget=c===controller?control?.id:peel?threats[0].id:null;c.arenaControlSpell=c===controller?chain.sp.SpellName:peel?.sp.SpellName||null;
  if(peel)reason='援护控场 '+threats[0].name;if(c===controller)reason='接控 '+control.name;
  c.arenaInterruptTarget=null;c.arenaInterruptSpell=null;
  let interrupt=null,interruptTarget=null;
  if(assignment.interrupt!=='off'&&!retreat&&c!==controller&&!peel){
   const candidates=alive.filter(e=>e.cast&&e.cast.until>clock+100&&!reservedInterrupts.has(e.id)&&
    (assignment.interrupt==='any'||assignment.interrupt==='focus'&&e===focus||assignment.interrupt==='healer'&&combatRole(e)==='healer'));
   candidates.sort((a,b)=>Number(combatRole(b)==='healer')-Number(combatRole(a)==='healer')||a.cast.until-b.cast.until);
   for(const e of candidates){const candidate=usable(root,c,e,interrupts)[0];if(candidate){interrupt=candidate;interruptTarget=e;reservedInterrupts.add(e.id);break;}}
  }
  if(interrupt){c.arenaInterruptTarget=interruptTarget.id;c.arenaInterruptSpell=interrupt.sp.SpellName;reason='打断 '+interruptTarget.name;}
  if(c.arenaIntent!==reason){c.arenaIntent=reason;log(root,c.name+'：'+reason,'tactic',{actorId:c.id,targetId:target?.id});}
  const urgent=interrupt||c===controller&&chain||peel;
  // The commander can schedule configured skills, never grant disabled/unlearned ones.
  c.rules=[...(urgent?[{...urgent.rule,spell:urgent.sp.Id}]:[]),...c.baseRules.filter(r=>!arenaControlNames.has(spells[r.spell]?.SpellName)&&!interrupts.has(spells[r.spell]?.SpellName))];
  c.arenaWaitingBurst=plan.burst==='controlled'&&!!root.combat.controlTargetId&&!window&&!waited;
  c.arenaBurstSpells=burstSpells;
 }
}
