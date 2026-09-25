import {point,distance} from './geometry.js';

export const arenaMaps=[
 {id:'courtyard',name:'双柱庭院',description:'开阔的中央交战区，两侧立柱提供掩护。',shape:'rectangle',minX:-24,maxX:24,minY:-18,maxY:18,obstacles:[{x:0,y:-8,radius:3},{x:0,y:8,radius:3}]},
 {id:'four-pillars',name:'四柱角斗场',description:'四根立柱分隔视线，换边与治疗支援尤为重要。',shape:'rectangle',minX:-28,maxX:28,minY:-22,maxY:22,obstacles:[{x:-8,y:-9,radius:2.8},{x:8,y:9,radius:2.8},{x:-8,y:9,radius:2.8},{x:8,y:-9,radius:2.8}]},
];
export function clearArenaSegment(area,from,to,padding=0){
 if(!area?.obstacles?.length)return true;
 const a=point(from),b=point(to),dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
 return area.obstacles.every(o=>{const t=length?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/length)):0;return Math.hypot(a.x+t*dx-o.x,a.y+t*dy-o.y)>=o.radius+padding-1e-8;});
}
export function arenaPointAllowed(area,value,padding=.45){
 const p=point(value);
 return p.x>=area.minX+padding&&p.x<=area.maxX-padding&&p.y>=area.minY+padding&&p.y<=area.maxY-padding&&(area.obstacles||[]).every(o=>Math.hypot(p.x-o.x,p.y-o.y)>=o.radius+padding);
}
export function arenaClipMove(area,from,to,padding=.45){
 const a=point(from),p=point(to),b={x:Math.max(area.minX+padding,Math.min(area.maxX-padding,p.x)),y:Math.max(area.minY+padding,Math.min(area.maxY-padding,p.y))};
 if(clearArenaSegment(area,a,b,padding))return b;
 let low=0,high=1;
 for(let i=0;i<24;i++){const t=(low+high)/2,q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};if(clearArenaSegment(area,a,q,padding))low=t;else high=t;}
 return{x:a.x+(b.x-a.x)*low,y:a.y+(b.y-a.y)*low};
}
const graphCache=new WeakMap();
function obstacleGraph(area){
 if(graphCache.has(area))return graphCache.get(area);
 const nodes=[];
 for(const o of area.obstacles||[])for(let i=0;i<12;i++){const angle=i*Math.PI/6,r=(o.radius+.55)/Math.cos(Math.PI/12),p={x:o.x+Math.cos(angle)*r,y:o.y+Math.sin(angle)*r};if(arenaPointAllowed(area,p))nodes.push(p);}
 const edges=nodes.map((a,i)=>nodes.flatMap((b,j)=>i!==j&&clearArenaSegment(area,a,b,.45)?[{to:j,cost:distance(a,b)}]:[]));
 const graph={nodes,edges};graphCache.set(area,graph);return graph;
}
// Visibility graph around inflated pillars. Both path planning and movement
// use the same unit radius; a fast movement cannot tunnel through a pillar.
export function arenaPath(area,from,to){
 const a=point(from),b=point(to);if(!arenaPointAllowed(area,b))return [];
 if(clearArenaSegment(area,a,b,.45))return[b];
 const graph=obstacleGraph(area),nodes=[...graph.nodes,a,b],start=nodes.length-2,end=start+1;
 const edges=graph.edges.map(row=>[...row]);edges.push([],[]);
 for(let i=0;i<start;i++)for(const j of [start,end])if(clearArenaSegment(area,nodes[i],nodes[j],.45)){const cost=distance(nodes[i],nodes[j]);edges[i].push({to:j,cost});edges[j].push({to:i,cost});}
 const costs=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),visited=new Set();costs[start]=0;
 for(let n=0;n<nodes.length;n++){
  let best=-1;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(best<0||costs[i]<costs[best]))best=i;
  if(best<0||!Number.isFinite(costs[best]))return[];if(best===end)break;visited.add(best);
  for(const edge of edges[best])if(costs[best]+edge.cost<costs[edge.to]){costs[edge.to]=costs[best]+edge.cost;previous[edge.to]=best;}
 }
 const path=[];for(let i=end;i!==start;i=previous[i]){if(i<0)return[];path.unshift(nodes[i]);}return path;
}
export function arenaWaypoint(area,unit,target,clock){
 const q=point(target),cached=unit.arenaPath;
 if(!cached||clock>=cached.until||distance(cached.target,q)>2||cached.points[0]&&!clearArenaSegment(area,unit,cached.points[0],.45))unit.arenaPath={target:q,until:clock+1000,points:arenaPath(area,unit,q)};
 // Being near a corner does not mean it is safe to cut it: the chord to the
 // next node can enter a pillar and leave the actor pinned against collision.
 const path=unit.arenaPath.points;while(path.length>1&&distance(unit,path[0])<.8&&clearArenaSegment(area,unit,path[1],.45))path.shift();
 return path[0]||null;
}
export const arenaSight=(a,b)=>!a?.pvp||!a.arenaArea||clearArenaSegment(a.arenaArea,a,b);
