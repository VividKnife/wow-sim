import {compileStrategies} from '../../../bot-ai/src/decision.js';
import {BotContext} from './bot-context.js';
import {spells} from './catalog.js';
import {spellInfo,stats} from './character.js';
import {selectConfigured} from './combat.js';
import {selectPetPolicy,selectClass} from './class-mechanics.js';
import {selectCompanion,selectPriestRescue,selectPriestDefense} from './companion-combat.js';
import {raidHealingMode,selectRaidHealing,cancelWastefulRaidHeal} from './raid-healing-policy.js';
import {selectStrategyPotion} from './consumables.js';
import {strategyAllows} from './combat-strategy.js';
import {positionPartyMember,meleePositionDestination} from './combat-positioning.js';
import {combatRole} from './combat-roles.js';
import {classAbilityKind} from './class-spell-registry.js';
import {commandDamageRules} from './combat-command.js';

const positioningReactions=new Set(['Cold Snap','Deterrence','Frost Nova','Concussive Shot','Wing Clip','Psychic Scream','Hammer of Justice','Frost Shock','Gouge','Counterspell','Earth Shock','Kick','Silence']);
const healingSupport=new Set(['Power Word: Shield','Inner Focus',"Nature's Swiftness",'Divine Favor']);
// Conservation stops filler spending, while configured recovery and personal
// survival still pass through ordinary conditions, reservations and validation.
const conservationSupport=new Set(['Innervate','Evocation','Mana Spring Totem','Mana Tide Totem','Barkskin','Divine Protection','Divine Shield','Ice Block','Fade']);
const always=()=>true;
const cancel=({actor:c})=>({kind:'cancel',spellId:c.cast.spell,startedAt:c.cast.startedAt});
const configured=(ctx,rules,future=false)=>selectConfigured(future?ctx.future:ctx.state,future?ctx.futureActor:ctx.actor,ctx.target,ctx.targets,ctx.actors,rules);

function reactions(ctx){
 const c=ctx.actor;
 const rules=(c.rules||[]).filter(r=>(!c.cast||!spells[r.spell]?.StartRecoveryTime&&!spellInfo(c,r.spell)?.castMs&&!spells[r.spell]?.ChannelInterruptFlags)&&(!ctx.regular&&!spells[r.spell]?.StartRecoveryTime||['enemyNear','targetCasting','healthBelow'].includes(r.condition)&&positioningReactions.has(spells[r.spell]?.SpellName)));
 return configured(ctx,rules);
}
function positioning({state:s,actor:c,target:e}){
 const candidate={...c};
 if(positionPartyMember(s,candidate,e))return {kind:'move',mode:'toward',range:0,destination:{position:c.position+2*(candidate.position-c.position),positionY:(c.positionY||0)+2*((candidate.positionY||0)-(c.positionY||0))}};
 if(meleePositionDestination(s,c,e))return {kind:'move',mode:'melee',targetId:e.id,range:5};
 return null;
}
function healing(ctx){
 const c=ctx.futureActor,s=ctx.state,future=ctx.future;
 const rules=c.rules?.filter(r=>classAbilityKind(spells[r.spell])==='heal'||healingSupport.has(spells[r.spell]?.SpellName));
 const raidMode=raidHealingMode(future,c);
 const support=raidMode&&rules?.filter(r=>classAbilityKind(spells[r.spell])!=='heal');
 return raidMode?(support?.length&&configured(ctx,support,true))||selectRaidHealing(future,c,ctx.target,ctx.actors):rules?.length?configured(ctx,rules,true):c.classId===5&&c!==s?selectCompanion(future,c,ctx.targets,ctx.actors,null,null,null):!c.rules&&selectClass(future,c,ctx.target,ctx.actors,null);
}

// Shared precedence separates reactions, positioning, coordinated healing and
// rotation. Configuration order remains authoritative inside selectConfigured.
const decide=compileStrategies([
 {id:'pet',priority:0,trigger:ctx=>!!ctx.actor.petUnit,terminal:true,actions:[{id:'pet-policy',select:ctx=>selectPetPolicy(ctx.state,ctx.actor)}]},
 {id:'no-target',priority:10,trigger:ctx=>!ctx.target,terminal:true,actions:[{id:'idle',select:()=>null}]},
 {id:'covered-heal',priority:20,trigger:ctx=>cancelWastefulRaidHeal(ctx.state,ctx.actor,ctx.actors),actions:[{id:'cancel',select:cancel}]},
 {id:'consumable',priority:30,trigger:always,actions:[{id:'potion',select:ctx=>selectStrategyPotion(ctx.state,ctx.actor)}]},
 {id:'rescue',priority:40,trigger:always,actions:[{id:'priest-rescue',select:ctx=>selectPriestRescue(ctx.state,ctx.actor,ctx.actors)}]},
 {id:'invalid-hostile-cast',priority:50,trigger:ctx=>{
  const c=ctx.actor;
  return c.cast?.policyControlled&&!c.cast.commanded&&!c.cast.friendly&&!ctx.actors.some(a=>a.id===c.cast.target)&&spells[c.cast.spell]?.SpellName!=='Blizzard'&&!strategyAllows(ctx.state,c,ctx.targets.find(t=>t.id===c.cast.target),spellInfo(c,c.cast.spell),undefined,c.cast.center);
 },actions:[{id:'cancel',select:cancel}]},
 {id:'defense',priority:60,trigger:ctx=>!ctx.actor.cast,actions:[{id:'priest-defense',select:ctx=>selectPriestDefense(ctx.state,ctx.actor,ctx.actors)}]},
 {id:'reaction',priority:70,trigger:always,actions:[{id:'configured-reaction',select:reactions}]},
 {id:'positioning',priority:80,trigger:ctx=>!ctx.actor.cast,actions:[{id:'party-position',select:positioning}]},
 {id:'wait-for-decision',priority:90,trigger:ctx=>!ctx.regular&&!ctx.urgent,terminal:true,actions:[{id:'auto-attack',select:ctx=>ctx.attackIntent}]},
 {id:'wait-for-queue-window',priority:100,trigger:ctx=>ctx.readyAt-ctx.state.clock>300,terminal:true,actions:[{id:'auto-attack',select:ctx=>ctx.attackIntent}]},
 {id:'healing',priority:110,trigger:ctx=>combatRole(ctx.futureActor)==='healer'&&ctx.actors.some(a=>a.hp>0&&a.hp<stats(a).maxHp*.85),actions:[{id:'heal-or-support',select:healing}]},
 {id:'conserve-mana',priority:120,trigger:ctx=>raidHealingMode(ctx.future,ctx.futureActor)==='conserve',terminal:true,actions:[
  {id:'conservation-support',select:ctx=>configured(ctx,(ctx.futureActor.rules||[]).filter(r=>classAbilityKind(spells[r.spell])==='dispel'||conservationSupport.has(spells[r.spell]?.SpellName)),true)},
  {id:'auto-attack',select:ctx=>ctx.attackIntent},
 ]},
 {id:'command',priority:130,trigger:always,actions:[{id:'command-damage',select:ctx=>{
  const area=commandDamageRules(ctx.state,ctx.futureActor);
  return area.length&&configured(ctx,area,true);
 }}]},
 {id:'rotation',priority:140,trigger:always,actions:[{id:'configured-rotation',select:ctx=>{
  // A heal deferred because an ally is already covering it must not reappear
  // through the generic rotation without the shared incoming-heal view.
  const rules=ctx.futureActor.rules;
  return configured(ctx,raidHealingMode(ctx.future,ctx.futureActor)&&rules?rules.filter(r=>classAbilityKind(spells[r.spell])!=='heal'):rules,true);
 }}]},
 {id:'auto-attack',priority:150,trigger:always,terminal:true,actions:[{id:'auto-attack',select:ctx=>ctx.attackIntent}]},
]);

export function selectCombatPolicy(state,actor,options={}){
 return decide(new BotContext(state,actor,options),options.trace);
}
