import {combatRole} from './combat-roles.js';

export const conservingRaidMana=(s,c)=>s.combat?.raidEncounter?.command?.healingMode==='conserve'&&combatRole(c)==='healer';
// Keep a larger safety margin for tanks; other allies can wait for meaningful damage.
export function raidHealingThreshold(s,c,target,normal){
 return conservingRaidMana(s,c)?Math.min(normal,combatRole(target)==='tank'?.8:.6):normal;
}
