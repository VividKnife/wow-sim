export function hudBuffs(state, data) {
 const buffs=new Map();
 for(const buff of [...(state.serverBuffs||[]),...(data.playerBuffs||[]),...(data.itemBuffs||[])]) {
  if(buff.until!=null&&buff.until<=state.clock)continue;
  const id=buff.id||buff.spellId||buff.spell||buff.name;
  const duplicate=[...buffs.values()].find(entry=>entry.name===buff.name);
  if(duplicate)continue;
  buffs.set(id,{...buff,id,detail:buff.description||buff.detail||'',permanent:buff.until==null});
 }
 return [...buffs.values()];
}
export function buffDuration(ms) {
 const seconds=Math.max(1,Math.ceil(ms/1000));
 if(seconds>=3600)return `${Math.ceil(seconds/3600)}h`;
 if(seconds>=60)return `${Math.ceil(seconds/60)}m`;
 return `${seconds}s`;
}
