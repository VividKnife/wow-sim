import {point,distance} from '../../../sim-core/src/geometry.js';
import {simulationEventRuntime,combatDeadline,advanceSimulationEvents,projectilePhases as phases,PROJECTILE_CAPACITY} from './simulation-events.js';
import {log} from './character.js';
export {PROJECTILE_CAPACITY};
const hunterShotVisual=(c,sp)=>c.classId===3&&(/Shot$/.test(sp.SpellName||'')||sp.SpellName==='Auto Shot')?'hunter-shot':null;

export function launchProjectile(s,c,target,sp,side='friendly',options={}){
 const visual=options.visual||hunterShotVisual(c,sp),speed=sp.Speed>0?sp.Speed:(visual?45:0);
 if(!s.combat||!speed||distance(c,target)===0)return false;
 if(!Object.hasOwn(phases,side))throw new Error('Unknown projectile side');
 if(s.arenaAllActors&&![0,1].includes(c.teamId))throw new Error('Arena projectile requires its originating team');
 const battle=s.combat,owned=simulationEventRuntime(s),storage=s.simulationEvents;
 if(owned.records.length+storage.ready.friendly.length+storage.ready.enemy.length>=PROJECTILE_CAPACITY)throw new Error('Projectile capacity exceeded');
 const sequence=(battle.projectileSequence||0)+1;
 if(!Number.isSafeInteger(sequence)||sequence<1)throw new Error('Projectile sequence exhausted');
 const id=`${battle.id}:p${sequence}`;
 const projectile={id,sequence,...(s.arenaAllActors?{teamId:c.teamId}:{}),actorId:c.id,targetId:target.id,spellId:sp.Id,school:sp.School,side,talentCast:sp.talentCast||null,visual,presentationOnly:!!options.presentationOnly,from:point(c),to:point(target),startedAt:s.clock,landsAt:s.clock+Math.max(1,Math.ceil(distance(c,target)/speed*1000))};
 owned.queue.schedule({kind:'ProjectileImpact',atMs:combatDeadline(s,projectile.landsAt),phase:phases[side],entitySlot:0,entityGeneration:1,subjectId:sequence,subjectVersion:1});
 battle.projectileSequence=sequence;owned.index.set(sequence,owned.records.length);owned.records.push(projectile);
 const {id:projectileId,...event}=projectile;log(s,'法术飞向目标','launch',{...event,projectileId});
 return true;
}
export function takeImpacts(s,side){
 const battle=s.combat;if(!s.simulationEvents){if(battle?.projectiles?.length)throw new Error('Projectile records require their event queue');return [];}
 if(!Object.hasOwn(phases,side))throw new Error('Unknown projectile side');
 advanceSimulationEvents(s,phases[side]);
 const ready=s.simulationEvents.ready[side];
 // Both arena teams share a heap, but each pass resolves its own projectiles.
 const due=s.arenaAllActors?ready.filter(p=>p.teamId===s.teamId):ready;
 s.simulationEvents.ready[side]=s.arenaAllActors?ready.filter(p=>p.teamId!==s.teamId):[];
 return due.filter(p=>!p.presentationOnly);
}
