import {spellInfo,knownRank} from './character.js';
import {combatRole} from './combat-roles.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {controlled} from '../../../sim-core/src/combat-auras.js';
import {beginSpellTiming,spellReady} from './spell-timing.js';
import {applySpellAura} from './spell-aura-lifecycle.js';
import {raidNotice} from './molten-core-mechanics.js';

export function ready(s,c,id,target) {
 const spell=knownRank(c,id),sp=spell&&spellInfo(c,spell);
 if(!sp||c.hp<=0||c.cast||controlled(c,s.clock)||c.silenceUntil>s.clock||c.nextAction>s.clock||!spellReady(c,sp,s.clock)||c.mana<sp.mana||distance(c,target)>sp.range)return null;
 return sp;
}
export function supportCast(s,c,sp,target,apply,label) {
 const timing=beginSpellTiming(c,{...sp,castMs:0},s.clock);
 if(!timing.committed)return false;
 apply();c.nextAction=Math.max(c.nextAction,s.clock+1500);
 raidNotice(s,`${c.name}：${label} → ${target.name}`,'raid-support',{actorId:c.id,targetId:target.id,spellId:sp.Id});
 return true;
}
export function supportActor(s,living,job,spell,target){
 const ids=s.combat.raidEncounter.command?.plan.jobs[job];
 const candidates=ids?ids.map(id=>living.find(c=>c.id===id)).filter(Boolean):living;
 return candidates.find(c=>c.raidEvadingAt!==s.clock&&ready(s,c,spell,target));
}

export function raidFearWardTick(s,living){
 const raid=s.combat?.raidEncounter;
 if(!raid?.tactics.fearWard)return;
 const tanks=living.filter(c=>c.hp>0&&combatRole(c)==='tank');
 const tank=tanks.find(c=>c.id===raid.command?.plan.mainTank)||tanks.find(c=>c.raidMainTank)||tanks[0];
 if(!tank||tank.auras?.some(a=>a.spell===6346&&a.until>s.clock))return;
 const priest=supportActor(s,living.filter(c=>c.classId===5),'ward',6346,tank);
 const sp=priest&&ready(s,priest,6346,tank);
 if(sp)supportCast(s,priest,sp,tank,()=>{
  applySpellAura(tank,{spell:6346,effect:1,type:77,misc:5,amount:1,positive:true,consumeOnImmune:true,until:s.clock+180000,caster:priest.id},s.clock);
  raid.support.wards++;
 },'防护恐惧结界');
}
