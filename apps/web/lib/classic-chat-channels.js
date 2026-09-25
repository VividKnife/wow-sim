const combatKinds=new Set(['combat','combat-end','damage','incoming','heal','cast','miss','absorb','interrupt','buff','kill','death','tactic','impact','launch','raid-support']);

export function isCombatDetail(log){
 return combatKinds.has(log.kind)||Boolean(log.encounterId&&['info','rest','pet','cancel'].includes(log.kind));
}

export function chatChannelLogs(logs,channel,limit=30){
 return logs.filter(log=>isCombatDetail(log)===(channel==='combat')).slice(-limit).reverse();
}
