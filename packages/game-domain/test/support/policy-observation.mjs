// Test-only reference of the pre-2.0 observer, retained for differential checks
// and cost measurements. Production has one observer and one combat kernel.
import {stats,newCharacter} from '../../src/rules/character.js';
import {spells} from '../../src/rules/catalog.js';
import {combatRole} from '../../src/rules/combat-roles.js';
import {combatMembers} from '../../src/rules/combat-members.js';
import {policyState} from '../../src/rules/combat-policy.js';

export function referenceObservation(s,actors){
 const p=policyState(s);p.observation++;
 const old=p.observed||{},next={},wake=new Set();
 for(const c of actors){
  const critical=c.hp>0&&c.hp<stats(c).maxHp*.4;next[c.id]=critical?1:0;
  if(critical&&old[c.id]!==1){wake.add(c.id);for(const healer of actors)if(combatRole(healer)==='healer')wake.add(healer.id);}
  const debuffs=(c.auras||[]).filter(a=>!a.positive&&(a.dispel||spells[a.spell]?.Dispel)).map(a=>a.spell+':'+a.until).join(',');
  next['debuff:'+c.id]=debuffs;
  if(debuffs&&old['debuff:'+c.id]!==debuffs)for(const healer of actors)if(combatRole(healer)==='healer')wake.add(healer.id);
 }
 const focus=s.combat.command?.focusId??null;
 for(const e of s.combat.enemies){
  const key='enemy:'+e.id,value=`${e.hp>0}:${e.cast?.spell||0}:${e.cast?.startedAt||0}`;next[key]=value;
  if(old[key]!==value)for(const c of actors)if(c.target===e.id||e.cast)wake.add(c.id);
 }
 if(old.focus!==focus)for(const c of actors)wake.add(c.id);next.focus=focus;p.observed=next;
 const ids=[...wake],at=s.clock+100;
 for(const c of combatMembers(s))if(ids.includes(c.id)){
  const slot=p.slots[c.id]??={controller:'local',generation:1,sequence:0,next:0,reaction:0,dirty:null,queued:null,inflight:null};
  slot.dirty=slot.dirty==null?at:Math.min(slot.dirty,at);
 }
}

export function observationFixture(size=40){
 const actors=Array.from({length:size},(_,i)=>{
  const c=newCharacter('Observer '+i,[1,5,11,8,3][i%5],60,i%5===2?4:i%5===4?3:1);
  Object.assign(c,{id:'actor:'+i,target:'enemy:'+i%8,auras:[],hp:stats(c).maxHp});
  return c;
 });
 const s=actors[0];s.party=actors.slice(1);s.clock=0;s.rngState=12345;
 s.combat={id:'observer-fixture',dungeon:true,enemies:Array.from({length:8},(_,i)=>({id:'enemy:'+i,hp:1000,cast:null}))};
 return s;
}
