import {battleLayout} from './combat-view.js';

export function sceneLayout(allies,enemies,zoom=1,area=null){
 const base=battleLayout(allies,enemies,zoom,area),tilt=.62;
 return {...base,scaleY:base.scale*tilt,originY:220+(base.originY-220)*tilt,
  units:Object.fromEntries(Object.entries(base.units).map(([id,p])=>[id,{left:p.left,top:220+(p.top-220)*tilt}]))};
}
export function unitBody(unit,scale){
 const species=unit.visual?.species,type=unit.creatureType??unit.visual?.creatureType;
 const kind=unit.totemUnit?'totem':species==='spider'||species==='crab'?'spider':unit.form==='cat'||unit.form==='bear'||unit.kind==='beast'||type===1?'beast':type===4?'elemental':type===2?'dragon':type===3?'demon':type===5?'giant':type===9?'mechanical':'humanoid';
 const size=unit.rank===3?1.7:kind==='giant'?1.5:unit.rank===1?1.2:unit.petUnit?.8:1;
 const height=Math.max(28,Math.min(48,scale*2.5))*size;
 return {kind,height,width:height*(['beast','spider','dragon'].includes(kind)?1.25:.78)};
}
// Display a short history instead of finishing each movement before the next
// network snapshot arrives. Never extrapolate beyond an authoritative position.
export function createSceneMotion(delayMs=300){
 let frames=[],key,camera,lastLayout;
 const cameraKey=layout=>[layout.scale,layout.scaleY,layout.originX,layout.originY].join(':');
 return {update(layout,encounter,now,snap=false){
  const nextCamera=cameraKey(layout);
  // Clock/HUD renders reuse this immutable layout. Recording it again delays
  // the previous position until just before the next packet and creates jumps.
  if(lastLayout===layout&&key===encounter&&!snap)return;
  lastLayout=layout;
  if(key!==encounter||snap||camera!==nextCamera){frames=[];key=encounter;camera=nextCamera;}
  const frame={at:now,units:layout.units};
  if(frames.at(-1)?.at===now)frames[frames.length-1]=frame;
  else frames.push(frame);
  // Bounded history also covers inactive tabs without retaining whole scenes.
  if(frames.length>32)frames.splice(0,frames.length-32);
 },read(layout,now){
  if(!frames.length)return layout;
  const at=now-delayMs;
  while(frames.length>2&&frames[1].at<=at)frames.shift();
  const from=frames[0],to=frames[1]||from;
  const t=Math.max(0,Math.min(1,(at-from.at)/Math.max(1,to.at-from.at)));
  const units=Object.fromEntries(Object.entries(layout.units).map(([id,current])=>{
   const a=from.units[id],b=to.units[id];
   return [id,a&&b?{left:a.left+(b.left-a.left)*t,top:a.top+(b.top-a.top)*t}:current];
  }));
  return {...layout,units};
 }};
}
