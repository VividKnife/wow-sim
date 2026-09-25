// Presentation selects from existing engine commands. It never edits quest credit.
export function nextQuestAction(player,quest,locations){
 if(!quest)return {label:'选择一项委托',reason:'与附近人物交谈，或在任务列表中选择。'};
 if(player.combat)return {label:player.activity.type==='idle'?'已申请战后停止':'本场结束后停止',command:player.activity.type==='idle'?null:{type:'stop'},reason:'当前战斗继续结算；停止后不会再开始下一场。'};
 if(player.hp<=0&&['idle','dead'].includes(player.activity.type))return {label:'返回尸体',command:{type:'revive'},reason:'角色已倒下，先恢复冒险能力。'};
 if(!['idle','hunt'].includes(player.activity.type))return {label:player.activity.type==='mount'?'正在召唤坐骑…':player.activity.type==='travel'?'正在前往目的地…':'正在处理当前活动…',reason:'完成当前活动后继续。'};
 if(quest.completed)return {label:'委托已交付',reason:'奖励已结算，可在任务列表选择下一项委托。'};
 if(!quest.active)return quest.canAccept?{label:'接受委托',command:{type:'accept',id:quest.id},reason:`向${quest.giver}接受任务。`}:{label:'暂时无法接取',reason:'请检查等级、前置任务和委托人所在地。'};
 if(quest.complete){
  if(!quest.canTurnIn)return {label:'返回委托人',command:{type:'navigateQuest',id:quest.id},reason:'返回交付地点后领取奖励。'};
  if(quest.choices.length)return {label:'选择任务奖励',reason:'本轮核心界面尚未接入可选奖励交付，请勿直接提交。'};
  return {label:'交付任务',command:{type:'turnin',id:quest.id},reason:'经验、报酬由真实任务规则结算。'};
 }
 if(player.activity.type==='hunt')return {label:'停止自动狩猎',command:{type:'stop'},reason:'正在准备或恢复，状态满足后将继续狩猎。'};
 if(quest.navigation&&!quest.navigation.here)return {label:`前往${locations.find(n=>n.id===quest.navigation.to)?.name||'任务区域'}`,command:{type:'navigateQuest',id:quest.id},reason:'按已解锁的路线移动；可用坐骑会自动召唤。'};
 const objective=quest.objectives.find(o=>o.count<o.required);
 if(objective?.kind==='kill'&&objective.locations.includes(player.location))return {label:'开始自动狩猎',command:{type:'hunt',id:objective.id,quest:quest.id},reason:'按已保存策略战斗，任务目标完成后自动停止。'};
 return {label:'查看任务目标',reason:'本轮只接通击杀任务操作；此任务的收集/剧情操作尚未接入新界面。'};
}
