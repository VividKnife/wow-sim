import {point,distance} from './geometry.js';
import {roomPointInside,roomSegmentInside} from './room-geometry.js';

// Movement collision and sight occlusion are separate queries. Hazards belong
// to encounter policy and never enter this hard-obstacle graph.
export function clearSceneSegment(area,from,to,padding=0,channel='movement'){
 if(area?.boundary&&!roomSegmentInside(area.boundary,point(from),point(to),padding))return false;
 if(!area?.obstacles?.length)return true;
 const a=point(from),b=point(to),dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
 return area.obstacles.every(o=>{if(o[channel==='sight'?'blocksSight':'blocksMovement']===false)return true;const t=length?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/length)):0;return Math.hypot(a.x+t*dx-o.x,a.y+t*dy-o.y)>=o.radius+padding-1e-8;});
}
export function scenePointAllowed(area,value,padding=.45){
 const p=point(value);
 return p.x>=area.minX+padding&&p.x<=area.maxX-padding&&p.y>=area.minY+padding&&p.y<=area.maxY-padding&&(!area.boundary||roomPointInside(area.boundary,p,padding))&&(area.obstacles||[]).every(o=>o.blocksMovement===false||Math.hypot(p.x-o.x,p.y-o.y)>=o.radius+padding);
}
export function clipSceneMove(area,from,to,padding=.45){
 const a=point(from),p=point(to),b={x:Math.max(area.minX+padding,Math.min(area.maxX-padding,p.x)),y:Math.max(area.minY+padding,Math.min(area.maxY-padding,p.y))};
 if(clearSceneSegment(area,a,b,padding))return b;
 let low=0,high=1;
 for(let i=0;i<24;i++){const t=(low+high)/2,q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};if(clearSceneSegment(area,a,q,padding))low=t;else high=t;}
 return{x:a.x+(b.x-a.x)*low,y:a.y+(b.y-a.y)*low};
}
const graphCache=new WeakMap();
const roomGraphs=new Map();
function obstacleGraph(area){
 const revision=area.navigationRevision||0,cached=graphCache.get(area);
 if(cached?.revision===revision)return cached;
 const nodes=[];
 for(const o of (area.obstacles||[]).filter(o=>o.blocksMovement!==false))for(let i=0;i<12;i++){const angle=i*Math.PI/6,r=(o.radius+.55)/Math.cos(Math.PI/12),p={x:o.x+Math.cos(angle)*r,y:o.y+Math.sin(angle)*r};if(scenePointAllowed(area,p))nodes.push(p);}
 const edges=nodes.map((a,i)=>nodes.flatMap((b,j)=>i!==j&&clearSceneSegment(area,a,b,.45)?[{to:j,cost:distance(a,b)}]:[]));
 const graph={nodes,edges,revision};graphCache.set(area,graph);return graph;
}
function roomGraph(area){
 const key=area.geometryHash,shared=key&&!area.obstacles?.length&&!area.navigationRevision;
 if(shared&&roomGraphs.has(key))return roomGraphs.get(key);
 const cached=graphCache.get(area);if(cached?.revision===(area.navigationRevision||0))return cached;
 const nodes=[],edges=[];
 const add=p=>{if(!scenePointAllowed(area,p))return -1;nodes.push(p);edges.push([]);return nodes.length-1;};
 const connect=(a,b)=>{if(a<0||b<0||!clearSceneSegment(area,nodes[a],nodes[b],.45))return;const cost=distance(nodes[a],nodes[b]);edges[a].push({to:b,cost});edges[b].push({to:a,cost});};
 const cells=area.navigation.triangles.map(t=>add({x:t.reduce((n,i)=>n+area.boundary[i].x,0)/3,y:t.reduce((n,i)=>n+area.boundary[i].y,0)/3}));
 for(const portal of area.navigation.portals){const [a,b]=portal.edge.map(i=>area.boundary[i]),node=add({x:(a.x+b.x)/2,y:(a.y+b.y)/2});for(const cell of portal.cells)connect(node,cells[cell]);}
 // Dynamic circular blockers can require a local detour within a floor cell.
 if(area.obstacles?.length){const first=nodes.length;
  for(const o of area.obstacles.filter(o=>o.blocksMovement!==false))for(let i=0;i<12;i++){const angle=i*Math.PI/6,r=(o.radius+.55)/Math.cos(Math.PI/12);add({x:o.x+Math.cos(angle)*r,y:o.y+Math.sin(angle)*r});}
  for(let i=first;i<nodes.length;i++)for(let j=0;j<i;j++)connect(i,j);
 }
 const graph={nodes,edges,revision:area.navigationRevision||0};graphCache.set(area,graph);
 if(shared){if(roomGraphs.size>=64)roomGraphs.delete(roomGraphs.keys().next().value);roomGraphs.set(key,graph);}
 return graph;
}
// Visibility graph around inflated pillars. Both path planning and movement
// use the same unit radius; a fast movement cannot tunnel through a pillar.
export function scenePath(area,from,to){
 if((area.obstacles?.length||0)>32)throw new Error('Scene visibility graph supports at most 32 obstacles');
 const a=point(from),b=point(to);if(!scenePointAllowed(area,b))return [];
 if(clearSceneSegment(area,a,b,.45))return[b];
 const graph=area.boundary?roomGraph(area):obstacleGraph(area),nodes=[...graph.nodes,a,b],start=nodes.length-2,end=start+1;
 const edges=graph.edges.map(row=>[...row]);edges.push([],[]);
 for(let i=0;i<start;i++)for(const j of [start,end])if(clearSceneSegment(area,nodes[i],nodes[j],.45)){const cost=distance(nodes[i],nodes[j]);edges[i].push({to:j,cost});edges[j].push({to:i,cost});}
 const costs=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),visited=new Set();costs[start]=0;
 for(let n=0;n<nodes.length;n++){
  let best=-1;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(best<0||costs[i]<costs[best]))best=i;
  if(best<0||!Number.isFinite(costs[best]))return[];if(best===end)break;visited.add(best);
  for(const edge of edges[best])if(costs[best]+edge.cost<costs[edge.to]){costs[edge.to]=costs[best]+edge.cost;previous[edge.to]=best;}
 }
 const path=[];for(let i=end;i!==start;i=previous[i]){if(i<0)return[];path.unshift(nodes[i]);}return path;
}
export function sceneWaypoint(area,unit,target,clock){
 const q=point(target),cached=unit.scenePath;
 if(!cached||cached.sceneId!==area.id||cached.revision!==(area.navigationRevision||0)||clock>=cached.until||distance(cached.target,q)>2||cached.points[0]&&!clearSceneSegment(area,unit,cached.points[0],.45))unit.scenePath={sceneId:area.id,revision:area.navigationRevision||0,target:q,until:clock+1000,points:scenePath(area,unit,q)};
 // Being near a corner does not mean it is safe to cut it: the chord to the
 // next node can enter a pillar and leave the actor pinned against collision.
 const path=unit.scenePath.points;let first=0;
 while(path.length-first>1&&distance(unit,path[first])<.8&&clearSceneSegment(area,unit,path[first+1],.45))first++;
 if(first)unit.scenePath={...unit.scenePath,points:path.slice(first)};
 return path[first]||null;
}
export const sceneSight=(area,a,b)=>clearSceneSegment(area,a,b,0,'sight');
