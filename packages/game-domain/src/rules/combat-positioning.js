import {commandOrder,commandProtected} from './combat-command.js';
import {distance,point} from '../../../sim-core/src/geometry.js';
import {combatMembers} from './combat-members.js';
import {isBackline,combatRole} from './combat-roles.js';
import {moveToward,moveAway,aliveEnemy,castRange,groundArea,selfArea,behindTarget} from './combat-space.js';
import {waitingTank,waitingForPull} from './combat-strategy.js';

export function usesPartyPositioning(s,c){
 return !c.petUnit&&!c.totemUnit&&!c.escortNpc&&combatMembers(s).filter(a=>!a.petUnit&&!a.totemUnit&&!a.escortNpc).length>1;
}
export function holdsBackline(s,c){return usesPartyPositioning(s,c)&&isBackline(c);}
// Short-range reactions may fire when an enemy gets close, but must not drag
// a backline caster into melee. Longer-range spells keep their actual range.
export function mayApproachForSpell(s,c,target,sp){
 return commandOrder(s,c)?.spellId===sp.Id||!holdsBackline(s,c)||sp.range>20||distance(c,target)<=sp.range;
}
// A moving target needs room to travel while the caster stands still. Only
// recent observed motion counts; stationary, incoming and ground targets keep
// their normal range. Motion is part of the snapshot for deterministic replay.
export function spellApproachRange(s,c,target,sp){
 let range=castRange(sp);const motion=target.combatMotion;
 if(!sp.castMs||groundArea(sp)||selfArea(sp))return range;
 if(c.castRangeFailure?.target===target.id&&c.castRangeFailure.until>s.clock)range=Math.max(sp.minRange||0,range-3);
 if(!motion||s.clock-motion.at>100||s.clock<motion.at)return range;
 const p=point(c),q=point(target),gap=distance(c,target);
 if(!gap||((q.x-p.x)*motion.x+(q.y-p.y)*motion.y)<=0)return range;
 const seconds=(sp.castMs+100)/1000,dx=motion.x*seconds,dy=motion.y*seconds;
 const radial=((q.x-p.x)*dx+(q.y-p.y)*dy)/gap;
 const lateralSquared=Math.max(0,dx*dx+dy*dy-radial*radial);
 // Do not pursue long casts all the way into melee. A later configured
 // instant can be selected while approaching this safe casting distance.
 return Math.min(range,Math.max(sp.minRange||0,Math.min(8,range),Math.sqrt(Math.max(0,range*range-lateralSquared))-radial));
}
function retreatWithSupport(s,c,enemy){
 const allies=combatMembers(s).filter(a=>a.id!==c.id&&a.hp>0&&!a.petUnit&&!a.totemUnit&&!a.escortNpc);
 if(!allies.length)return moveAway(s,c,enemy,s.clock);
 const center={position:0,positionY:0};
 for(const a of allies){const p=point(a);center.position+=p.x/allies.length;center.positionY+=p.y/allies.length;}
 const radius=12,gap=distance(c,center);
 if(gap>radius)return moveToward(s,c,center,radius,s.clock);
 const candidate={...c};
 if(!moveAway(s,candidate,enemy,s.clock))return false;
 if(distance(candidate,center)<=radius){c.position=candidate.position;c.positionY=candidate.positionY;return true;}
 // At the support boundary, turn around the group rather than continuing
 // straight away. Choose the side that gives more space from the pursuer.
 const p=point(c),angle=Math.atan2(p.y-center.positionY,p.x-center.position);
 const options=[-.25,.25].map(turn=>({position:center.position+radius*Math.cos(angle+turn),positionY:center.positionY+radius*Math.sin(angle+turn)}));
 options.sort((a,b)=>distance(b,enemy)-distance(a,enemy));
 return moveToward(s,c,options[0],0,s.clock);
}
export function recordCombatMotion(s,before){
 for(const e of s.combat.enemies){const previous=before.get(e.id);if(!previous)continue;const p=point(e);e.combatMotion={at:s.clock,x:(p.x-previous.x)*10,y:(p.y-previous.y)*10};}
}
export function positionPartyMember(s,c){
 const order=commandOrder(s,c),pursuer=order?.kind==='kite'&&s.combat.enemies.find(e=>e.id===order.targetId&&aliveEnemy(e));
 if(pursuer&&!c.cast){if(pursuer.target===c.id&&distance(c,pursuer)<16)return retreatWithSupport(s,c,pursuer);return false;}
 if(!holdsBackline(s,c)||c.cast)return false;
 const enemies=s.combat.enemies.filter(e=>aliveEnemy(e)&&!e.controlledBy&&!(e.polyUntil>s.clock));
 if(!enemies.length)return false;
 // Bring a loose mob back to the tank instead of kiting it away from rescue.
 const tank=waitingTank(s,c),loose=enemies.find(e=>e.target===c.id);
 if(tank&&loose)return distance(c,tank)>8?moveToward(s,c,tank,8,s.clock):false;
 // During the pull, hold the starting backline rather than chasing cast range.
 if(waitingForPull(s,c))return false;
 // Safe casters hold their position. Spell selection owns approaching cast
 // range; a generic 23–30 yard band fights shorter-range spells every tick.
 // Without a tank, only retreat from a mob actually pursuing this actor.
 if(loose&&distance(c,loose)<8)return retreatWithSupport(s,c,loose);
 return false;
}
export function rescueTarget(s,c,enemies){
 if(combatRole(c)!=='tank')return null;
 enemies=enemies.filter(e=>!commandProtected(s,e)&&!s.combat?.command?.orders.some(o=>o.kind==='kite'&&o.targetId===e.id&&combatMembers(s).some(a=>a.id===o.memberId&&a.hp>0)));
 const allies=combatMembers(s).filter(a=>a.hp>0&&a.id!==c.id);
 const endangered=enemies.filter(e=>allies.some(a=>a.id===e.target));
 endangered.sort((a,b)=>{
  const targetA=allies.find(c=>c.id===a.target),targetB=allies.find(c=>c.id===b.target);
  return Number(isBackline(targetB))-Number(isBackline(targetA))||distance(a,targetA)-distance(b,targetB);
 });
 return endangered[0]||enemies.find(e=>e.tauntedBy===c.id&&e.tauntUntil>s.clock)||enemies.find(e=>!(e.threat?.[c.id]>0))||null;
}

// Circle outside the frontal detection radius before closing on the rear.
// Use ordinary movement so roots, slows, terrain and replay all still apply.
export function approachRear(s,c,target,range){
 const p=point(c),q=point(target),gap=distance(c,target);
 const radius=Math.max(8,7+(target.level-c.level));
 if(behindTarget(c,target))return moveToward(s,c,target,Math.min(4,range),s.clock);
 const angle=gap?Math.atan2(p.y-q.y,p.x-q.x):target.combatFacing;
 if(gap>radius+.5)return moveToward(s,c,{x:q.x+radius*Math.cos(angle),y:q.y+radius*Math.sin(angle)},0,s.clock);
 const rear=target.combatFacing+Math.PI,delta=Math.atan2(Math.sin(rear-angle),Math.cos(rear-angle));
 const next=angle+(delta<0?-.25:.25);
 return moveToward(s,c,{x:q.x+radius*Math.cos(next),y:q.y+radius*Math.sin(next)},0,s.clock);
}
