import {dungeonBossSkills} from './dungeon-boss-skills.js';
import {enemy,roll,log,stats,armorReduction} from './character.js';
import {items} from './catalog.js';
import {weaponAttack} from './weapon-attacks.js';
import {moveToward} from './combat-space.js';
import {castEnemySpell} from './enemy-spells.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {hasSpellAura,controlled} from '../../../sim-core/src/combat-auras.js';
import {setCombatPosition,boundedCombatPoint} from './combat-area.js';

const delay=(s,value)=>Array.isArray(value)?roll(s,...value):value;
export function dungeonCharmTick(s,c,actors,hurt){
 if(!s.combat?.dungeon)return false;
 const charm=(c.auras||[]).find(a=>a.type===6&&a.until>s.clock&&s.combat.enemies.some(e=>e.id===a.caster&&e.hp>0&&!e.removed));
 if(!charm)return false;
 c.cast=null;if(controlled(c,s.clock))return true;
 const target=actors.filter(a=>a.id!==c.id&&a.hp>0&&!a.totemUnit).sort((a,b)=>distance(a,c)-distance(b,c))[0];
 if(!target)return true;
 if(distance(c,target)>5){moveToward(s,c,target,5,s.clock);return true;}
 if((c.charmNextAttack||0)>s.clock)return true;
 const weapon=items[c.equipment?.[16]?.id],speed=weapon?.delay||2000,attack=weaponAttack(s,c,target);
 c.charmNextAttack=s.clock+speed;
 if(attack.landed){const damage=(roll(s,weapon?.dmg_min1||1,weapon?.dmg_max1||2)+stats(c).attackPower/14*speed/1000)*attack.multiplier*(1-armorReduction(stats(target).armor,c.level));hurt(s,c,target,damage,'阿鲁高的诅咒',{spellId:charm.spell,school:0});}
 return true;
}
function add(s,e,entry,count=1){
 for(let n=0;n<count;n++){
  const sequence=s.combat.summonSequence=(s.combat.summonSequence||0)+1;
  const child=enemy(s,entry,`boss-summon-${sequence}`);
  setCombatPosition(s,child,boundedCombatPoint(s.combat.area,{x:e.position+5+(n%3)*2,y:(e.positionY||0)+Math.floor(n/3)*2}));
  child.summonedBy=e.id;child.target=e.target;child.nextAttack=s.clock+child.swing;
  // Script reinforcements do not duplicate the room's persistent loot.
  child.rewarded=true;s.combat.enemies.push(child);
 }
 log(s,`${e.name} 呼唤了增援！`,'combat',{actorId:e.id});
}
export function dungeonBossPhaseTick(s,actors,hurt){
 const battle=s.combat;if(!battle?.dungeon)return;
 for(const room of battle.gandlingRooms||[]){
  if(room.closed)continue;
  const target=actors.find(c=>c.id===room.target);
  if(!target||target.hp<=0||room.guards.every(id=>!battle.enemies.some(e=>e.id===id&&e.hp>0))){
   room.closed=true;
   if(target?.hp>0){setCombatPosition(s,target,room.origin);target.cast=null;log(s,target.name+' 清理侧室守卫，返回大厅。','combat',{actorId:target.id});}
  }
 }
 const mograine=battle.enemies.find(e=>e.entry===3976),whitemane=battle.enemies.find(e=>e.entry===3977);
 if(mograine&&whitemane){
  const phase=battle.cathedral??={stage:'commander'};
  if(phase.stage==='commander'){
   whitemane.removed=true;
   if(mograine.hp<=0){mograine.hp=1;mograine.removed=true;mograine.cast=null;mograine.dots=[];mograine.auras=[];whitemane.removed=false;phase.stage='inquisitor';log(s,'怀特迈恩加入战斗！','combat',{actorId:whitemane.id});}
  }
  if(phase.stage==='inquisitor'&&whitemane.hp>0&&whitemane.hp/whitemane.maxHp<=.5){
   if(castEnemySpell(s,whitemane,whitemane,9256,actors,hurt,2)){phase.stage='resurrection';phase.until=s.clock+7000;whitemane.cast=null;log(s,'怀特迈恩开始复活莫格莱尼！','combat',{actorId:whitemane.id});}
  }
  if(phase.stage==='resurrection'&&s.clock>=phase.until&&whitemane.hp>0){
   mograine.removed=false;mograine.hp=mograine.maxHp;mograine.rewarded=false;mograine.nextAttack=s.clock+1000;whitemane.hp=whitemane.maxHp;phase.stage='together';
   log(s,'莫格莱尼复活，两位首领同时作战！','combat',{actorId:mograine.id,spellId:9232});
  }
  // Killing the inquisitor before resurrection still requires finishing the commander.
  if(whitemane.hp<=0&&mograine.removed){mograine.removed=false;mograine.hp=0;phase.stage='complete';}
 }
 for(const e of [...battle.enemies])if(e.entry===3975&&e.hp<=0&&!e.traineesSpawned){e.traineesSpawned=true;add(s,e,6575,20);}
}
export function dungeonBossTick(s,e,actors,hurt){
 const skills=dungeonBossSkills[e.entry];if(!skills||!s.combat?.dungeon)return false;
 const p=e.dungeonBoss??={timers:skills.map(skill=>s.clock+delay(s,skill.first)),phase:0,nextSpecial:s.clock+(e.entry===1853?16000:10000)};
 const cast=(id,target=e,flags=0)=>castEnemySpell(s,e,target,id,actors,hurt,flags);
 const health=e.hp/e.maxHp,victim=actors.find(c=>c.id===e.target&&c.hp>0);
 if(e.entry===3977&&s.combat.cathedral?.stage==='resurrection')return true;
 if(controlled(e,s.clock))return true;
 if(e.entry===1853&&health>.03&&s.clock>=p.nextSpecial){
  const candidates=actors.filter(c=>c.hp>0&&!c.petUnit&&!c.totemUnit&&!(s.combat.gandlingRooms||[]).some(r=>!r.closed&&r.target===c.id));
  if(candidates.length){
   const target=candidates[roll(s,0,candidates.length-1)],area=s.combat.area,room={target:target.id,origin:{x:target.position,y:target.positionY||0},guards:[],closed:false};
   const corner={x:area.minX+8,y:roll(s,0,1)?area.maxY-8:area.minY+8};setCombatPosition(s,target,corner);target.cast=null;target.target=null;delete e.threat[target.id];e.target=actors.find(c=>c!==target&&c.hp>0)?.id||target.id;
   for(let i=0,count=roll(s,3,4);i<count;i++){
    const sequence=s.combat.summonSequence=(s.combat.summonSequence||0)+1,guard=enemy(s,11598,'gandling-guardian-'+sequence);
    guard.summonedBy=e.id;guard.rewarded=true;guard.target=target.id;guard.threat[target.id]=1000;guard.nextAttack=s.clock+1000;setCombatPosition(s,guard,{x:corner.x+3+i,y:corner.y});s.combat.enemies.push(guard);room.guards.push(guard.id);
   }
   s.combat.gandlingRooms??=[];s.combat.gandlingRooms.push(room);p.nextSpecial=s.clock+roll(s,20000,35000);
   log(s,'黑暗院长将 '+target.name+' 传送至侧室，亡灵守卫出现！（战场侧翼改编）','combat',{actorId:e.id,targetId:target.id,spellId:17950});
  }
 }
 if(e.entry===6487){
  if(!p.phase&&health<=.5&&cast(9438)){p.phase=1;p.detonate=s.clock+1000;}
  if(p.detonate&&s.clock>=p.detonate&&cast(9435))p.detonate=0;
  if(hasSpellAura(e,9438,s.clock))return true;
 }
 if(e.entry===3975&&!p.phase&&health<=.3&&cast(8269))p.phase=1;
 if(e.entry===7800&&s.clock>=p.nextSpecial){add(s,e,7915);p.nextSpecial=s.clock+delay(s,health<.5?[6000,12000]:[12000,17000]);}
 if(e.entry===2748){
  if(p.phase<1&&health<.666){add(s,e,7076,4);p.phase=1;}
  if(p.phase<2&&health<.332){add(s,e,10120,2);p.phase=2;}
  if(health>=.33&&s.clock>=p.nextSpecial){add(s,e,7309);p.nextSpecial=s.clock+delay(s,[9000,12000]);}
 }
 for(const [index,skill] of skills.entries()){
  if(s.clock<p.timers[index]||skill.below&&health*100>skill.below||skill.near&&(!victim||distance(e,victim)>skill.near))continue;
  const others=actors.filter(c=>c.hp>0&&c.id!==e.target&&!c.totemUnit);
  const target=skill.target==='self'?e:skill.target==='other'?others.length?others[roll(s,0,others.length-1)]:null:victim;
  const spell=e.entry===7800&&health<.5?11130:skill.spell;
  if(target&&cast(spell,target))p.timers[index]=s.clock+delay(s,skill.repeat);
 }
 return false;
}
