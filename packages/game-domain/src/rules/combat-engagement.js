// Encounter-local participation survives threat resets and JSON continuation.
// PvP has its own timed inCombat rules; PvE resets this with each encounter.
export function markCombatEngaged(s,c){
 if(!s.combat||s.combat.pvp)return;
 const ids=s.combat.engagedMemberIds??=[];
 if(!ids.includes(c.id))ids.push(c.id);
}
