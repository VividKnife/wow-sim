import {addRaidField,raidFieldsTick} from './raid-battlefield.js';
import {rectangleField,sectorField} from '../../../sim-core/src/encounter-geometry.js';
import {raidEnemy} from './molten-core-content.js';
import {raidNotice,raidAnimation} from './molten-core-mechanics.js';
import {raidCommandTick} from './raid-command.js';
import {combatRole} from './combat-roles.js';
import {roll} from './character.js';
import {moveToward} from './combat-space.js';
import {addCombatAura} from '../../../sim-core/src/combat-auras.js';
import {distance} from '../../../sim-core/src/geometry.js';

// Shared combat damage, threat, movement and aura handling; authored 25-player
// health/damage/wave size. All timers live in the serializable encounter state.
export function onyxiaTick(s,actors,hurt){
 const r=s.combat?.raidEncounter;if(r?.id!=='onyxia')return;
 const boss=s.combat.enemies.find(e=>e.id===r.bossId),living=actors.filter(c=>c.hp>0);
 if(!boss||boss.hp<=0){for(const e of s.combat.enemies)if(e.summonedBy===r.bossId)e.hp=0;return;}
 r.phase??=1;r.nextWhelps??=s.clock;r.nextBreath??=s.clock+20000;r.nextTail??=s.clock+18000;
 raidCommandTick(s,actors);
 const hit=(c,n,label,id)=>hurt(s,boss,c,n,label,{spellId:id,school:id===19983?0:2});
 const adds=s.combat.enemies.filter(e=>e.summonedBy===boss.id&&e.hp>0);
 for(const c of living)c.raidTargetId=(combatRole(c)==='tank'&&!c.raidMainTank||['tank','melee'].includes(combatRole(c))&&r.phase===2||r.tactics.focusAdds)&&adds.length?adds[0].id:boss.id;
 if(s.clock>=r.enrageAt){for(const c of living)hit(c,c.hp*10,'狂暴',18435);return;}
 if(r.phase===1&&boss.hp/boss.maxHp<=.65){r.phase=2;r.fires=[];boss.airborne=true;boss.cast=null;r.nextWhelps=s.clock;r.nextSpecial=s.clock+4000;r.nextBreath=s.clock+15000;raidNotice(s,'奥妮克希亚升空！远程继续攻击，近战清理雏龙。');raidAnimation(s,boss,'cast',2000);}
 if(r.phase===2&&boss.hp/boss.maxHp<=.4){r.phase=3;boss.airborne=false;boss.threat={};r.nextFear=s.clock;r.nextSpecial=s.clock+5000;r.breath=null;r.fires=[];raidNotice(s,'奥妮克希亚落地！坦克重新建立仇恨，准备抵抗恐惧。');}
 if(r.phase===2){
  if(s.clock>=r.nextWhelps){r.nextWhelps=s.clock+30000;
   for(let i=0;i<8;i++){const e=raidEnemy(s,`ony-whelp-${s.clock}-${i}`,'奥妮克希亚雏龙',11262,1200,80,120);e.rank=0;e.level=56;e.summonedBy=boss.id;e.position=15;e.positionY=i%2?22:-22;e.target=living.find(c=>combatRole(c)==='tank'&&!c.raidMainTank)?.id||s.id;s.combat.enemies.push(e);}
   raidNotice(s,'两侧巢穴涌出雏龙，副坦接住增援。');
  }
  if(s.clock>=r.nextSpecial){r.nextSpecial=s.clock+5000;const target=living[roll(s,0,living.length-1)];if(target){for(const c of living.filter(c=>distance(c,target)<=5))hit(c,700,'火球术',18392);boss.threat[target.id]=0;}raidAnimation(s,boss);}
  if(s.clock>=r.nextBreath&&!r.breath){r.nextBreath=s.clock+26000;const lane=[-12,0,12][roll(s,0,2)];r.breath={lane,at:s.clock+5000};r.breath.fieldId=addRaidField(s,rectangleField(s.combat.area.minX,s.combat.area.maxX,lane-5,lane+5),{label:'深呼吸',delay:5000,duration:500,damage:4500,spellId:17086,once:true}).id;raidNotice(s,'奥妮克希亚正在深呼吸！离开地面火焰标记。');}
  raidFieldsTick(s,actors,boss,hurt);
  if(r.breath&&s.clock>=r.breath.at){r.breath=null;raidNotice(s,'深呼吸扫过巢穴。');}
  return;
 }
 const tank=living.find(c=>c.id===boss.target)||living.find(c=>c.raidMainTank)||living[0];
 const facing=tank?Math.atan2(tank.positionY-boss.positionY,tank.position-boss.position):Math.PI;
 if(s.clock>=r.nextSpecial&&tank){r.nextSpecial=s.clock+12000;raidAnimation(s,boss);addRaidField(s,sectorField({x:boss.position,y:boss.positionY},40,facing,Math.atan(.55)*2),{label:'烈焰吐息',delay:2000,duration:400,damage:1300,spellId:18435,once:true});}
 if(s.clock>=r.nextShock&&tank){r.nextShock=s.clock+7000;for(const c of living.filter(c=>distance(c,tank)<5))hit(c,600,'顺劈斩',19983);}
 if(s.clock>=r.nextTail){r.nextTail=s.clock+18000;addRaidField(s,sectorField({x:boss.position,y:boss.positionY},15,facing+Math.PI,Math.PI),{label:'扫尾',delay:1500,duration:400,damage:750,spellId:15847,once:true});if(tank){boss.threat[tank.id]=(boss.threat[tank.id]||0)*.75;moveToward(s,tank,{position:tank.position-8,positionY:tank.positionY},0,s.clock);}}
 if(r.phase===3&&s.clock>=r.nextFear){r.nextFear=s.clock+25000;for(const c of living)addCombatAura(c,{spell:18431,type:7,mechanic:5,positive:false,until:s.clock+2500,caster:boss.id},s.clock);raidNotice(s,'低沉咆哮震动巢穴，恐惧与熔岩同时袭来。');for(const y of [-16,0,16])addRaidField(s,rectangleField(s.combat.area.minX,s.combat.area.maxX,y-1.5,y+1.5),{label:'熔岩裂隙',delay:3000,duration:4500,damage:400,spellId:22191});}
 raidFieldsTick(s,actors,boss,hurt);
}
