import {environmentModifiers} from './class-environment.js';
import {rooted,controlled,movementMultiplier} from '../../../sim-core/src/combat-auras.js';
import {ranks,talentModifiers,talentCombatDefense} from './talent-effects.js';

import {point,distance} from '../../../sim-core/src/geometry.js';

export function effectiveSpeed(unit,clock){
 if(unit.cast?.controlChannel||unit.talentProcs?.spiritOfRedemption?.until>clock)return 0;
 if(rooted(unit,clock)||controlled(unit,clock)&&!(unit.auras||[]).some(a=>a.type===7&&a.until>clock))return 0;
 const speedBuff=Math.max(0,...(unit.auras||[]).filter(a=>a.until>clock&&a.type===31).map(a=>a.amount))/100;
 const slow=unit.slowUntil>clock?Math.max(0,1-(unit.slow||0)):1;
 return Math.max(0,(['swim','underwater'].includes(unit.environment?.mode)?environmentModifiers(unit,clock).swimSpeed:(unit.moveSpeed??7))*(1+Math.max(speedBuff,talentModifiers(unit).movementPct||0))*(unit.sprintUntil>clock?1.5:1)*(unit.stealthed?.5+.03*(ranks(unit).Camouflage||0):1)*Math.min(slow,movementMultiplier(unit,clock)));
}
export function moveToward(unit,target,range,clock,dtMs=100){
 // Stop infinitesimally inside the boundary: rounding a diagonal endpoint can
 // otherwise leave both actors at 5.000000000000001 yards forever.
 const stopRange=Math.max(0,range-1e-10);
 const p=point(unit),q=point(target),length=distance(unit,target),step=Math.min(Math.max(0,length-stopRange),effectiveSpeed(unit,clock)*Math.max(0,dtMs)/1000);
 if(!length||!step)return false;
 unit.position=p.x+(q.x-p.x)/length*step;unit.positionY=p.y+(q.y-p.y)/length*step;return true;
}
export function moveAway(unit,target,clock,dtMs=100){
 const p=point(unit),q=point(target),length=distance(unit,target)||1,step=effectiveSpeed(unit,clock)*Math.max(0,dtMs)/1000;
 unit.position=p.x+((p.x-q.x)||(!distance(unit,target)?1:0))/length*step;unit.positionY=p.y+(p.y-q.y)/length*step;
 return step>0;
}
export const aliveEnemy=e=>e.hp>0&&!e.removed&&!['weakened','captured'].includes(e.capturePhase);
export const selfArea=sp=>['Frost Nova','Arcane Explosion','Thunder Clap','Whirlwind','Demoralizing Shout','Demoralizing Roar','Intimidating Shout','Psychic Scream','Howl of Terror','Holy Wrath','Consecration','Holy Nova','Hellfire','Blast Wave','Cone of Cold','Swipe'].includes(sp.SpellName);
export const groundArea=sp=>['Flamestrike','Blizzard','Rain of Fire','Hurricane','Volley'].includes(sp.SpellName);
export function spellRadius(sp){return sp.radius||({'Frost Nova':10,'Arcane Explosion':10,'Flamestrike':5,'Blizzard':8,'Thunder Clap':8,'Cleave':5,'Swipe':5}[sp.SpellName]||0);}
export function castRange(sp){return selfArea(sp)?spellRadius(sp):sp.range||0;}
export function inSpellRange(c,target,sp){const d=distance(c,target);return d<=castRange(sp)+1e-9&&d>=(sp.minRange||0);}
export function areaTargets(s,c,e,sp,center,options={}){
 const enemies=(s.combat?.enemies||[]).filter(aliveEnemy),radius=spellRadius(sp);
 if(sp.SpellName==='Cleave'){const candidates=enemies.filter(u=>distance(c,u)<=5).sort((a,b)=>(a.id===e?.id?-1:b.id===e?.id?1:distance(c,a)-distance(c,b)));return options.uncapped?candidates:candidates.slice(0,2);}
 if(!selfArea(sp)&&!groundArea(sp))return e&&aliveEnemy(e)?[e]:[];
 const origin=selfArea(sp)?c:center||e||c;
 const targets=enemies.filter(u=>distance(origin,u)<=radius+1e-9);
 return !options.uncapped&&sp.MaxAffectedTargets>0?targets.slice(0,sp.MaxAffectedTargets):targets;
}

export function detectsTarget(c,e,clock){if(!e.stealthed&&!e.invisible)return true;const detection=talentCombatDefense(c).stealthDetection+(c.classDetection?.until>clock?30:0),conceal=talentCombatDefense(e).stealthLevel;return distance(c,e)+1e-6<Math.max(1,5+(c.level-e.level)+(detection-conceal)/5);}
