// Core journey events are retained separately from transient combat effects.
export function journeyEvent(s,event){
 s.journey??=[];
 const row={id:(s.journeySequence=(s.journeySequence||0)+1),at:s.clock,...event};
 s.journey.push(row);
 if(s.journey.length>100)s.journey.splice(0,s.journey.length-100);
 return row;
}
export function recordJourneyLog(s,event){
 if(['travel','quest','dungeon','level','learn'].includes(event.kind))journeyEvent(s,{kind:event.kind,text:event.text});
}
export function beginJourneyBattle(s){
 const battle=s.combat,hunt=s.activity.type==='hunt'&&!battle.dungeon;
 let row=hunt&&s.activity.journeySession!=null?s.journey?.find(row=>row.kind==='hunt'&&row.session===s.activity.journeySession):null;
 if(!row){
  row=journeyEvent(s,{kind:hunt?'hunt':'battle',text:(hunt?'挂机战斗：':'进入战斗：')+[...new Set(battle.enemies.map(e=>e.name))].join('、'),kills:0,endedAt:s.clock,battleIds:[]});
  if(hunt){s.activity.journeySession=row.id;row.session=row.id;}
 }
 row.battleIds.push(battle.id);row.battleIds=row.battleIds.slice(-20);
 battle.journeyId=row.id;
}
export function finishJourneyBattle(s,battle){
 const row=s.journey?.find(row=>row.id===battle.journeyId);
 if(row){row.endedAt=s.clock;row.kills+=battle.enemies.filter(e=>e.dead&&!e.summonedBy).length;}
}
