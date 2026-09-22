const finite=value=>Number.isFinite(value)?value:0;
const counterFields=['damage','healing','hits','crits','periodicDamage','periodicHits','healHits','healCrits'];
function presentedActors(metrics){
 const rows=new Map(Object.values(metrics.actors).map(row=>[row.actorId,{...row,spells:{...row.spells}}]));
 for(const pet of [...rows.values()]){
  if(!pet.petUnit||!pet.ownerId)continue;
  const owner=rows.get(pet.ownerId);
  if(!owner||![3,9].includes(owner.classId)||owner.petUnit)continue;
  for(const field of counterFields)owner[field]=finite(owner[field])+finite(pet[field]);
  owner.petDamage=finite(owner.petDamage)+finite(pet.damage);
  for(const [key,spell] of Object.entries(pet.spells||{})){
   const petKey=`pet:${pet.actorId}:${key}`;
   owner.spells[petKey]={...spell,label:`${pet.name} · ${spell.label}`};
  }
  rows.delete(pet.actorId);
 }
 return [...rows.values()];
}
export function meterRows(battle,clock=0){
 const metrics=battle?.metrics||battle;
 if(!metrics?.actors)return [];
 const elapsed=metrics.durationMs??Math.max(0,finite(battle.endedAt??clock)-finite(metrics.startedAt??battle.startedAt));
 const actors=presentedActors(metrics),seconds=elapsed/1000,total=actors.reduce((sum,row)=>sum+finite(row.damage),0);
 return actors.map(row=>({...row,
  dps:seconds>0?row.damage/seconds:0,share:total>0?row.damage/total:0,partial:!!metrics.partial,
  spells:Object.entries(row.spells).map(([key,spell])=>({...spell,key,dps:seconds>0?spell.damage/seconds:0,share:row.damage>0?spell.damage/row.damage:0})).sort((a,b)=>b.damage-a.damage||b.healing-a.healing||String(a.spellId).localeCompare(String(b.spellId))),
 })).sort((a,b)=>b.damage-a.damage||b.healing-a.healing||a.actorId.localeCompare(b.actorId));
}
