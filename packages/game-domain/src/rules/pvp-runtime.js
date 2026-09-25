import {spells,creatures,items} from './catalog.js';
import {registerPvpControl,pvpControlProfile,pvpControlRemaining} from '../../../sim-core/src/pvp-control.js';
import {addCombatAura,activeAuras,hasAura} from '../../../sim-core/src/combat-auras.js';

// Classic groups, separately identified from Retail/TBC. Pinned reference:
// CMaNGOS 8ec338a, SpellMgr::GetDiminishingReturnsGroupForSpell and Unit::GetDiminishing.
const groups={Polymorph:'polymorph',Gouge:'knockout',Sap:'knockout',Blind:'blind','Kidney Shot':'kidney',Fear:'warlock-fear',Seduction:'warlock-fear','Psychic Scream':'fear','Intimidating Shout':'fear','Howl of Terror':'fear','Death Coil':'horror',Hibernate:'sleep','Freezing Trap Effect':'freeze','Frost Nova':'root',Frostbite:'trigger-root','Entangling Roots':'root','Hammer of Justice':'stun','Cheap Shot':'stun','Concussion Blow':'stun',Bash:'stun',Pounce:'stun','War Stomp':'stun',Impact:'trigger-stun',Blackout:'trigger-stun','Improved Concussive Shot':'trigger-stun',Banish:'banish','Mace Stun Effect':'trigger-stun',Pyroclasm:'trigger-stun','Starfire Stun':'trigger-stun','Revenge Stun':'trigger-stun','Improved Hamstring':'trigger-root','Improved Wing Clip':'trigger-root',Entrapment:'trigger-root',Intimidation:'stun'};
for(const sp of Object.values(spells)){
 const group=[19970,19971,19972,19973,19974,19975].includes(sp.Id)?'trigger-root':groups[sp.SpellName];if(!group)continue;
 const types=[...new Set([1,2,3].map(n=>sp['EffectApplyAuraName'+n]).filter(t=>[5,7,12,26,27,67,118].includes(t)))];
 if(sp.SpellName==='Polymorph')types.push(5);
 const breaks=['polymorph','knockout','blind','sleep','freeze'].includes(group)?'always':['root','trigger-root','fear','warlock-fear'].includes(group)?'chance':null;
 registerPvpControl(sp.Id,{group,types,capMs:20000,breakOnDamage:breaks});
}
// Pyroclasm's triggered row is absent from the playable spell subset.
const triggeredPyroclasm={Id:18093,SpellName:'Pyroclasm',Mechanic:12,Dispel:1};
registerPvpControl(18093,{group:'trigger-stun',types:[12],capMs:3000});
export {pvpControlProfile,pvpControlRemaining};
export const polymorphImmune=unit=>unit?.classId===11&&!!unit.form;
export function pvpTriggeredControl(s,c,target,id,type,duration){return pvpApplyControl(s,c,target,spells[id]||(id===18093?triggeredPyroclasm:null),type,duration);}
export function unitCreatureType(unit){return unit?.pvp&&!unit.petUnit&&!unit.totemUnit?(['bear','cat','travel','aquatic','direbear','wolf'].includes(unit.form)?1:7):unit?.creatureType||creatures[unit?.entry]?.CreatureType||0;}
export function pvpApplyControl(s,c,target,sp,type,duration=sp.durationMs,extra={}){
 if(!target?.pvp)return false;
 const effect=[1,2,3].find(n=>sp['EffectApplyAuraName'+n]===type)||1;
 const mechanic=sp['EffectMechanic'+effect]||sp.Mechanic;
 addCombatAura(target,{spell:sp.Id,effect,type,mechanic,dispel:sp.Dispel,positive:false,caster:c.id,until:s.clock+duration,...extra},s.clock);return true;
}
const disallowed=new Set(['Mind Control','Inferno','Curse of Doom','Taunt','Growl','Challenging Shout','Challenging Roar','Tame Beast','Enslave Demon','Ritual of Doom','Divine Intervention','Rebirth','Resurrection','Redemption','Ancestral Spirit']);
export function pvpAbilityAllowed(c,target,sp,clock){
 if(!c.pvp)return true;
 if(disallowed.has(sp.SpellName))return false;
 if(target?.pvp&&target.teamId!==c.teamId){
  if(sp.TargetCreatureType&&!(sp.TargetCreatureType&(1<<(unitCreatureType(target)-1))))return false;
  if(sp.SpellName==='Polymorph'&&polymorphImmune(target))return false;
  if(pvpControlProfile(sp.Id)&&pvpControlRemaining(target,sp.Id,clock,sp.durationMs||1)<=0)return false;
 }
 if(sp.SpellName==='Sap'&&target?.inCombat)return false;
 if(sp.SpellName==='Stealth'&&c.inCombat)return false;
 if([2,3].includes(sp.DmgClass)&&hasAura(c,67,clock))return false;
 const weaponRequired=sp.EquippedItemClass===2;
 if(weaponRequired&&!Object.values(c.equipment||{}).some(i=>items[i?.id]?.class===2))return false;
 if(activeAuras(c,clock).some(a=>a.type===27)&&sp.School>0)return false;
 return true;
}
