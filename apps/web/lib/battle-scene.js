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
// Retarget from the current visual position, never from the previous snapshot.
export function createSceneMotion(){
 const tracks=new Map();let key;
 const sample=(track,now)=>{const t=Math.max(0,Math.min(1,(now-track.at)/180));return {left:track.from.left+(track.to.left-track.from.left)*t,top:track.from.top+(track.to.top-track.from.top)*t};};
 return {update(layout,encounter,now,snap=false){
  if(key!==encounter||snap){tracks.clear();key=encounter;}
  for(const [id,to] of Object.entries(layout.units)){
   const track=tracks.get(id);
   if(!track||track.to.left!==to.left||track.to.top!==to.top)tracks.set(id,{from:track?sample(track,now):to,to,at:now});
  }
  for(const id of tracks.keys())if(!layout.units[id])tracks.delete(id);
 },read(layout,now){return {...layout,units:Object.fromEntries([...tracks].map(([id,track])=>[id,sample(track,now)]))};}};
}
