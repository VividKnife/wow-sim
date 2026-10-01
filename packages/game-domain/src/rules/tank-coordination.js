import {combatMembers} from './combat-members.js';
import {combatRole} from './combat-roles.js';

// Automatic taunts rescue allies without rotating a foe between allied tanks.
// Explicit player commands still use the ordinary spell validation path.
export function shouldAutoTaunt(s,c,enemy){
 if(!enemy?.target||enemy.target===c.id||combatRole(c)!=='tank')return false;
 const victim=combatMembers(s).find(a=>a.id===enemy.target&&a.hp>0);
 if(!victim||combatRole(victim)!=='tank')return true;
 // The assigned main tank may take its target back after a backup's rescue.
 return !!(s.combat?.raidEncounter&&c.raidMainTank&&!victim.raidMainTank&&c.raidTargetId===enemy.id);
}
