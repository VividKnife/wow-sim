import reference from '../../data/deadmines-reference.json' with {type:'json'};
import {creatures} from './catalog.js';
import {log} from './character.js';
import {castEnemySpell} from './enemy-spells.js';
import {distance,moveToward} from './combat-space.js';

const {smiteChest:chest,smiteSpawn:spawn}=reference.scriptObjects;
const chestDistance=Math.hypot(chest.position_x-spawn.position_x,chest.position_y-spawn.position_y,chest.position_z-spawn.position_z);
const runSpeed=7*creatures[646].SpeedRun;
// Project the source chest distance onto the encounter axis; no navmesh is available.
export const smiteChestPosition=30+Math.max(0,chestDistance-.5);
export function initializeSmite(s,e,actors,hurt){
 if(e.entry!==646||e.smite)return;
 e.smite={phase:1,stage:'combat',lastAt:s.clock,slamRemaining:9000,chestPosition:smiteChestPosition};e.weapons=[2179];e.dualWield=false;
 castEnemySpell(s,e,e,6433,actors,hurt,2);
}
export function smiteTick(s,e,actors,hurt){
 if(e.entry!==646)return false;initializeSmite(s,e,actors,hurt);
 const p=e.smite,elapsed=Math.max(0,s.clock-p.lastAt);p.lastAt=s.clock;
 if(p.stage==='waiting'){
  if(s.clock>=p.until){p.stage='running';log(s,'重拳先生跑向武器箱！','combat',{actorId:e.id});}
  return true;
 }
 if(p.stage==='running'){
  const destination={position:p.chestPosition,positionY:0};
  e.moveSpeed??=runSpeed;moveToward(e,destination,0,s.clock,elapsed);
  if(distance(e,destination)<.001){p.stage='kneeling';p.until=s.clock+3000;e.weapons=[];e.dualWield=false;log(s,'重拳先生正在更换武器。','combat',{actorId:e.id});}
  return true;
 }
 if(p.stage==='kneeling'){
  if(s.clock>=p.until){
   const hammer=e.hp/e.maxHp<.33;e.weapons=hammer?[10756]:[2183,2183];e.dualWield=!hammer;
   if(hammer)castEnemySpell(s,e,e,6436,actors,hurt);
   p.stage='standing';p.until=s.clock+1000;
  }
  return true;
 }
 if(p.stage==='standing'){
  if(s.clock>=p.until){
   p.phase=e.hp/e.maxHp<.33?3:2;p.stage='combat';p.phaseStartedAt=s.clock;
   if(p.phase===2)castEnemySpell(s,e,e,12787,actors,hurt,2);
   const target=actors.filter(c=>c.hp>0).sort((a,b)=>(e.threat[b.id]||0)-(e.threat[a.id]||0))[0];e.target=target?.id;
   e.nextAttack=s.clock;e.nextOffhand=s.clock;
   log(s,`重拳先生换上了${e.weapons[0]===10756?'重锤':'双斧'}，重新发起攻击！`,'combat',{actorId:e.id});
  }
  return true;
 }
 if(p.phase===1&&e.hp/e.maxHp<.66||p.phase===2&&e.hp/e.maxHp<.33){
  if(castEnemySpell(s,e,e,6432,actors,hurt)){
   e.auras=(e.auras||[]).filter(a=>![6433,12787].includes(a.spell));p.stage='waiting';p.until=s.clock+2500;e.target=null;e.cast=null;
  }
  return true;
 }
 if(p.phase===3){
  p.slamRemaining=Math.max(0,p.slamRemaining-elapsed);
  const victim=actors.find(c=>c.id===e.target&&c.hp>0);
  if(p.slamRemaining===0&&victim&&castEnemySpell(s,e,victim,6435,actors,hurt))p.slamRemaining=11000;
 }
 return false;
}
