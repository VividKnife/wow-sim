import {raidSpellValue} from './raid-spells.js';
import {roll} from './character.js';
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
 const curse=(count,spell,extra)=>{for(const c of targets(s,living,count))addCombatAura(c,{spell,effect:1,type:0,amount:0,positive:false,dispel:2,until:s.clock+300000,caster:boss.id,...extra},s.clock);};
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
 if(r.id==='garr')for(const e of s.combat.enemies.filter(e=>e.id!==boss.id&&e.hp<=0&&!r.deadAdds.includes(e.id))){r.deadAdds.push(e.id);boss.auras.push({spell:19516,type:138,amount:9,positive:true,until:r.attemptEndsAt});fire([e],12,{label:'火誓者爆炸',delay:1500,duration:400,damage:raidSpellValue(s,19497),spellId:19497,once:true});raidNotice(s,'火誓者爆炸，加尔的攻击速度提升。');}
 if(r.id==='majordomo'&&!adds.length){boss.hp=0;raidAnimation(s,boss,'surrender',86400000);raidNotice(s,'护卫全部倒下，管理者埃克索图斯投降，炎魔之王的道路已开启。');return;}
 if(r.id==='ragnaros'){
  if(!r.submerged&&s.clock>=r.nextSubmerge){
   r.submerged=true;r.emergeAt=s.clock+90000;boss.stunUntil=r.emergeAt;raidAnimation(s,boss,'submerge',90000);
   addCombatAura(boss,{spell:21107,type:39,misc:127,until:r.emergeAt,positive:true},s.clock);
   for(let i=0;i<8;i++){const e=raidEnemy(s,`son-${s.clock}-${i}`,'烈焰之子',12143);const angle=i*Math.PI/4,p=fieldSafePoint({x:boss.position+Math.cos(angle)*10,y:boss.positionY+Math.sin(angle)*10},r.fires.filter(f=>f.terrain),s.combat.area);e.position=p.x;e.positionY=p.y;e.target=living.find(c=>combatRole(c)==='tank'&&!c.raidMainTank)?.id||s.id;e.threat[e.target]=2500;s.combat.enemies.push(e);}
   raidNotice(s,'拉格纳罗斯潜入熔岩：击败八名烈焰之子，迫使炎魔现身。');
  }
  if(r.submerged){
   if(!s.combat.enemies.some(e=>e.id.startsWith('son-')&&e.hp>0)||s.clock>=r.emergeAt){r.submerged=false;boss.stunUntil=0;boss.auras=boss.auras.filter(a=>a.spell!==21107);r.nextSubmerge=s.clock+180000;raidAnimation(s,boss,'emerge',2500);raidNotice(s,'拉格纳罗斯重新现身！');}
   else {if(s.clock>=r.nextPulse){r.nextPulse=s.clock+5000;for(const c of targets(s,living,5)){c.mana=Math.max(0,c.mana-250);hit(c,180,'烈焰之子法力燃烧');}}return;}
  }
 }
 // Each ability keeps its own source cooldown; no shared 15-second boss pulse.
 r.timers??={};
 const due=(key,first,low,high=low)=>{r.timers[key]??=s.combat.startedAt+first;if(s.clock<r.timers[key])return false;r.timers[key]=s.clock+roll(s,low,high);return true;};
 const near=radius=>living.filter(c=>distance(c,boss)<=radius);
 if(r.id==='gehennas'){
  if(due('curse',7500,25000,30000))curse(living.length,19716,{type:118,amount:-75});
  if(due('rain',9000,6000,12000))fire(targets(s,living,1),10,{label:'火焰之雨',duration:6000,damage:raidSpellValue(s,19717),spellId:19717,interval:2000});
  for(const key of ['shadowRandom','shadowTank'])if(due(key,4500,3000,6000)){const c=key==='shadowTank'?living.find(c=>c.id===boss.target):targets(s,living,1)[0];if(c)hit(c,raidSpellValue(s,19729),'暗影箭',5);}
 }
 if(r.id==='garr'){
  if(due('antiMagic',12500,15000,20000))for(const c of near(40)){const aura=(c.auras||[]).find(a=>a.positive&&a.dispel===1);if(aura)c.auras=c.auras.filter(a=>a!==aura);}
  if(due('shackles',7500,10000,15000))for(const c of near(40))addCombatAura(c,{spell:19496,type:33,amount:-60,positive:false,dispel:1,until:s.clock+15000,caster:boss.id},s.clock);
 }
 if(r.id==='baron-geddon'){
  if(due('bomb',35000,35000))for(const c of targets(s,living,1))r.bombs.push({actorId:c.id,at:s.clock+8000});
  if(due('ignite',30000,30000))for(const c of near(40).filter(c=>c.currentMaxMana>0))addCombatAura(c,{spell:19659,type:0,positive:false,dispel:1,raidIgnite:true,next:s.clock+3000,until:s.clock+300000},s.clock);
  if(due('inferno',45000,45000))fire([boss],20,{label:'地狱火',followId:boss.id,delay:0,duration:8000,damage:250,damageRamp:250,spellId:19695,interval:1000});
 }
 if(r.id==='shazzrah'){
  if(due('curse',10000,20000))curse(living.length,19713,{type:87,misc:126,amount:100});
  if(due('explosion',6000,5000,9000))for(const c of near(20))hit(c,raidSpellValue(s,19712),'魔爆术',6);
  if(due('counterspell',15000,16000,20000))for(const c of near(40).filter(c=>c.cast)){c.cast=null;c.silenceUntil=s.clock+10000;}
  if(due('deadenMagic',24000,35000))addCombatAura(boss,{spell:19714,type:87,misc:126,amount:-50,positive:true,dispel:1,until:s.clock+30000},s.clock);
  if(due('teleport',30000,45000)){const c=targets(s,living,1)[0];if(c){boss.position=c.position;boss.positionY=c.positionY;boss.threat={};for(const target of near(20))hit(target,raidSpellValue(s,19712),'魔爆术',6);}raidNotice(s,'沙斯拉尔传送并清空仇恨，坦克重新接怪。');}
 }
 if(r.id==='sulfuron'){
  for(const e of adds.filter(e=>e.raidHealer&&!controlled(e,s.clock))){
   if(due('heal:'+e.id,20000,15000,20000)){const ally=[boss,...adds].filter(a=>a.hp<a.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];if(ally){raidAnimation(s,e);ally.hp=Math.min(ally.maxHp,ally.hp+raidSpellValue(s,19775));}}
   if(due('pain:'+e.id,2000,15000,20000))for(const c of targets(s,living,1))addCombatAura(c,{spell:19776,type:0,positive:false,dispel:1,raidPain:true,next:s.clock+3000,until:s.clock+18000},s.clock);
  }
  if(due('hand',6000,12000,15000))for(const c of near(10)){hit(c,raidSpellValue(s,19780,3),'拉格纳罗斯之手');addCombatAura(c,{spell:19780,type:12,mechanic:12,positive:false,until:s.clock+2000},s.clock);}
  if(due('inspire',3000,10000))for(const e of [boss,...adds])addCombatAura(e,{spell:19779,type:138,amount:100,positive:true,dispel:1,until:s.clock+10000},s.clock);
 }
 if(r.id==='golemagg'){
  // Core Ragers regenerate below half health while their master is alive.
  for(const e of adds)if(e.hp<e.maxHp*.5)e.hp=e.maxHp;
  if(due('pyroblast',7000,7000))for(const c of targets(s,living,1))hit(c,raidSpellValue(s,20228),'炎爆术');
  if(boss.hp<=boss.maxHp*.1&&due('earthquake',0,3000))for(const c of near(15))hit(c,raidSpellValue(s,19798),'地震',0);
 }
 if(r.id==='majordomo'){
  if(due('teleport',15000,25000,30000)){const c=targets(s,living,1)[0];if(c){setCombatPosition(s,c,{x:boss.position,y:boss.positionY});boss.threat[c.id]=0;}}
  if(due('reflection',15000,30000)){const magical=roll(s,0,1)===1;for(const e of adds)e.raidReflection={magical,until:s.clock+10000};raidNotice(s,magical?'魔法反射护盾：暂缓法术攻击。':'伤害反射护盾：近战注意反伤。');}
  const dead=s.combat.enemies.filter(e=>e.id!==boss.id&&e.hp<=0).length;
  if(dead>=4)for(const e of adds.filter(e=>e.raidHealer)){e.mechanicImmuneMask|=1<<16;e.auras=e.auras.filter(a=>a.type!==56);e.polyUntil=0;}
 }
 if(r.id==='ragnaros'){
  if(due('wrath',30000,25000))for(const c of near(25).slice(0,3)){hit(c,raidSpellValue(s,20566),'拉格纳罗斯之怒');const dx=c.position-boss.position,dy=c.positionY-boss.positionY,d=Math.hypot(dx,dy);setCombatPosition(s,c,{x:c.position+(d?dx/d:-1)*14,y:c.positionY+(d?dy/d:0)*14});boss.threat[c.id]=0;}
  if(!near(6).length&&due('magmaBlast',2000,2500))for(const c of targets(s,living,1))hit(c,raidSpellValue(s,20565),'熔岩冲击');
  if(due('might',11000,11000,30000)){const c=targets(s,living.filter(c=>c.currentMaxMana>0),1)[0];if(c)for(const ally of living.filter(a=>a!==c&&distance(a,c)<20))hit(ally,raidSpellValue(s,21155),'拉格纳罗斯之力');}
  if(due('lavaBurst',20000,5000,25000))fire(targets(s,living,1),6,{label:'熔岩爆发'});
 }
 for(const c of living)for(const a of c.auras||[])if(a.until>s.clock&&(a.raidIgnite||a.raidPain)&&s.clock>=a.next){a.next+=3000;if(a.raidIgnite){const burned=Math.min(c.mana,raidSpellValue(s,19659));c.mana-=burned;hit(c,burned,'点燃法力');}else hit(c,raidSpellValue(s,19776),'暗言术：痛',5);}
 for(const bomb of r.bombs){const c=actors.find(c=>c.id===bomb.actorId);if(!c||c.hp<=0)continue;
  if(s.clock>=bomb.at){for(const ally of living.filter(a=>distance(a,c)<10)){hit(ally,raidSpellValue(s,20476),'活体炸弹');r.failures.fire++;}raidNotice(s,`${c.name}的活体炸弹爆炸。`);}
  else if(r.tactics.avoidFire&&!controlled(c,s.clock)){c.cast=null;moveToward(s,c,{position:-12,positionY:(c.raidIndex%2?1:-1)*22},0,s.clock);c.raidEvadingAt=s.clock;}
 }r.bombs=r.bombs.filter(b=>b.at>s.clock);
}

export function raidNextMechanics(enc){
 if(!enc)return [];
 if(enc.id==='onyxia')return (enc.phase===2?[['火球','nextSpecial'],['深呼吸','nextBreath'],['雏龙','nextWhelps']]:[['烈焰吐息','nextSpecial'],...(enc.phase===3?[['低沉咆哮','nextFear']]:[])]).map(([name,key])=>({name,at:enc[key]}));
 const fields=enc.id==='lucifron'?[['末日','nextDoom'],['诅咒','nextCurse']]:enc.id==='magmadar'?[['狂暴','nextFrenzy'],['恐慌','nextFear'],['熔岩','nextBomb']]:enc.kind==='trash'?[['下次机制','nextSpecial']]:[];
 const result=fields.map(([name,key])=>({name,at:enc[key]}));
 const spells={gehennas:[['诅咒','curse'],['火焰之雨','rain']],garr:[['反魔法脉冲','antiMagic'],['岩浆镣铐','shackles']],'baron-geddon':[['活体炸弹','bomb'],['地狱火','inferno']],shazzrah:[['魔爆术','explosion'],['传送','teleport']],sulfuron:[['拉格纳罗斯之手','hand']],golemagg:[['炎爆术','pyroblast']],majordomo:[['反射护盾','reflection']],ragnaros:[['炎魔之怒','wrath']]};
 if(!enc.submerged)for(const [name,key] of spells[enc.id]||[])if(Number.isFinite(enc.timers?.[key]))result.push({name,at:enc.timers[key]});
 if(enc.id==='ragnaros')result.push({name:enc.submerged?'重新现身':'潜入熔岩',at:enc.submerged?enc.emergeAt:enc.nextSubmerge});
 return result;
}
