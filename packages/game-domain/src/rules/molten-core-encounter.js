import {worldBossTick} from './world-boss-encounter.js';
import {raidSpellValue} from './raid-spells.js';
import {roll} from './character.js';
import {raidFieldsTick,addRaidField} from './raid-battlefield.js';
import {raidCommandTick,assignedRaidSupport,raidDispelTargets} from './raid-command.js';
import {onyxiaTick} from './onyxia-encounter.js';
// 40-player encounters on the shared engine. Boss scripts use the existing combat damage,
// aura, movement, resource and cooldown systems; no parallel combat calculator.
import {goldNpcTick} from './gold-raid-npcs.js';
import {rng} from './character.js';
import {ready,supportCast,supportActor,raidFearWardTick} from './raid-support.js';
import {combatRole} from './combat-roles.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {addCombatAura} from '../../../sim-core/src/combat-auras.js';
import {dispelSpellAuras,applySpellAura} from './spell-aura-lifecycle.js';
import {consumeHunterAmmo} from './ammunition.js';

export {moltenCoreBosses} from './molten-core-content.js';
import {extendedMoltenCoreTick,raidNotice,raidAnimation,publishRaidWarnings} from './molten-core-mechanics.js';
export const defaultRaidTactics = {focusAdds:true,dispel:true,tranquilize:true,fearWard:true,avoidFire:true};
function randomTargets(s,actors,count) {
 const pool=actors.filter(c=>c.hp>0&&!c.petUnit&&!c.totemUnit),chosen=[];
 while(pool.length&&chosen.length<count)chosen.push(pool.splice(Math.floor(rng(s)*pool.length),1)[0]);
 return chosen;
}
export function moltenCoreTick(s,actors,hurt) {
 const raid=s.combat?.raidEncounter;if(!raid)return;
 publishRaidWarnings(s);
 // Shared participant upkeep precedes encounter dispatch, including encounters
 // with their own script. Do not charge for potions after the encounter ends.
 const active=raid.kind==='trash'?s.combat.enemies.some(e=>e.hp>0&&!e.removed)
  :s.combat.enemies.some(e=>e.id===raid.bossId&&e.hp>0&&!e.removed);
 if(active)goldNpcTick(s,actors);
 if(['azuregos','kazzak'].includes(raid.id)){worldBossTick(s,actors,hurt);publishRaidWarnings(s);return;}
 if(raid.id==='onyxia'){onyxiaTick(s,actors,hurt);publishRaidWarnings(s);return;}
 const original=s.combat.enemies.find(e=>e.id===raid.bossId);
 if(raid.id==='golemagg'&&original?.hp<=0)for(const e of s.combat.enemies)e.hp=0;
 const boss=raid.kind==='trash'?s.combat.enemies.find(e=>e.hp>0):original,living=actors.filter(c=>c.hp>0);
 if(!boss||boss.hp<=0)return;
 extendedMoltenCoreTick(s,actors,boss,hurt,randomTargets);
 raidCommandTick(s,actors);
 const adds=s.combat.enemies.filter(e=>e.id!==boss.id&&e.hp>0).sort((a,b)=>Number(!!b.raidHealer)-Number(!!a.raidHealer)||Number(b.trashType==='priest')-Number(a.trashType==='priest'));
 const focus=raid.tactics.focusAdds,offTanks=living.filter(c=>combatRole(c)==='tank'&&!c.raidMainTank);
 for(const c of living){
  c.raidTargetId=combatRole(c)==='tank'?((c.raidMainTank&&!raid.submerged)||!adds.length?boss.id:adds[Math.max(0,offTanks.indexOf(c))%adds.length].id):((focus||raid.submerged)&&adds.length?adds[0].id:boss.id);
 }
 if(raid.id==='lucifron'){
  // Resolve only auras still present: ordinary dispels remove the actual effect.
  for(const c of living)for(const a of [...(c.auras||[])])if(a.raidDoom&&s.clock>=a.explodesAt){
   c.auras=c.auras.filter(value=>value!==a);raid.failures.doom++;
   hurt(s,boss,c,raidSpellValue(s,19702),'末日降临',{spellId:19702,school:5,periodic:true});
   raidNotice(s,`${c.name} 的末日未及时驱散，承受爆炸。`,'raid-failure');
  }
  if(s.clock>=raid.nextDoom){raid.nextDoom=s.clock+roll(s,20000,25000);
   raidAnimation(s,boss);
   for(const c of living.filter(c=>distance(c,boss)<=40))addCombatAura(c,{spell:19702,effect:1,type:0,amount:0,dispel:1,positive:false,raidDoom:true,explodesAt:s.clock+10000,until:s.clock+10100,caster:boss.id},s.clock);
   raidNotice(s,'末日降临：40码内成员被标记，10秒后引爆。');
  }
  if(s.clock>=raid.nextCurse){raid.nextCurse=s.clock+roll(s,20000,25000);
   raidAnimation(s,boss);
   for(const c of living.filter(c=>distance(c,boss)<=40))addCombatAura(c,{spell:19703,effect:1,type:0,amount:0,dispel:2,positive:false,raidCurse:true,until:s.clock+300000,caster:boss.id},s.clock);
   raidNotice(s,'鲁西弗隆的诅咒：40码内成员技能资源消耗翻倍。');
  }
  if(s.clock>=raid.nextShock){raid.nextShock=s.clock+roll(s,3000,6000);const target=living.find(c=>c.id===boss.target);if(target)hurt(s,boss,target,raidSpellValue(s,19460),'暗影震击',{spellId:19460,school:5});}
 }else if(raid.id==='magmadar'){
  if(s.clock>=raid.nextFrenzy){raid.nextFrenzy=s.clock+roll(s,15000,20000);boss.enraged=true;
   raidAnimation(s,boss);
   addCombatAura(boss,{spell:19451,effect:1,type:138,amount:150,dispel:9,positive:true,until:s.clock+8000},s.clock);
   raidNotice(s,'玛格曼达陷入狂暴！猎人准备宁神射击。');
  }
  if(s.clock>=raid.nextFear){raid.nextFear=s.clock+roll(s,30000,35000);let feared=0;
   raidAnimation(s,boss);
   for(const c of living.filter(c=>distance(c,boss)<=30)){
    if(applySpellAura(c,{spell:19408,effect:1,type:7,amount:0,mechanic:5,positive:false,caster:boss.id,until:s.clock+8000},s.clock)){feared++;c.cast=null;}
   }
   raid.failures.feared+=feared;raidNotice(s,`恐慌：${feared}名成员陷入恐惧。`);
  }
  for(const [key,mana,duration]of [['nextBomb',false,30000],['nextManaBomb',true,60000]])if(s.clock>=raid[key]){
   raid[key]=s.clock+roll(s,12000,15000);raidAnimation(s,boss);
   const targets=randomTargets(s,living.filter(c=>(c.currentMaxMana>0)===mana),1);
   for(const c of targets)addRaidField(s,{center:{x:c.position,y:c.positionY},radius:5},{label:'熔岩炸弹',duration,damage:raidSpellValue(s,19428),spellId:19428});
   raidNotice(s,'熔岩炸弹：撤离落点，持续火区仍有危险。');
  }
 }
 raidFieldsTick(s,actors,boss,hurt);
 if(raid.id==='magmadar')raidFearWardTick(s,living);
 for(const c of living){
  if(c.raidEvadingAt===s.clock)continue;
  if(raid.tactics.dispel&&[5,8].includes(c.classId)&&assignedRaidSupport(s,c,c.classId===5?'magic':'curse')){
   const type=c.classId===5?1:2,target=raidDispelTargets(s,c,living,c.classId===5?'magic':'curse',type)[0];
   const sp=target&&ready(s,c,c.classId===5?527:475,target);
   if(sp&&supportCast(s,c,sp,target,()=>{raid.support.dispels+=dispelSpellAuras(target,[type],1,s,'negative');},type===1?'驱散魔法':'解除诅咒'))continue;
  }
  if(raid.tactics.tranquilize&&c.classId===3&&boss.enraged&&c===supportActor(s,living,'tranquilize',19801,boss)){
   const sp=ready(s,c,19801,boss);
   if(sp&&consumeHunterAmmo(c,'Tranquilizing Shot')&&supportCast(s,c,sp,boss,()=>{dispelSpellAuras(boss,[9],1,s);boss.enraged=false;raid.support.tranquilizes++;},'宁神射击'))continue;
  }
 }
 if(boss.enraged&&!boss.auras?.some(a=>a.dispel===9&&a.until>s.clock))boss.enraged=false;
 publishRaidWarnings(s);
}
