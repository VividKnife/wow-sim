import {spells} from './catalog.js';
import {rng} from './character.js';
import {activeAuras} from '../../../sim-core/src/combat-auras.js';
import {castEnemySpell} from './enemy-spells.js';

export function triggerMeleeProcs(s,owner,other,eventFlags,actors,hurt,extraAttack=false){
 if(owner.hp<=0||other.hp<=0)return;
 const sources=activeAuras(owner,s.clock).filter(a=>a.type===42).map(a=>({spell:a.spell,trigger:a.trigger}));
 // Player-maintained buffs use the existing buff store rather than NPC aura slots.
 for(const buff of Object.values(owner.buffs||{}))if(buff.until>s.clock){const sp=spells[buff.spell];for(let n=1;n<=3;n++)if(sp?.['EffectApplyAuraName'+n]===42)sources.push({spell:sp.Id,trigger:sp['EffectTriggerSpell'+n]});}
 for(const source of sources){
  const passive=spells[source.spell],trigger=spells[source.trigger];if(!passive||!trigger||!(passive.ProcFlags&eventFlags))continue;
  if(extraAttack&&[1,2,3].some(n=>trigger['Effect'+n]===19))continue;
  if(rng(s)*100>=passive.ProcChance)continue;
  const target=trigger.EffectImplicitTargetA1===1?owner:other;
  castEnemySpell(s,owner,target,trigger.Id,actors,hurt,2);
 }
}
