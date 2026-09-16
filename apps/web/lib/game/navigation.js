import {nodes} from './catalog.js';
import {travelRoute} from './mounts.js';

// Use the same road costs as travel, and never navigate to already credited objectives.
export function questNavigation(s,q){
 if(!q?.active)return null;
 const unfinished=q.objectives.filter(o=>o.count<o.required);
 const concrete=unfinished.filter(o=>o.kind!=='event');
 const objectives=concrete.length?concrete:unfinished;
 const turnIn=q.complete||!unfinished.length;
 const destinations=[...new Set(turnIn?q.endLocations:objectives.flatMap(o=>o.locations))].filter(id=>nodes[id]);
 const options=destinations.flatMap(to=>{try{return[{to,name:nodes[to].name,region:nodes[to].region,duration:travelRoute(s,to).duration,kind:turnIn?'turnin':'objective',here:to===s.location}];}catch{return[];}});
 return options.sort((a,b)=>a.duration-b.duration)[0]||null;
}

// Travel keeps its origin in the save until arrival. Expose the current road leg
// separately so the map can show progress without changing gameplay location.
export function journeyPosition(s){
 const a=s.activity;
 if(a.type!=='travel')return {from:s.location,to:s.location,progress:0};
 const progress=Math.max(0,Math.min(1,(s.clock-a.startedAt)/(a.endsAt-a.startedAt)));
 if(a.flight||!a.path?.length)return {from:a.from,to:a.to,progress};
 const total=a.path.reduce((sum,e)=>sum+(e.duration??e.distance/7*1000),0);
 let remaining=progress*total,from=a.from;
 for(const e of a.path){const to=e.a===from?e.b:e.a;const duration=e.duration??e.distance/7*1000;
  if(remaining<duration)return {from,to,progress:remaining/duration};
  remaining-=duration;from=to;
 }
 return {from:a.to,to:a.to,progress:0};
}
