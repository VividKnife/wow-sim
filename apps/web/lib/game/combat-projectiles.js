import {point,distance} from './combat-space.js';
import {log} from './character.js';

// A serializable authority queue. Renderers may interpolate it, never settle it.
export function launchProjectile(s,c,target,sp,side='friendly'){
 if(!s.combat||!(sp.Speed>0)||distance(c,target)===0)return false;
 const battle=s.combat,id=`${battle.id}:p${battle.projectileSequence=(battle.projectileSequence||0)+1}`;
 const projectile={id,actorId:c.id,targetId:target.id,spellId:sp.Id,school:sp.School,side,talentCast:sp.talentCast||null,from:point(c),to:point(target),startedAt:s.clock,landsAt:s.clock+Math.max(1,Math.ceil(distance(c,target)/sp.Speed*1000))};
 (battle.projectiles??=[]).push(projectile);
 const {id:projectileId,...event}=projectile;log(s,'法术飞向目标','launch',{...event,projectileId});
 return true;
}
export function takeImpacts(s,side){
 const projectiles=s.combat?.projectiles||[],due=projectiles.filter(p=>p.side===side&&p.landsAt<=s.clock);
 if(s.combat)s.combat.projectiles=projectiles.filter(p=>!(p.side===side&&p.landsAt<=s.clock));
 return due;
}
