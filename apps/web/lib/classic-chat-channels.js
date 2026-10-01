const combatKinds=new Set(['combat','combat-end','damage','incoming','heal','cast','miss','absorb','interrupt','buff','kill','death','tactic','impact','launch','raid-support']);

export function isCombatDetail(log){
 return combatKinds.has(log.kind)||Boolean(log.encounterId&&['info','rest','pet','cancel'].includes(log.kind));
}

export function chatChannelLogs(logs,channel,limit=30){
 return logs.filter(log=>isCombatDetail(log)===(channel==='combat')).slice(-limit).reverse();
}

export function chatLogCategory(log){
 if(['loot','xp','level','money','reward'].includes(log.kind))return {id:'reward',label:'收获'};
 if(log.kind==='quest')return {id:'quest',label:'任务'};
 if(['travel','explore','discover'].includes(log.kind))return {id:'travel',label:'旅途'};
 if(isCombatDetail(log))return {id:'combat',label:'战斗'};
 return {id:'system',label:'动态'};
}
