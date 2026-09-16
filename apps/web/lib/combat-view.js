import {controlled,hasAura,rooted} from './game/combat-auras.js';
import {distance,point} from './game/combat-space.js';
export function actionProgress(start,end,clock){if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 0;return Math.max(0,Math.min(1,(clock-start)/(end-start)));}
export function meleeStatus(actor,battle,clock){
 if(!battle)return{kind:'ended',remaining:0};
 if(actor.hp<=0)return{kind:'dead',remaining:0};
 if(controlled(actor,clock))return{kind:hasAura(actor,7,clock)?'feared':'stunned',remaining:0};
 if(actor.cast)return{kind:'casting',remaining:0};
 if(actor.classId===5)return{kind:'nonMelee',remaining:0};
 const targets=battle.enemies.filter(e=>e.hp>0&&!e.removed&&!['weakened','captured'].includes(e.capturePhase));
 const target=targets.find(e=>!(e.polyUntil>clock))||targets[0];
 if(!target)return{kind:'waitingTarget',remaining:0};
 if(distance(target,actor)>5)return{kind:rooted(actor,clock)?'rooted':'approaching',remaining:0};
 const remaining=Math.max(0,(actor.nextSwing||0)-clock);
 return{kind:remaining?'waiting':'ready',remaining};
}
export function unitCondition(unit,clock){
 if(unit.hp<=0)return '';
 if(unit.polyUntil>clock)return '变形';
 if(unit.stunUntil>clock||hasAura(unit,12,clock))return '击晕';
 if(hasAura(unit,7,clock))return '恐惧';
 if(rooted(unit,clock))return '定身';
 if(hasAura(unit,67,clock))return '缴械';
 if(unit.fleeing)return '逃跑';
 if(unit.slowUntil>clock||hasAura(unit,33,clock)||(unit.movementSlows||[]).some(a=>a.until>clock))return '减速';
 return '';
}
export function conditionRemaining(unit,clock){
 const condition=unitCondition(unit,clock),type={'变形':0,'击晕':12,'恐惧':7,'定身':26,'缴械':67,'减速':33}[condition];
 const field={'变形':'polyUntil','击晕':'stunUntil','定身':'rootUntil','减速':'slowUntil'}[condition];
 return Math.max(0,(unit[field]||0)-clock,...(unit.auras||[]).filter(a=>a.type===type&&a.until>clock).map(a=>a.until-clock),...(condition==='减速'?(unit.movementSlows||[]).map(a=>a.until-clock):[]));
}
export function meleeProgress(actor,battle,clock){
 const {kind}=meleeStatus(actor,battle,clock);
 if(kind==='ready')return 1;
 return kind==='waiting'?actionProgress(actor.swingStartedAt,actor.nextSwing,clock):0;
}
export function classAttackStatus(actor,battle,clock,attack){
 const melee=()=>({label:'近战攻击',status:meleeStatus(actor,battle,clock),progress:meleeProgress(actor,battle,clock)});
 if(!attack)return melee();
 const blocked=!battle?'ended':actor.hp<=0?'dead':controlled(actor,clock)?(hasAura(actor,7,clock)?'feared':'stunned'):actor.cast?'casting':null;
 if(blocked)return{label:attack.label,status:{kind:blocked,remaining:0},progress:0};
 const available=battle.enemies.filter(e=>e.hp>0&&!e.removed&&!['weakened','captured'].includes(e.capturePhase)&&!(e.polyUntil>clock)&&!(e.controlledBy&&e.controlUntil>clock));
 const target=available.find(e=>e.id===actor.target)||available[0];
 if(!target)return{label:attack.label,status:{kind:'waitingTarget',remaining:0},progress:0};
 if(distance(actor,target)<attack.minRange)return melee();
 if(distance(actor,target)>attack.range)return{label:attack.label,status:{kind:rooted(actor,clock)?'rooted':'approaching',remaining:0},progress:0};
 const remaining=Math.max(0,(attack.until||0)-clock);
 return{label:attack.label,status:{kind:remaining?'waiting':'ready',remaining},progress:remaining?actionProgress(attack.startedAt,attack.until,clock):1};
}
export function enemyMeleeProgress(enemy,actors,clock){
 const target=actors.find(a=>a.id===enemy.target&&a.hp>0);
 if(enemy.hp<=0||enemy.removed||enemy.cast||controlled(enemy,clock)||enemy.fleeing||enemy.smite&&enemy.smite.stage!=='combat'||!target||distance(enemy,target)>5)return 0;
 if(clock>=enemy.nextAttack)return 1;
 return actionProgress(enemy.swingStartedAt??enemy.nextAttack-enemy.swing,enemy.nextAttack,clock);
}
export function recentCombatEvents(logs,afterId,clock){return logs.filter(l=>l.id>afterId&&l.at>=clock-3000&&['cast','damage','incoming','heal','miss','interrupt','impact','launch','cancel'].includes(l.kind));}
const replayDuration=e=>Math.min(1000,Math.max(160,e.landsAt-e.startedAt));
export function mergeCombatEffects(previous,incoming,now,projectiles=[]){
 const active=previous.filter(e=>now-e.shownAt<1500),ids=new Set(active.map(e=>e.id));
 const replay=incoming.filter(e=>e.kind==='launch'&&e.from&&e.to&&!projectiles.some(p=>p.id===e.projectileId));
 return [...active,...incoming.filter(e=>!ids.has(e.id)).map(e=>{const flight=!e.periodic&&['damage','incoming','miss'].includes(e.kind)&&replay.find(p=>p.actorId===e.actorId&&p.targetId===e.targetId&&p.spellId===e.spellId);return{...e,shownAt:now+(flight?replayDuration(flight):0),replayFlight:replay.includes(e)};})].slice(-40);
}
export function presentationProjectiles(projectiles,effects,clock,now,units=[]){
 const flights=[...projectiles,...effects.filter(e=>e.replayFlight&&now>=e.shownAt&&now-e.shownAt<replayDuration(e)&&!projectiles.some(p=>p.id===e.projectileId)).map(e=>({...e,id:e.projectileId||e.id,startedAt:clock-(now-e.shownAt),landsAt:clock+replayDuration(e)-(now-e.shownAt)}))];
 // Homing is presentation only: preserve the serialized launch and hit timing.
 return flights.map(flight=>{const target=units.find(unit=>unit.id===flight.targetId);return target?{...flight,to:point(target)}:flight;});
}
export function battleLayout(allies,enemies){
 const positions=[...allies,...enemies].map(point),minX=Math.min(0,...positions.map(p=>p.x))-6,maxX=Math.max(35,...positions.map(p=>p.x))+6;
 const minY=Math.min(-8,...positions.map(p=>p.y))-5,maxY=Math.max(8,...positions.map(p=>p.y))+5;
 const width=1000,height=440,scale=Math.min(880/(maxX-minX),320/(maxY-minY));
 const originX=(width-(maxX-minX)*scale)/2-minX*scale,originY=(height-(maxY-minY)*scale)/2-minY*scale;
 /** @type {Record<string,{left:number,top:number}>} */
 const units={};
 for(const u of [...allies,...enemies]){const p=point(u);units[u.id]={left:(originX+p.x*scale)/10,top:originY+p.y*scale};}
 return {units,width,height,scale,originX,originY};
}
export function fieldPoint(layout,p){return{x:layout.originX+p.x*layout.scale,y:layout.originY+p.y*layout.scale};}
export function projectilePoint(projectile,clock){const t=actionProgress(projectile.startedAt,projectile.landsAt,clock);return{x:projectile.from.x+(projectile.to.x-projectile.from.x)*t,y:projectile.from.y+(projectile.to.y-projectile.from.y)*t};}
export function schoolColor(school,heal=false){return heal?'#74e7a0':({0:'#dfc8a0',1:'#ffe99b',2:'#ff9855',3:'#9cda6d',4:'#80d8ff',5:'#bb8ee9',6:'#d599ef'})[school]||'#dad3b1';}
