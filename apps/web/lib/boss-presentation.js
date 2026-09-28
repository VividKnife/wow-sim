export function combatBosses(battle,data){
 const entries=new Set([...(data.goldRaid?.bosses||[]).map(b=>b.entry),...(data.dungeon?.route||[]).flatMap(node=>node.bossIds||[])]);
 return (battle?.enemies||[]).filter(unit=>!unit.removed&&(entries.has(unit.entry)||(!entries.size&&(battle.raidEncounter?unit.id==='mc-boss':unit.rank===3))));
}
export function waitingRaidBoss(state,data){
 const raid=data.goldRaid;
 if(state.combat||!raid?.active||raid.phase!=='camp'||raid.map?.autoAdvance)return null;
 const boss=raid.bosses?.find(b=>b.id===raid.activeBoss);
 if(!boss||raid.cleared?.includes(boss.id))return null;
 return boss;
}
