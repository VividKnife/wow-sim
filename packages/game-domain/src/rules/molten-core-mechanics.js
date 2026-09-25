import {addRaidField} from './raid-battlefield.js';
import {fieldSafePoint,rectangleField} from '../../../sim-core/src/encounter-geometry.js';
import {setCombatPosition} from './combat-area.js';
import {raidEnemy} from './molten-core-content.js';
import {log} from './character.js';
export function raidAnimation(s,unit,action='cast',duration=1200){
 unit.modelAnimation={action,startedAt:s.clock,until:s.clock+duration};
}
export function raidNotice(s,text,kind='mechanic',details={}) {
 log(s,text,kind,details);
 const raid=s.combat?.raidEncounter;if(!raid)return;
 raid.events.push({at:s.clock,text,kind,...details});if(raid.events.length>60)raid.events.shift();
}

import {addCombatAura,controlled} from '../../../sim-core/src/combat-auras.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {moveToward} from './combat-space.js';
import {combatRole} from './combat-roles.js';

export function extendedMoltenCoreTick(s,actors,boss,hurt,targets){
 const r=s.combat.raidEncounter,living=actors.filter(c=>c.hp>0),adds=s.combat.enemies.filter(e=>e.id!==boss.id&&e.hp>0);
 const hit=(c,amount,label,school=2)=>hurt(s,boss,c,amount,label,{school});
 const curse=(count,spell,extra)=>{for(const c of targets(s,living,count))addCombatAura(c,{spell,effect:1,type:0,amount:0,positive:false,dispel:2,until:s.clock+25000,caster:boss.id,...extra},s.clock);};
 const fire=(units,radius=6,options={})=>{for(const c of units)addRaidField(s,{center:{x:c.position,y:c.positionY},radius},options);};
 if(r.kind==='trash'){
  if(s.clock>=r.nextSpecial){r.nextSpecial+=9000;
   for(const e of s.combat.enemies.filter(e=>e.hp>0)){
    raidAnimation(s,e);
    const target=living.find(c=>c.id===e.target)||living[0];if(!target)continue;
    if(['giant','destroyer'].includes(e.trashType))for(const c of living.filter(c=>distance(c,e)<9))hurt(s,e,c,420,'践踏',{school:0});
    else if(e.trashType==='priest'){const ally=s.combat.enemies.filter(a=>a.hp>0).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];ally.hp=Math.min(ally.maxHp,ally.hp+3200);raidNotice(s,'烈焰行者祭司治疗同伴，优先集火祭司。');}
    else if(e.trashType==='firelord'){fire(targets(s,living,1));raidNotice(s,'火焰之王召来火雨，离开火区。');}
    else if(e.trashType==='ancient'){for(const c of targets(s,living,3))addCombatAura(c,{spell:19408,type:7,mechanic:5,positive:false,until:s.clock+2000,caster:e.id},s.clock);}
    else if(['surger','annihilator'].includes(e.trashType)){const c=targets(s,living,1)[0];if(c){hurt(s,e,c,600,'熔岩冲击',{school:0});e.threat[c.id]=(e.threat[c.id]||0)+1500;}}
    else hurt(s,e,target,e.trashType==='imp'?200:350,'熔岩吐息',{school:2});
   }
  }return;
 }
 if(r.id==='garr')for(const e of s.combat.enemies.filter(e=>e.id!==boss.id&&e.hp<=0&&!r.deadAdds.includes(e.id))){r.deadAdds.push(e.id);boss.low*=1.12;boss.high*=1.12;fire([e],12,{label:'火誓者爆炸',delay:1500,duration:400,damage:650,once:true});raidNotice(s,'火誓者爆炸，加尔的攻击增强。');}
 if(r.id==='majordomo'&&!adds.length){boss.hp=0;raidAnimation(s,boss,'surrender',86400000);raidNotice(s,'护卫全部倒下，管理者埃克索图斯投降，炎魔之王的道路已开启。');return;}
 if(r.id==='ragnaros'){
  if(!r.submerged&&s.clock>=r.nextSubmerge){
   r.submerged=true;r.emergeAt=s.clock+45000;boss.stunUntil=r.emergeAt;raidAnimation(s,boss,'submerge',45000);
   addCombatAura(boss,{spell:21107,type:39,misc:127,until:r.emergeAt,positive:true},s.clock);
   for(let i=0;i<6;i++){const e=raidEnemy(s,`son-${s.clock}-${i}`,'烈焰之子',12143,10500,300,430);const angle=i*Math.PI/3,p=fieldSafePoint({x:boss.position+Math.cos(angle)*10,y:boss.positionY+Math.sin(angle)*10},r.fires.filter(f=>f.terrain),s.combat.area);e.position=p.x;e.positionY=p.y;e.target=living.find(c=>combatRole(c)==='tank'&&!c.raidMainTank)?.id||s.id;e.threat[e.target]=2500;s.combat.enemies.push(e);}
   raidNotice(s,'拉格纳罗斯潜入熔岩：击败六名烈焰之子，迫使炎魔现身。');
  }
  if(r.submerged){
   if(!s.combat.enemies.some(e=>e.id.startsWith('son-')&&e.hp>0)||s.clock>=r.emergeAt){r.submerged=false;boss.stunUntil=0;boss.auras=boss.auras.filter(a=>a.spell!==21107);r.nextSubmerge=s.clock+65000;raidAnimation(s,boss,'emerge',2500);raidNotice(s,'拉格纳罗斯重新现身！');}
   else {if(s.clock>=r.nextPulse){r.nextPulse=s.clock+5000;for(const c of targets(s,living,5)){c.mana=Math.max(0,c.mana-250);hit(c,180,'烈焰之子法力燃烧');}}return;}
  }
 }
 if(s.clock>=r.nextHeal){r.nextHeal+=8000;for(const e of adds.filter(e=>e.raidHealer)){const ally=[boss,...adds].filter(a=>a.hp<a.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];if(ally){raidAnimation(s,e);ally.hp=Math.min(ally.maxHp,ally.hp+4500);raidNotice(s,`${e.name}治疗了${ally.name}，优先处理医师。`);}}}
 if(s.clock>=r.nextSpecial){r.nextSpecial+=15000;
  if(boss.modelAnimation?.action!=='emerge'||boss.modelAnimation.until<=s.clock)raidAnimation(s,boss);
  if(r.id==='gehennas'){curse(8,19716,{type:118,amount:-60});fire(targets(s,living,2),6,{label:'火焰之雨'});raidNotice(s,'基赫纳斯施放减疗诅咒与火雨。');}
  if(r.id==='baron-geddon'){
   const chosen=targets(s,living.filter(c=>combatRole(c)!=='tank'),2);for(const c of chosen)r.bombs.push({actorId:c.id,at:s.clock+7000});
   for(const c of targets(s,living.filter(c=>c.maxMana||c.mana>0),5))addCombatAura(c,{spell:19659,type:0,positive:false,dispel:1,raidIgnite:true,next:s.clock+1000,until:s.clock+20000},s.clock);
   raidNotice(s,'活体炸弹：被点名者远离团队；驱散点燃法力。');
  }
  if(r.id==='shazzrah'){curse(8,19713,{type:87,misc:64,amount:70});const c=targets(s,living.filter(c=>combatRole(c)!=='tank'),1)[0];if(c){boss.position=c.position;boss.positionY=c.positionY;boss.threat={};const tank=living.find(c=>c.raidMainTank);if(tank){boss.target=tank.id;boss.threat[tank.id]=1000;}}raidNotice(s,'沙斯拉尔诅咒并传送到后排，坦克重新接怪。');}
  if(r.id==='sulfuron')for(const c of targets(s,living,5))addCombatAura(c,{spell:19776,type:0,positive:false,dispel:1,raidPain:true,next:s.clock+1000,until:s.clock+14000},s.clock);
  if(r.id==='golemagg'){const tank=living.find(c=>c.id===boss.target);if(tank)hit(tank,750,'熔岩喷溅');for(const c of targets(s,living,2))hit(c,600,'炎爆术');raidNotice(s,'古雷曼格向团队投掷炎爆术。');}
  if(r.id==='majordomo'){fire(targets(s,living,2),6,{label:'熔岩冲击'});raidNotice(s,'烈焰议会施放熔岩冲击。');}
  if(r.id==='ragnaros'){fire(targets(s,living,3),6,{label:'熔岩爆发'});const tank=living.find(c=>c.id===boss.target);if(tank){hit(tank,800,'拉格纳罗斯之怒');const dx=tank.position-boss.position,dy=tank.positionY-boss.positionY,d=Math.hypot(dx,dy);setCombatPosition(s,tank,{x:tank.position+(d?dx/d:-1)*14,y:tank.positionY+(d?dy/d:0)*14});boss.threat[tank.id]=Math.max(0,(boss.threat[tank.id]||0)*.5);}raidNotice(s,'拉格纳罗斯之怒：击退当前坦克，熔岩在后排爆发。');}
 }
 if(s.clock>=r.nextPulse){r.nextPulse+=12000;
  if(r.id==='baron-geddon'){raidAnimation(s,boss);fire([boss],12,{label:'地狱火',followId:boss.id});raidNotice(s,'地狱火：撤离男爵周围。');}
  if(r.id==='shazzrah')fire([boss],16,{label:'魔爆术',delay:2000,duration:400,damage:500,school:6,spellId:19712,once:true,followId:boss.id});
  if(r.id==='golemagg'&&boss.hp<boss.maxHp*.2){const a=s.combat.area;addRaidField(s,rectangleField(a.minX,a.maxX,a.minY,a.maxY),{label:'地震',delay:1500,duration:400,damage:260,school:0,once:true,unavoidable:true});raidNotice(s,'古雷曼格濒死狂怒，地震震动全团。');}
 }
 for(const c of living)for(const a of c.auras||[])if(a.until>s.clock&&(a.raidIgnite||a.raidPain)&&s.clock>=a.next){a.next+=2000;if(a.raidIgnite){const burned=Math.min(c.mana,220);c.mana-=burned;hit(c,burned,'点燃法力');}else hit(c,240,'暗言术：痛',5);}
 for(const bomb of r.bombs){const c=actors.find(c=>c.id===bomb.actorId);if(!c||c.hp<=0)continue;
  if(s.clock>=bomb.at){for(const ally of living.filter(a=>distance(a,c)<9)){hit(ally,1100,'活体炸弹');r.failures.fire++;}raidNotice(s,`${c.name}的活体炸弹爆炸。`);}
  else if(r.tactics.avoidFire&&!controlled(c,s.clock)){c.cast=null;moveToward(s,c,{position:-12,positionY:(c.raidIndex%2?1:-1)*22},0,s.clock);c.raidEvadingAt=s.clock;}
 }r.bombs=r.bombs.filter(b=>b.at>s.clock);
}

export function raidNextMechanics(enc){
 if(!enc)return [];
 if(enc.id==='onyxia')return (enc.phase===2?[['火球','nextSpecial'],['深呼吸','nextBreath'],['雏龙','nextWhelps']]:[['烈焰吐息','nextSpecial'],...(enc.phase===3?[['低沉咆哮','nextFear']]:[])]).map(([name,key])=>({name,at:enc[key]}));
 const fields=enc.id==='lucifron'?[['末日','nextDoom'],['诅咒','nextCurse']]:enc.id==='magmadar'?[['狂暴','nextFrenzy'],['恐慌','nextFear'],['熔岩','nextBomb']]:enc.id==='ragnaros'?[['炎魔之怒','nextSpecial'],[enc.submerged?'重新现身':'潜入熔岩',enc.submerged?'emergeAt':'nextSubmerge']]:[['下次机制','nextSpecial']];
 return fields.map(([name,key])=>({name,at:enc[key]}));
}
