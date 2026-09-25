import {commandOrder} from './combat-command.js';
import {creatures} from './catalog.js';
import {log} from './character.js';
import {aliveEnemy} from './combat-space.js';
import {protectedTarget,ruleMatches} from './combat-strategy.js';
import {unitCreatureType,polymorphImmune,pvpApplyControl,pvpControlRemaining} from './pvp-runtime.js';
import {hasAura} from '../../../sim-core/src/combat-auras.js';

// Creature type and mechanic masks come from the pinned spell/template rows.
// Elite rank itself does not confer immunity in the reference core.
export function canPolymorph(enemy,spell){
 if(enemy?.pvp)return aliveEnemy(enemy)&&!polymorphImmune(enemy)&&!!(spell.TargetCreatureType&(1<<(unitCreatureType(enemy)-1)));
 const template=creatures[enemy?.entry];if(!template||!aliveEnemy(enemy)||enemy.controlledBy)return false;
 const type=1<<(template.CreatureType-1),mechanic=spell.Mechanic?1<<(spell.Mechanic-1):0;
 return !!(spell.TargetCreatureType&type)&&!(template.MechanicImmuneMask&mechanic)&&!(template.SchoolImmuneMask&(1<<spell.School));
}
export function polymorphTarget(s,c,focus,spell,rule){
 if(s.combat.pvp){const e=s.combat.enemies.find(e=>e.id===c.arenaControlTarget);return e&&canPolymorph(e,spell)&&!protectedTarget(e,s.clock)&&!(e.dots||[]).some(d=>d.remaining>0)&&pvpControlRemaining(e,spell.Id,s.clock,spell.durationMs)>0?e:null;}
 const order=commandOrder(s,c);
 if(order?.spellId===spell.Id){const target=s.combat.enemies.find(e=>e.id===order.targetId);return target&&canPolymorph(target,spell)&&!protectedTarget(target,s.clock)?target:null;}
 const enemies=s.combat.enemies.filter(aliveEnemy);
 if(enemies.some(e=>e.polyCaster===c.id&&e.polyUntil>s.clock))return null;
 // Keep the damage target available; other mages reserve their current casts.
 const reserved=new Set([s,...s.party].filter(a=>a.id!==c.id&&a.cast?.polymorph).map(a=>a.cast.target));
 // Suppress mana users first. A melee enemy's pet-buff cast must not divert
 // both mages from hostile casters. Within each group, interrupt a cast first.
 const priority=e=>(e.maxMana>0||e.mana>0?2:0)+(e.cast?1:0);
 return enemies.filter(e=>e.id!==focus.id&&!protectedTarget(e,s.clock)&&!reserved.has(e.id)&&!(e.dots||[]).some(d=>d.remaining>0)&&canPolymorph(e,spell)&&(!rule||ruleMatches(s,c,e,rule,spell))).sort((a,b)=>priority(b)-priority(a))[0]||null;
}
export function applyPolymorph(s,c,e,spell){
 if(e.pvp){for(const previous of s.combat.enemies)previous.auras=(previous.auras||[]).filter(a=>!(a.type===5&&a.caster===c.id));pvpApplyControl(s,c,e,spell,5);e.polyNextHeal=s.clock+1000;return;}
 for(const previous of s.combat.enemies)if(previous.polyCaster===c.id)previous.polyUntil=0;
 e.polyUntil=s.clock+spell.durationMs;e.polyCaster=c.id;e.polyNextHeal=s.clock+1000;e.cast=null;
}
export function tickPolymorph(s){
 for(const e of s.combat.enemies){
  if(!aliveEnemy(e)||!(e.polyUntil>s.clock)&&!(e.pvp&&hasAura(e,5,s.clock)))continue;
  e.polyNextHeal??=s.clock+1000;
  while(e.polyNextHeal<=s.clock){
   const amount=Math.max(0,Math.min(e.maxHp-e.hp,Math.floor(e.maxHp/10)));e.hp+=amount;e.polyNextHeal+=1000;
   if(amount)log(s,`${e.name} 在变形中恢复 ${amount} 点生命`,'heal',{actorId:e.id,targetId:e.id,amount,spellId:12939});
  }
 }
}
