import {sceneLayout} from './battle-scene.js';
import {presentationProjectiles} from './combat-view.js';

// Adapt the public arena projection; no character state or opponent AI is read.
/**
 * @param {any} match
 * @param {{selectedId?:string,zoom?:number,effects?:import('./battle-hd2d-types').BattleEffect[],sampledAt?:number,wallAt?:number,lowEffects?:boolean,reducedMotion?:boolean}} options
 */
export function arenaBattleScene(match,{selectedId,zoom=1,effects=[],sampledAt=0,wallAt=0,lowEffects=false,reducedMotion=false}={}){
 const units=match.teams.flatMap(team=>team.members).filter(c=>!c.hidden&&Number.isFinite(c.x)&&Number.isFinite(c.y)).map(c=>({
  id:c.id,name:c.name,hp:c.hp,maxHp:c.maxHp,classId:c.classId,raceId:c.raceId,gender:c.gender,level:c.level,entry:c.entry,form:c.form,kind:c.kind,creatureType:c.creatureType,
  petUnit:c.petUnit,totemUnit:c.totemUnit,foe:c.teamId===1,position:c.x,positionY:c.y,target:c.targetId,
  marker:c.id===(match.activeFocusId||match.plan.focusId)?'focus':c.id===match.plan.controlId?'control':undefined,
  polyUntil:Math.max(0,...c.effects.filter(a=>a.type===5).map(a=>a.until)),
  auras:c.effects.map(a=>({type:a.type,until:a.until,spell:a.spellId})),
  cast:c.cast?{spell:c.cast.spellId,school:c.cast.school,startedAt:c.cast.startedAt,until:c.cast.until,target:c.cast.targetId,channel:c.cast.channel,center:c.cast.center,range:c.cast.range,radius:c.cast.radius}:undefined,
 }));
 const visible=new Set(units.map(c=>c.id));
 const safeEffects=effects.filter(e=>(!e.actorId||visible.has(e.actorId))&&(!e.targetId||visible.has(e.targetId)));
 const selected=units.find(c=>c.id===selectedId)||units[0];
 return {encounterId:match.id,live:match.phase==='combat'||match.phase==='countdown',sampledAt,ground:'arena',
  endClock:match.phase==='countdown'?3000:match.phase==='finished'?match.clock:undefined,
  layout:sceneLayout(units.filter(c=>!c.foe),units.filter(c=>c.foe),zoom,match.map),units,clock:match.clock,
  selectedId:selected?.id||'',range:selected?.cast?.range||5,effects:safeEffects.filter(e=>e.shownAt<=wallAt),
  projectiles:presentationProjectiles(match.projectiles||[],safeEffects,match.clock,wallAt,units),
  groundEffects:[...(match.groundEffects||[]).filter(e=>!e.actorId||visible.has(e.actorId)),...units.filter(c=>c.cast?.channel&&c.cast.center&&c.cast.radius>0).map(c=>({actorId:c.id,spellId:c.cast.spell,center:c.cast.center,radius:c.cast.radius,startedAt:c.cast.startedAt,until:c.cast.until,school:c.cast.school}))],lowEffects,reducedMotion};
}
