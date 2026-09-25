import {fieldContains} from '../../../sim-core/src/encounter-geometry.js';
import {environmentModifiers} from './class-environment.js';
import {rooted,controlled,movementMultiplier} from '../../../sim-core/src/combat-auras.js';
import {ranks,talentModifiers,talentCombatDefense} from './talent-effects.js';

import {point,distance} from '../../../sim-core/src/geometry.js';
import {setCombatPosition} from './combat-area.js';
import {combatMembers} from './combat-members.js';
import {arenaSight,arenaWaypoint} from '../../../sim-core/src/arena-space.js';

// A small steering preference during an already requested walk. Never schedules
// movement, interrupts a cast, or pushes another actor out of its position.
function walkingEndpoint(s,unit,p,desired){
 if(unit.cast||unit.petUnit||unit.totemUnit||!s?.combat)return desired;
 const members=combatMembers(s);
 if(!members.some(a=>a.id===unit.id))return desired;
 const neighbors=members.filter(a=>a.id!==unit.id&&a.hp>0&&!a.removed&&!a.totemUnit&&distance(a,unit)<3);
 if(!neighbors.length)return desired;
 const dx=desired.x-p.x,dy=desired.y-p.y;
 const crowd=q=>neighbors.reduce((sum,a)=>sum+Math.max(0,1.4-distance(q,a))**2,0);
 let best=desired,score=crowd(desired);
 for(const angle of [-.4,.4]){
  const q={x:p.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:p.y+dx*Math.sin(angle)+dy*Math.cos(angle)};
  const area=s.combat.area;if(area&&(q.x<area.minX||q.x>area.maxX||q.y<area.minY||q.y>area.maxY))continue;
  const cost=crowd(q)+Math.hypot(dx,dy)*.04;
  if(cost<score-1e-9){best=q;score=cost;}
 }
 return best;
}

// Walk along lava edges instead of immediately walking back into a cleared hazard.
// Forced displacement still uses setCombatPosition and can land in lava.
function terrainStep(s,unit,from,desired){
 const raid=s?.combat?.raidEncounter;
 if(!raid?.tactics.avoidFire||!combatMembers(s).some(c=>c.id===unit.id))return desired;
 const fields=raid.fires.filter(f=>f.terrain&&f.until>s.clock);
 if(!fields.length||fields.some(f=>fieldContains(f,from,.2)))return desired;
 const safe=p=>!fields.some(f=>fieldContains(f,p,.2));
 if(safe(desired))return desired;
 const dx=desired.x-from.x,dy=desired.y-from.y;
 for(const angle of [.4,-.4,.8,-.8,1.2,-1.2,1.6,-1.6]){
  const p={x:from.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:from.y+dx*Math.sin(angle)+dy*Math.cos(angle)};
  const a=s.combat.area;if(p.x<a.minX||p.x>a.maxX||p.y<a.minY||p.y>a.maxY)continue;
  if(safe(p))return p;
 }
 return from;
}

export function effectiveSpeed(unit,clock){
 if(unit.cast?.controlChannel||unit.talentProcs?.spiritOfRedemption?.until>clock)return 0;
 if(rooted(unit,clock)||controlled(unit,clock)&&!(unit.auras||[]).some(a=>a.type===7&&a.until>clock))return 0;
 const speedBuff=Math.max(0,...(unit.auras||[]).filter(a=>a.until>clock&&a.type===31).map(a=>a.amount))/100;
 const slow=unit.slowUntil>clock?Math.max(0,1-(unit.slow||0)):1;
 return Math.max(0,(['swim','underwater'].includes(unit.environment?.mode)?environmentModifiers(unit,clock).swimSpeed:(unit.moveSpeed??7))*(1+Math.max(speedBuff,talentModifiers(unit).movementPct||0))*(unit.sprintUntil>clock?1.5:1)*(unit.stealthed?.5+.03*(ranks(unit).Camouflage||0):1)*Math.min(slow,movementMultiplier(unit,clock)));
}
export function moveToward(s,unit,target,range,clock,dtMs=100){
 if(s?.combat?.pvp){
  const visible=arenaSight(unit,target);if(distance(unit,target)<=range&&visible)return false;
  const waypoint=arenaWaypoint(s.combat.area,unit,target,clock);if(!waypoint)return false;
  const p=point(unit),gap=distance(unit,waypoint),direct=distance(waypoint,target)<1e-8;
  const step=Math.min(Math.max(0,gap-(direct&&visible?Math.max(0,range-1e-8):0)),effectiveSpeed(unit,clock)*Math.max(0,dtMs)/1000);
  return gap>0&&step>0?setCombatPosition(s,unit,{x:p.x+(waypoint.x-p.x)*step/gap,y:p.y+(waypoint.y-p.y)*step/gap}):false;
 }
 // Stop infinitesimally inside the boundary: rounding a diagonal endpoint can
 // otherwise leave both actors at 5.000000000000001 yards forever.
 const stopRange=Math.max(0,range-1e-10);
 const p=point(unit),q=point(target),length=distance(unit,target),step=Math.min(Math.max(0,length-stopRange),effectiveSpeed(unit,clock)*Math.max(0,dtMs)/1000);
 if(!length||!step)return false;
 return setCombatPosition(s,unit,terrainStep(s,unit,p,walkingEndpoint(s,unit,p,{x:p.x+(q.x-p.x)/length*step,y:p.y+(q.y-p.y)/length*step})));
}
export function moveAway(s,unit,target,clock,dtMs=100){
 const p=point(unit),q=point(target),length=distance(unit,target)||1,step=effectiveSpeed(unit,clock)*Math.max(0,dtMs)/1000;
 return setCombatPosition(s,unit,terrainStep(s,unit,p,walkingEndpoint(s,unit,p,{x:p.x+((p.x-q.x)||(!distance(unit,target)?1:0))/length*step,y:p.y+(p.y-q.y)/length*step})));
}
export const aliveEnemy=e=>e.hp>0&&!e.removed&&!['weakened','captured'].includes(e.capturePhase);
export const selfArea=sp=>['Frost Nova','Arcane Explosion','Thunder Clap','Whirlwind','Demoralizing Shout','Demoralizing Roar','Intimidating Shout','Psychic Scream','Howl of Terror','Holy Wrath','Consecration','Holy Nova','Hellfire','Blast Wave','Cone of Cold','Swipe'].includes(sp.SpellName);
export const groundArea=sp=>['Flamestrike','Blizzard','Rain of Fire','Hurricane','Volley'].includes(sp.SpellName);
export function spellRadius(sp){return sp.radius||({'Frost Nova':10,'Arcane Explosion':10,'Flamestrike':5,'Blizzard':8,'Thunder Clap':8,'Cleave':5,'Swipe':5}[sp.SpellName]||0);}
export function castRange(sp){return selfArea(sp)?spellRadius(sp):sp.range||0;}
export function inSpellRange(c,target,sp){if(target?.airborne&&castRange(sp)<=5)return false;const d=distance(c,target);return d<=castRange(sp)+1e-9&&d>=(sp.minRange||0)&&arenaSight(c,target);}
export function areaTargets(s,c,e,sp,center,options={}){
 const enemies=(s.combat?.enemies||[]).filter(u=>aliveEnemy(u)&&!u.controlledBy),radius=spellRadius(sp);
 if(['Multi-Shot','Chain Lightning'].includes(sp.SpellName)){
  const candidates=enemies.filter(u=>e&&distance(e,u)<=10&&inSpellRange(c,u,sp)).sort((a,b)=>a.id===e?.id?-1:b.id===e?.id?1:distance(e,a)-distance(e,b));
  return options.uncapped?candidates:candidates.slice(0,sp.MaxAffectedTargets||sp.EffectChainTarget1||3);
 }
 if(sp.SpellName==='Cleave'){const candidates=enemies.filter(u=>distance(c,u)<=5).sort((a,b)=>(a.id===e?.id?-1:b.id===e?.id?1:distance(c,a)-distance(c,b)));return options.uncapped?candidates:candidates.slice(0,2);}
 if(!selfArea(sp)&&!groundArea(sp))return e&&aliveEnemy(e)?[e]:[];
 const origin=selfArea(sp)?c:center||e||c;
 const targets=enemies.filter(u=>distance(origin,u)<=radius+1e-9);
 return !options.uncapped&&sp.MaxAffectedTargets>0?targets.slice(0,sp.MaxAffectedTargets):targets;
}

export function detectsTarget(c,e,clock){if(!e.stealthed&&!e.invisible)return true;if(!arenaSight(c,e))return false;const detection=talentCombatDefense(c).stealthDetection+(c.classDetection?.until>clock?30:0),conceal=talentCombatDefense(e).stealthLevel;return distance(c,e)+1e-6<Math.max(1,5+(c.level-e.level)+(detection-conceal)/5);}
