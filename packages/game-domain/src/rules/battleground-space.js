import {WARSONG} from '../../../game-data/battlegrounds.js';

export const bgNodes=Object.fromEntries(WARSONG.nodes.map(n=>[n.id,n]));
export const bgDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const adjacent=Object.fromEntries(WARSONG.nodes.map(n=>[n.id,[]]));
for(const [a,b] of WARSONG.edges){adjacent[a].push(b);adjacent[b].push(a);}
const paths=new Map();
export function battlegroundPath(from,to,route='tunnel'){
 const key=`${from}:${to}:${route}`;if(paths.has(key))return paths.get(key);
 const costs={[from]:0},previous={},open=new Set(Object.keys(bgNodes));
 while(open.size){
  const current=[...open].sort((a,b)=>(costs[a]??Infinity)-(costs[b]??Infinity))[0];
  if(current===to)break;open.delete(current);
  for(const next of adjacent[current]){
   const a=bgNodes[current],b=bgNodes[next],y=(a.y+b.y)/2;
   const lanePenalty=route==='ramp'&&y>40?2.3:route==='flank'&&Math.max(a.y,b.y)<65?4.6:1;
   const cost=costs[current]+bgDistance(a,b)*lanePenalty;
   if(cost<(costs[next]??Infinity)){costs[next]=cost;previous[next]=current;}
  }
 }
 const result=[];let cursor=to;while(cursor!==from&&previous[cursor]){result.unshift(cursor);cursor=previous[cursor];}
 paths.set(key,result);return result;
}
export function nearestBgNode(point){return WARSONG.nodes.reduce((best,n)=>bgDistance(n,point)<bgDistance(best,point)?n:best).id;}
export function bgSight(a,b){
 // Segment / axis-aligned rectangle intersection, including boundary contact.
 return !WARSONG.walls.some(w=>{
  let lo=0,hi=1;
  for(const [axis,min,max] of [['x',w.x,w.x+w.w],['y',w.y,w.y+w.h]]){
   const delta=b[axis]-a[axis];if(Math.abs(delta)<1e-9){if(a[axis]<min||a[axis]>max)return false;}
   else {const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;}
  }
  return true;
 });
}
export function moveBgActor(actor,destination,seconds,speed){
 if(!bgNodes[destination])return;
 let remaining=seconds*speed;
 // Finish a partially traversed edge before replanning. A mid-fight command
 // never teleports an actor or cuts through a base wall.
 while(remaining>0){
  if(!actor.edge){const path=battlegroundPath(actor.node,destination,actor.order.route);if(!path.length)break;actor.edge=path[0];}
  const target=bgNodes[actor.edge],distance=bgDistance(actor,target),step=Math.min(distance,remaining);
  if(distance>0){actor.x+=(target.x-actor.x)*step/distance;actor.y+=(target.y-actor.y)*step/distance;}
  remaining-=step;
  if(distance<=step+1e-9){actor.node=actor.edge;actor.edge=null;}else break;
 }
}
