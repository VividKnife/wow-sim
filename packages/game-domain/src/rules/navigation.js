import {questEndpointHere} from './quests.js';
import {nodes,baseTravelSpeed,flightNodes,questLinks,endpointNodes,nameOf} from './catalog.js';
import {automaticTravelRoute,dismount} from './mounts.js';

// Keep the selected endpoint with its route so arrival can open that exact NPC.
export function questNpcNavigation(s,id,kind='ends'){
 const options=(questLinks[id]?.[kind]||[]).filter(e=>e.type==='creature').flatMap(endpoint=>{
  const locations=[...new Set([...endpointNodes(endpoint),...(questEndpointHere(s,id,kind,endpoint)?[s.location]:[])])];
  return locations.filter(to=>nodes[to]).flatMap(to=>{try{return [{to,name:nodes[to].name,region:nodes[to].region,duration:automaticTravelRoute(s,to).duration,kind:kind==='starts'?'accept':'turnin',here:to===s.location&&s.activity.type!=='travel',npcKey:'creature:'+endpoint.id,npcName:nameOf('npcs',endpoint.id),questId:id}];}catch{return [];}});
 });
 return options.sort((a,b)=>a.duration-b.duration||a.npcKey.localeCompare(b.npcKey))[0]||null;
}

// Use the same road costs as travel, and never navigate to already credited objectives.
export function questNavigation(s,q){
 if(!q?.active)return null;
 const unfinished=q.objectives.filter(o=>o.count<o.required);
 const concrete=unfinished.filter(o=>o.kind!=='event');
 const objectives=concrete.length?concrete:unfinished;
 const turnIn=q.complete||!unfinished.length;
 if(turnIn){const npc=questNpcNavigation(s,q.id);if(npc)return npc;}
 const destinations=[...new Set(turnIn?q.endLocations:objectives.flatMap(o=>o.locations))].filter(id=>nodes[id]);
 const options=destinations.flatMap(to=>{try{return[{to,name:nodes[to].name,region:nodes[to].region,duration:automaticTravelRoute(s,to).duration,kind:turnIn?'turnin':'objective',here:to===s.location&&s.activity.type!=='travel'}];}catch(error){return[];}});
 return options.sort((a,b)=>a.duration-b.duration)[0]||null;
}

// Travel keeps its origin in the save until arrival. Expose the current road leg
// separately so the map can show progress without changing gameplay location.
export function journeyPosition(s){
 const a=s.activity;
 if(a.type!=='travel')return {from:s.location,to:s.location,progress:0};
 const progress=Math.max(0,Math.min(1,(s.clock-a.startedAt)/(a.endsAt-a.startedAt)));
 if(!a.path?.length)return {from:a.from,to:a.to,progress};
 let remaining=Math.max(0,s.clock-a.startedAt),from=a.from;
 for(const e of a.path){const to=e.a===from?e.b:e.a;const duration=e.duration??e.distance/baseTravelSpeed*1000;
  if(remaining<duration)return {from,to,progress:(e.startProgress||0)+(1-(e.startProgress||0))*remaining/duration};
  remaining-=duration;from=to;
 }
 return {from:a.to,to:a.to,progress:0};
}

export function redirectedTravel(s,to){
 const a=s.activity;
 if(a.flight)throw new Error('飞行途中不能更改目的地。');
 if(a.to===to)throw new Error('已经在前往这个目的地。');
 let from=a.from,elapsed=Math.max(0,s.clock-a.startedAt);
 for(const leg of a.path||[]){
  const next=leg.a===from?leg.b:leg.a,duration=leg.duration??leg.distance/baseTravelSpeed*1000;
  if(elapsed<duration){
   const initial=leg.startProgress||0,progress=initial+(1-initial)*elapsed/duration,fullDuration=duration/(1-initial);
   // Compare both ways off the current road. Reversal starts at the same point.
   const choices=[{origin:from,exit:next,remaining:(1-progress)*fullDuration,startProgress:progress},{origin:next,exit:from,remaining:progress*fullDuration,startProgress:1-progress}];
   const options=choices.flatMap(choice=>{try{
    const tail=automaticTravelRoute({...s,location:choice.exit},to);
    const first={...leg,a:choice.origin,b:choice.exit,duration:choice.remaining,startProgress:choice.startProgress};
    return[{from:choice.origin,startedAt:s.clock,endsAt:s.clock+Math.ceil(choice.remaining+tail.duration),path:[first,...tail.path],duration:Math.ceil(choice.remaining+tail.duration)}];
   }catch(error){return[];}});
   if(!options.length)throw new Error('目前没有连通的路线');
   return options.sort((left,right)=>left.duration-right.duration)[0];
  }
  elapsed-=duration;from=next;
 }
 const tail=automaticTravelRoute({...s,location:from},to);
 return{from,startedAt:s.clock,endsAt:s.clock+tail.duration,path:tail.path,duration:tail.duration};
}

// A mixed journey changes mode and pays its fare exactly at each leg boundary.
export function travelPhase(s){
 const a=s.activity;
 if(a.type!=='travel'||!a.path?.length)return null;
 let from=a.from,elapsed=0;
 for(let index=0;index<a.path.length;index++){
  const leg=a.path[index],to=leg.a===from?leg.b:leg.a;
  const duration=leg.duration??leg.distance/baseTravelSpeed*1000;
  const end=a.startedAt+Math.ceil(elapsed+duration);
  if(s.clock<end)return {index,leg,from,to,end};
  elapsed+=duration;from=to;
 }
 return null;
}
export function nextTravelPhaseAt(s){return travelPhase(s)?.end??Infinity;}
export function updateTravelPhase(s){
 const phase=travelPhase(s);if(!phase)return;
 const a=s.activity;a.flight=!!phase.leg.flight;
 if(a.flight&&a.paidFlightLeg!==phase.index){
  dismount(s);s.money-=phase.leg.cost;a.paidFlightLeg=phase.index;
 }
}

// Only completed ground legs count; a redirected first leg can start mid-road.
export function discoverPassedFlightPoints(s){
 const discover=id=>{
  if(flightNodes.includes(id)&&!s.flightPoints.includes(id))s.flightPoints.push(id);
 };
 const a=s.activity;
 if(a.type!=='travel'){discover(s.location);return;}
 let from=a.from,elapsed=Math.max(0,s.clock-a.startedAt);
 if(!a.path?.[0]?.startProgress)discover(from);
 for(const leg of a.path||[]){
  const duration=leg.duration??leg.distance/baseTravelSpeed*1000;
  if(elapsed<duration)break;
  elapsed-=duration;from=leg.a===from?leg.b:leg.a;discover(from);
 }
}
