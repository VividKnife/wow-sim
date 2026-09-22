// Authored 25-player adaptation. Boss scripts use the existing combat damage,
// aura, movement, resource and cooldown systems; no parallel combat calculator.
import {goldNpcTick,goldAvoidsFire} from './gold-raid-npcs.js';
import {rng,spellInfo,knownRank} from './character.js';
import {combatRole} from './combat-roles.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {controlled,addCombatAura} from '../../../sim-core/src/combat-auras.js';
import {moveToward} from './combat-space.js';
import {beginSpellTiming,spellReady} from './spell-timing.js';
import {dispelSpellAuras,applySpellAura} from './spell-aura-lifecycle.js';
import {consumeHunterAmmo} from './ammunition.js';

export {moltenCoreBosses} from './molten-core-content.js';
import {extendedMoltenCoreTick,raidNotice,raidAnimation} from './molten-core-mechanics.js';
export const defaultRaidTactics = {focusAdds:true,dispel:true,tranquilize:true,fearWard:true,avoidFire:true};
function ready(s,c,id,target) {
 const spell=knownRank(c,id),sp=spell&&spellInfo(c,spell);
 if(!sp||c.hp<=0||c.cast||controlled(c,s.clock)||c.silenceUntil>s.clock||c.nextAction>s.clock||!spellReady(c,sp,s.clock)||c.mana<sp.mana||distance(c,target)>sp.range)return null;
 return sp;
}
function supportCast(s,c,sp,target,apply,label) {
 const timing=beginSpellTiming(c,{...sp,castMs:0},s.clock);
 if(!timing.committed)return false;
 apply();c.nextAction=Math.max(c.nextAction,s.clock+1500);
 raidNotice(s,`${c.name}：${label} → ${target.name}`,'raid-support',{actorId:c.id,targetId:target.id,spellId:sp.Id});
 return true;
}
function randomTargets(s,actors,count) {
 const pool=actors.filter(c=>c.hp>0&&!c.petUnit&&!c.totemUnit),chosen=[];
 while(pool.length&&chosen.length<count)chosen.push(pool.splice(Math.floor(rng(s)*pool.length),1)[0]);
 return chosen;
}
export function moltenCoreTick(s,actors,hurt) {
 const raid=s.combat?.raidEncounter;if(!raid)return;
 const original=s.combat.enemies.find(e=>e.id===raid.bossId);
 if(raid.id==='golemagg'&&original?.hp<=0)for(const e of s.combat.enemies)e.hp=0;
 const boss=raid.kind==='trash'?s.combat.enemies.find(e=>e.hp>0):original,living=actors.filter(c=>c.hp>0);
 if(!boss||boss.hp<=0)return;
 extendedMoltenCoreTick(s,actors,boss,hurt,randomTargets);
 goldNpcTick(s,actors);
 const adds=s.combat.enemies.filter(e=>e.id!==boss.id&&e.hp>0).sort((a,b)=>Number(!!b.raidHealer)-Number(!!a.raidHealer)||Number(b.trashType==='priest')-Number(a.trashType==='priest'));
 const focus=raid.id!=='golemagg'&&raid.tactics.focusAdds;
 const tanks=living.filter(c=>combatRole(c)==='tank');
 for(const c of living){
  c.raidTargetId=combatRole(c)==='tank'?((c.raidMainTank&&!raid.submerged)||!adds.length?boss.id:adds[0].id):((focus||raid.submerged)&&adds.length?adds[0].id:boss.id);
 }
 // Hard enrage bounds attempts and makes insufficient throughput observable.
 if(s.clock>=raid.enrageAt){raidNotice(s,'首领狂暴：战斗超过时限，全团覆灭。','raid-failure');for(const c of living)hurt(s,boss,c,c.hp*10,'狂暴',{school:2});return;}
 if(raid.id==='lucifron'){
  // Resolve only auras still present: ordinary dispels remove the actual effect.
  for(const c of living)for(const a of [...(c.auras||[])])if(a.raidDoom&&s.clock>=a.explodesAt){
   c.auras=c.auras.filter(value=>value!==a);raid.failures.doom++;
   hurt(s,boss,c,1800,'末日降临',{spellId:19702,school:5,periodic:true});
   raidNotice(s,`${c.name} 的末日未及时驱散，承受爆炸。`,'raid-failure');
  }
  if(s.clock>=raid.nextDoom){raid.nextDoom+=21000;
   raidAnimation(s,boss);
   for(const c of randomTargets(s,actors,7))addCombatAura(c,{spell:19702,effect:1,type:0,amount:0,dispel:1,positive:false,raidDoom:true,explodesAt:s.clock+9000,until:s.clock+10000,caster:boss.id},s.clock);
   raidNotice(s,'末日降临：7名成员被标记，9秒后引爆。');
  }
  if(s.clock>=raid.nextCurse){raid.nextCurse+=24000;
   raidAnimation(s,boss);
   for(const c of randomTargets(s,actors,10))addCombatAura(c,{spell:19703,effect:1,type:0,amount:0,dispel:2,positive:false,raidCurse:true,until:s.clock+45000,caster:boss.id},s.clock);
   raidNotice(s,'鲁西弗隆的诅咒：10名成员技能资源消耗翻倍。');
  }
  if(s.clock>=raid.nextShock){raid.nextShock+=9000;const target=living.find(c=>c.id===boss.target);if(target)hurt(s,boss,target,600,'暗影震击',{spellId:19460,school:5});}
 }else if(raid.id==='magmadar'){
  if(s.clock>=raid.nextFrenzy){raid.nextFrenzy+=22000;boss.enraged=true;
   raidAnimation(s,boss);
   addCombatAura(boss,{spell:19451,effect:1,type:138,amount:100,dispel:9,positive:true,until:s.clock+15000},s.clock);
   raidNotice(s,'玛格曼达陷入狂暴！猎人准备宁神射击。');
  }
  if(s.clock>=raid.nextFear){raid.nextFear+=30000;let feared=0;
   raidAnimation(s,boss);
   for(const c of living.filter(c=>distance(c,boss)<=30)){
    if(applySpellAura(c,{spell:19408,effect:1,type:7,amount:0,mechanic:5,positive:false,caster:boss.id,until:s.clock+4000},s.clock)){feared++;c.cast=null;}
   }
   raid.failures.feared+=feared;raidNotice(s,`恐慌：${feared}名成员陷入恐惧。`);
  }
  if(s.clock>=raid.nextBomb){raid.nextBomb+=14000;
   raidAnimation(s,boss);
   const targets=randomTargets(s,living.filter(c=>combatRole(c)!=='tank'),2);
   for(const c of targets)raid.fires.push({id:`fire-${s.clock}-${c.id}`,position:c.position,positionY:c.positionY,radius:6,armedAt:s.clock+2500,until:s.clock+11500,next:s.clock+2500});
   raidNotice(s,'熔岩炸弹：2.5秒后落地，撤出红色区域。');
  }
 }
 {
  for(const fire of raid.fires){
   if(s.clock>=fire.next&&s.clock<fire.until){fire.next+=1000;for(const c of living.filter(c=>distance(c,fire)<=fire.radius)){raid.failures.fire++;if(c.goldNpc)c.goldProfile.fireHits++;hurt(s,boss,c,750,'熔岩灼烧',{spellId:19411,school:2,periodic:true});}}
   if(raid.tactics.avoidFire)for(const c of living.filter(c=>distance(c,fire)<=fire.radius+1&&!controlled(c,s.clock)&&goldAvoidsFire(s,c,fire))){
    const dx=c.position-fire.position,dy=c.positionY-fire.positionY,angle=Math.hypot(dx,dy)<.1?(Number(c.raidIndex)%2?1:-1)*Math.PI/2:Math.atan2(dy,dx);
    c.cast=null;moveToward(s,c,{position:fire.position+Math.cos(angle)*(fire.radius+4),positionY:fire.positionY+Math.sin(angle)*(fire.radius+4)},0,s.clock);c.raidEvadingAt=s.clock;
   }
  }
  raid.fires=raid.fires.filter(f=>f.until>s.clock);
 }
 for(const c of living){
  if(c.raidEvadingAt===s.clock)continue;
  if(raid.tactics.dispel&&[5,8].includes(c.classId)){
   const type=c.classId===5?1:2,target=living.find(a=>(a.auras||[]).some(e=>e.dispel===type&&e.until>s.clock));
   const sp=target&&ready(s,c,c.classId===5?527:475,target);
   if(sp&&supportCast(s,c,sp,target,()=>{raid.support.dispels+=dispelSpellAuras(target,[type],1,s,'negative');},type===1?'驱散魔法':'解除诅咒'))continue;
  }
  if(raid.tactics.tranquilize&&c.classId===3&&boss.enraged){
   const sp=ready(s,c,19801,boss);
   if(sp&&consumeHunterAmmo(c,'Tranquilizing Shot')&&supportCast(s,c,sp,boss,()=>{dispelSpellAuras(boss,[9],1,s);boss.enraged=false;raid.support.tranquilizes++;},'宁神射击'))continue;
  }
  const tank=tanks.find(a=>a.raidMainTank)||tanks[0];
  if(raid.id==='magmadar'&&raid.tactics.fearWard&&c.classId===5&&tank&&!tank.auras?.some(a=>a.spell===6346&&a.until>s.clock)){
   const sp=ready(s,c,6346,tank);
   if(sp)supportCast(s,c,sp,tank,()=>{applySpellAura(tank,{spell:6346,effect:1,type:77,misc:5,amount:1,positive:true,consumeOnImmune:true,until:s.clock+180000,caster:c.id},s.clock);raid.support.wards++;},'防护恐惧结界');
  }
 }
 if(boss.enraged&&!boss.auras?.some(a=>a.dispel===9&&a.until>s.clock))boss.enraged=false;
}
