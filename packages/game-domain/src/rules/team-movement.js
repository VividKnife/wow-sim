import {moveToward,effectiveSpeed} from './combat-space.js';
import {scenePointAllowed} from '../../../sim-core/src/scene-space.js';
import {point,distance} from '../../../sim-core/src/geometry.js';
import {controlled} from '../../../sim-core/src/combat-auras.js';
import {fieldContains} from '../../../sim-core/src/encounter-geometry.js';

// Serializable player tasks. Navigation and ordinary combat still own motion
// and spell legality; a task never writes coordinates, resources or damage.
export const teamMovementTask=(s,c)=>s.combat?.command?.movementTasks?.find(t=>t.memberId===c.id);
function status(s,t,value,reason=''){
 if(t.status!==value||t.reason!==reason){t.status=value;t.reason=reason;t.updatedAt=s.clock;}
}
function finish(s,t,value,reason){
 const command=s.combat.command;status(s,t,value,reason);
 command.movementResults=[...(command.movementResults||[]),{...t,destination:{...t.destination}}].slice(-40);
 command.movementTasks=command.movementTasks.filter(row=>row.sequence!==t.sequence);
}
export function cancelTeamMovement(s,ids,reason='已撤销站位'){
 for(const t of [...(s.combat?.command?.movementTasks||[])])if(!ids||ids.includes(t.memberId))finish(s,t,'cancelled',reason);
}
export function validateTeamDestination(s,value){
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['x','y'].includes(k))||!Number.isFinite(value.x)||!Number.isFinite(value.y)||!s.combat?.area||!scenePointAllowed(s.combat.area,value))throw new Error('请选择场地内可通行的站位点');
 return {x:value.x,y:value.y};
}
export function assignTeamMovement(s,actors,destination){
 const command=s.combat.command;
 const sequence=command.movementSequence||0,ids=new Set(actors.map(c=>c.id));
 if(!Number.isSafeInteger(sequence)||sequence<0||!Number.isSafeInteger(sequence+actors.length))throw new Error('站位任务序号已耗尽');
 if((command.movementTasks||[]).filter(t=>!ids.has(t.memberId)).length+actors.length>40)throw new Error('站位任务数量超过上限');
 cancelTeamMovement(s,actors.map(c=>c.id),'被新的站位任务替换');
 command.movementTasks??=[];
 for(const c of actors){
  const sequence=command.movementSequence=(command.movementSequence||0)+1;
  command.movementTasks.push({sequence,memberId:c.id,destination:{...destination},radius:.75,status:'queued',reason:'',receivedAt:s.clock,updatedAt:s.clock,lastProgressAt:s.clock,bestDistance:distance(c,destination),retryAt:0});
  c.scenePath=null;c.policyMovement=null;c.cast=null;c.queuedStrike=null;c.nextAction=s.clock;
 }
}
export function pruneTeamMovement(s,actors){
 for(const task of [...(s.combat.command?.movementTasks||[])]){
  const c=actors.find(a=>a.id===task.memberId);
  if(!c||c.hp<=0||c.removed)finish(s,task,'failed','成员已倒下或离场');
  else if((c.auras||[]).some(a=>a.type===6&&a.until>s.clock&&s.combat.enemies.some(e=>e.id===a.caster&&e.hp>0&&!e.removed)))status(s,task,'blocked','成员被敌方控制');
  else if(c.raidEvadingAt===s.clock)status(s,task,'blocked','正在撤离危险区');
 }
}
export function stepTeamMovement(s,c){
 const task=teamMovementTask(s,c);if(!task)return false;
 if(controlled(c,s.clock)||effectiveSpeed(c,s.clock)<=0){status(s,task,'blocked','等待解除移动限制');return false;}
 const raid=s.combat.raidEncounter;
 if(raid?.tactics?.avoidFire&&(raid.fires||[]).some(f=>f.startedAt<=s.clock&&f.until>s.clock&&!f.unavoidable&&f.soakActorId!==c.id&&fieldContains(f,task.destination,1))){status(s,task,'blocked','站位点处于已公开危险区');return false;}
 if(distance(c,task.destination)<=task.radius){status(s,task,'holding');return false;}
 const revision=s.combat.area.navigationRevision||0;
 if(task.retryAt>s.clock&&task.navigationRevision===revision)return false;
 task.navigationRevision=revision;
 // A displaced unit resumes its explicit station task. Existing GCD and
 // committed costs remain unchanged when its cast has to be interrupted.
 c.cast=null;c.policyMovement=null;
 const before=point(c),moved=moveToward(s,c,task.destination,task.radius,s.clock,100,{source:'team'}),gap=distance(c,task.destination);
 // Progress is toward the next route corner, not straight-line goal distance:
 // walking around a wall can legitimately move farther from the destination.
 const waypoint=c.scenePath?.points[0]||task.destination,remaining=distance(c,waypoint);
 if(!task.progressTarget||distance(task.progressTarget,waypoint)>1e-8||task.status==='holding'){
  task.progressTarget={...waypoint};task.bestDistance=remaining;task.lastProgressAt=s.clock;
 }else if(remaining<task.bestDistance-.1){task.bestDistance=remaining;task.lastProgressAt=s.clock;}
 if(gap<=task.radius+1e-8){status(s,task,'holding');task.retryAt=0;return true;}
 if(!moved&&distance(before,c)<1e-8||s.clock-task.lastProgressAt>=2000){
  status(s,task,'blocked',c.scenePath?.points.length===0?'站位点不可达':'路线受阻，等待重试');task.retryAt=s.clock+1000;task.lastProgressAt=s.clock;
 }else{status(s,task,'moving');task.retryAt=0;}
 return true;
}
