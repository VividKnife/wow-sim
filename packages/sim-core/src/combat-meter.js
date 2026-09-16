const finite=value=>Number.isFinite(value)?value:0;
export function meterRows(battle,clock=0){
 const metrics=battle?.metrics||battle;
 if(!metrics?.actors)return [];
 const elapsed=metrics.durationMs??Math.max(0,finite(battle.endedAt??clock)-finite(metrics.startedAt??battle.startedAt));
 const seconds=elapsed/1000,total=Object.values(metrics.actors).reduce((sum,row)=>sum+finite(row.damage),0);
 return Object.values(metrics.actors).map(row=>({...row,
  dps:seconds>0?row.damage/seconds:0,share:total>0?row.damage/total:0,partial:!!metrics.partial,
  spells:Object.values(row.spells).map(spell=>({...spell,dps:seconds>0?spell.damage/seconds:0,share:row.damage>0?spell.damage/row.damage:0})).sort((a,b)=>b.damage-a.damage||b.healing-a.healing||String(a.spellId).localeCompare(String(b.spellId))),
 })).sort((a,b)=>b.damage-a.damage||b.healing-a.healing||a.actorId.localeCompare(b.actorId));
}
