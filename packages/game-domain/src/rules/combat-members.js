// Membership belongs to the encounter, not to whether it uses dungeon rules.
// Old outdoor encounters had no companions; preserve that roster on resume.
export function combatMembers(s,battle=s.combat){
 if(battle?.pvp&&s.arenaActors)return s.arenaActors;
 const owners=[s,...(s.party||[])];
 const all=[...owners,...owners.flatMap(c=>c.pet?[c.pet]:[]),...owners.flatMap(c=>Object.values(c.totems||{}).filter(t=>t.totemUnit)),...(s.escort?.npc?[s.escort.npc]:[])];
 if(!battle)return all;
 if(Array.isArray(battle.participantIds))return all.filter(c=>battle.participantIds.includes(c.id));
 return battle.dungeon?all:[s];
}
