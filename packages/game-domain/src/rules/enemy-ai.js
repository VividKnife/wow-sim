import {distance,point} from '../../../sim-core/src/geometry.js';
import {lookup,spells,table} from './catalog.js';
import {roll,rng,log} from './character.js';
import {hasSpellAura,controlled} from '../../../sim-core/src/combat-auras.js';
import {castEnemySpell,enemySpellInfo,tickEnemySpell} from './enemy-spells.js';

const scripts=Object.groupBy(table('creature_ai_scripts'),row=>row.creature_id);
const alive=u=>u.hp>0&&!u.removed;
function behindVictim(s,e,victim){
 // This 2D combat model has no persistent facing angle: an actor faces its
 // current combat target. Without that target, do not invent a rear arc.
 const facing=s.combat.enemies.find(u=>alive(u)&&u.id===(victim?.cast?.target||victim?.target));
 if(!victim||!facing)return false;
 const origin=point(victim),front=point(facing),attacker=point(e);
 return (front.x-origin.x)*(attacker.x-origin.x)+(front.y-origin.y)*(attacker.y-origin.y)<0;
}
function targetFor(s,e,actors,type,spell,flags,eventTarget){
 const sp=enemySpellInfo(e,spell),victim=actors.find(c=>c.id===e.target&&alive(c));
 if(type===0||type===15)return e;
 if(type===12)return eventTarget;
 if(type===1)return victim;
 let candidates=actors.filter(alive).filter(c=>!(flags&32)||!hasSpellAura(c,spell,s.clock));
 if(sp&&!(flags&6))candidates=candidates.filter(c=>distance(c,e)<=sp.range);
 if(type===5)candidates=candidates.filter(c=>c.id!==e.target);
 if(type===17){const radius=Math.max(...[1,2,3].map(n=>lookup.SpellRadius[spells[spell]['EffectRadiusIndex'+n]]?.radiusYards||0));return actors.some(c=>alive(c)&&distance(c,e)<=radius)?e:null;}
 if(type===4||type===5)return candidates.length?candidates[Math.floor(rng(s)*candidates.length)]:null;
 return null;
}
function action(s,e,row,n,actors,hurt,eventTarget){
 const type=row[`action${n}_type`],a=row[`action${n}_param1`],b=row[`action${n}_param2`],c=row[`action${n}_param3`];
 if(!type)return true;
 if(type===11)return castEnemySpell(s,e,targetFor(s,e,actors,b,a,c,eventTarget),a,actors,hurt,c);
 if(type===22){e.ai.phase=a;return true;}
 if(type===57){e.rangedDistance=b;e.rangedMode=a;return true;}
 if(type===25){e.fleeing=true;e.fleeUntil=s.clock+10000;e.cast=null;log(s,`${e.name} 试图逃跑！`,'combat',{actorId:e.id});return true;}
 if(type===1){e.lastBroadcastId=a;return true;}
 return false;
}
function execute(s,e,row,actors,hurt,eventTarget){
 const state=e.ai.events[row.id];
 const succeeds=row.event_type===11?(e.spawnEventRolls?.[row.id]??rng(s)*100<row.event_chance):rng(s)*100<row.event_chance;
 if(succeeds){const first=action(s,e,row,1,actors,hurt,eventTarget);if(!first&&(row.event_flags&1024))return;for(let n=2;n<=3;n++)action(s,e,row,n,actors,hurt,eventTarget);}
 state.remaining=roll(s,row.event_param3,row.event_param4);
 if(!(row.event_flags&1)||[4,11].includes(row.event_type))state.done=true;
}
function initialize(s,e,actors,hurt){
 const rows=scripts[e.entry]||[];
 e.ai={phase:0,lastAt:s.clock,nextCheck:s.clock+500,events:Object.fromEntries(rows.map(row=>[row.id,{remaining:row.event_type===0?roll(s,row.event_param1,row.event_param2):row.event_type===16?roll(s,row.event_param3,row.event_param4):0,done:false}]))};
 // Spawn/passive setup precedes aggro. Ambient speech timers are not combat actions.
 for(const row of rows)if(row.event_type===11||row.event_type===1&&row.event_param1===0)execute(s,e,row,actors,hurt,null);
 for(const row of rows)if(row.event_type===4)execute(s,e,row,actors,hurt,null);
}
export function enemyDesiredRange(s,e){
 const main=(scripts[e.entry]||[]).flatMap(row=>[1,2,3].filter(n=>row[`action${n}_type`]===11&&(row[`action${n}_param3`]&256)).map(n=>row[`action${n}_param1`]));
 return e.rangedMode&&main.some(id=>e.mana>=enemySpellInfo(e,id).mana)?e.rangedDistance:5;
}
export function enemyAITick(s,e,actors,hurt){
 if(!e.ai)initialize(s,e,actors,hurt);
 if(e.fleeing&&s.clock>=e.fleeUntil)e.fleeing=false;
 tickEnemySpell(s,e,actors,hurt);
 if(s.clock<e.ai.nextCheck)return;
 const elapsed=s.clock-e.ai.lastAt;e.ai.lastAt=s.clock;e.ai.nextCheck=s.clock+500;
 const rows=scripts[e.entry]||[];
 for(const row of rows){
  const state=e.ai.events[row.id];if(state.done||row.event_inverse_phase_mask&(1<<e.ai.phase))continue;
  state.remaining=Math.max(0,state.remaining-elapsed);
  if(state.remaining>0||![0,2,9,16,27,33].includes(row.event_type)||controlled(e,s.clock)||e.fleeing)continue;
  if((row.event_flags&1024)&&(e.cast||(e.nextAction||0)>s.clock))continue;
  const victim=actors.find(c=>c.id===e.target&&alive(c)),ranged=enemyDesiredRange(s,e)>5&&victim&&distance(e,victim)>5;
  if(row.event_type===9&&(!victim||distance(e,victim)<row.event_param1||distance(e,victim)>row.event_param2))continue;
  if(row.event_type===33&&(!victim||behindVictim(s,e,victim)!==(row.event_param1===0)))continue;
  if(row.event_flags&256&&!ranged||row.event_flags&512&&ranged)continue;
  if(row.event_type===2){const hp=Math.floor(e.hp/e.maxHp*100);if(hp>row.event_param1||hp<row.event_param2)continue;}
  if(row.event_type===27&&hasSpellAura(e,row.event_param1,s.clock))continue;
  let eventTarget=null;
  if(row.event_type===16){eventTarget=s.combat.enemies.find(c=>alive(c)&&distance(c,e)<=row.event_param2&&!hasSpellAura(c,row.event_param1,s.clock));if(!eventTarget)continue;}
  execute(s,e,row,actors,hurt,eventTarget);
 }
}
