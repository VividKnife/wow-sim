export function hudEffects(state, data) {
 const effects=new Map();
 for(const buff of [...(state.serverBuffs||[]),...(data.playerEffects||[]),...(data.itemBuffs||[])]) {
  if(buff.startsAt!=null&&buff.startsAt>state.clock)continue;
  if(buff.until!=null&&buff.until<=state.clock)continue;
  const kind=buff.kind==='debuff'?'debuff':'buff',caster=buff.caster||null;
  const id=`${kind}:${buff.spellId||buff.spell||buff.id||buff.name}:${caster||''}`;
  const duplicate=[...effects.values()].find(entry=>buff.name&&entry.name===buff.name&&entry.kind===kind&&entry.caster===caster);
  if(duplicate&&!buff.gm)continue;
  effects.set(id,{...buff,id,kind,caster,detail:buff.description||buff.detail||'',permanent:buff.until==null});
 }
 return [...effects.values()];
}
export function buffDuration(ms) {
 const seconds=Math.max(1,Math.ceil(ms/1000));
 if(seconds>=3600)return `${Math.ceil(seconds/3600)}h`;
 if(seconds>=60)return `${Math.ceil(seconds/60)}m`;
 return `${seconds}s`;
}

export function buffRemaining(ms) {
 const seconds=Math.max(0,Math.ceil(ms/1000));
 if(seconds>=3600)return `剩余 ${Math.ceil(seconds/3600)} 小时`;
 if(seconds>=60)return `剩余 ${Math.ceil(seconds/60)} 分钟`;
 return `剩余 ${seconds} 秒`;
}
