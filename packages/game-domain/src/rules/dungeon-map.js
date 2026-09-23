import {dungeonDefinitions,dungeonRoute} from './dungeon-registry.js';
import presentation from '../../../game-data/data/dungeon-presentation.json' with {type:'json'};
import boundsData from '../../../game-data/data/dungeon-map-bounds.json' with {type:'json'};

const textures={'ragefire-chasm':'Ragefire','wailing-caverns':'WailingCaverns','shadowfang-keep':'ShadowfangKeep','blackfathom-deeps':'BlackFathomDeeps',gnomeregan:'Gnomeregan','razorfen-kraul':'RazorfenKraul','razorfen-downs':'RazorfenDowns',uldaman:'Uldaman'};
const wings={'scarlet-monastery-graveyard':1,'scarlet-monastery-library':2,'scarlet-monastery-armory':3,'scarlet-monastery-cathedral':4};
const floorNames={ShadowfangKeep:['庭院','餐厅','兽穴','观测台','塔楼','阿鲁高的房间','城墙'],BlackFathomDeeps:['阿斯卡之池','月神圣地','遗忘之池'],Gnomeregan:['齿轮大厅','宿舍','发射台','工匠议会'],Uldaman:['守护者大厅','卡兹格罗斯的王座']};
// Client axes are (-worldY, worldX). Project using client bounds, never a
// generated grid. Overlapping vertical rooms are separated by spawn elevation.
export function projectDungeonPosition(folder,floor,position){
 const [width,height,left,top,right,bottom]=boundsData.bounds[folder][floor];
 return [(-position.position_y-Math.min(left,right))/width*1002,(Math.max(top,bottom)-position.position_x)/height*668];
}
function sourceFloor(folder,position,candidates){
 const z=position.position_z,x=position.position_x,y=position.position_y;
 let preferred;
 if(folder==='Gnomeregan')preferred=z<-300?4:z<-240?3:z<-180?2:1;
 if(folder==='ShadowfangKeep')preferred=z>150?6:z>140?5:z>132?4:z>115?3:y>2210?2:z>88?7:1;
 if(folder==='BlackFathomDeeps')preferred=y<-300?3:x<-600?2:1;
 if(folder==='Uldaman')preferred=x>60&&y<360?2:1;
 const contained=candidates.filter(f=>{const [px,py]=projectDungeonPosition(folder,f.id,position);return px>=0&&px<=1002&&py>=0&&py<=668;});
 return (contained.find(f=>f.id===preferred)||contained[0]||candidates.find(f=>f.id===preferred)||candidates[0]).id;
}

// Original Blizzard floor textures, assembled losslessly from a pinned Classic
// client texture mirror. Room anchors are calibrated to the artwork; encounter
// groups represent a room/pack, not each individual spawn. See the import report.
function buildMap(id){
 const route=dungeonRoute(id),edges=[];
 const chain=ids=>{for(let i=1;i<ids.length;i++)edges.push([ids[i-1],ids[i]]);};
 let coordinates,floors;
 const floorByNode={entrance:1};
 if(id==='deadmines'){
  const branches=[['dm-junction','dm-johnson-approach','dm-miner-johnson'],['dm-cove-01','dm-cove-side'],['dm-lowerdeck-01','dm-dock-side'],['dm-foredeck','dm-cookie-approach-east','dm-cookie','dm-cookie-approach-west','dm-exit-tunnel-01','dm-exit-tunnel-02']];
  const side=new Set(branches.flatMap(b=>b.slice(1)));
  chain(['entrance',...route.filter(e=>!side.has(e.id)).map(e=>e.id)]);branches.forEach(chain);
  coordinates=[
   [248,96],[244,130],[249,161],[215,177],[243,205],[276,217],[334,267],[294,343],
   [365,411],[280,295],[435,406],[470,350],[523,336],[476,446],
   [445,535],[447,587],[516,607],[502,565],[449,475],
   [561,583],[626,600],[645,582],[610,546],[610,488],[556,441],
   [75,539],[110,587],[165,550],[125,501],[651,441],
   [122,437],[151,395],[216,379],[221,317],[281,328],[326,326],[373,323],
   [414,284],[286,458],[415,243],[433,179],[461,147],[500,138],[548,170],
   [562,203],[534,322],[450,429],[525,262],[547,297],[575,253],[587,216],
   [633,249],[607,307],[672,215],[674,276],[662,344],[755,285],[848,288],
  ];
  floors=[{id:1,name:'矿道与工厂',image:'/maps/dungeons/thedeadmines-1.webp'},{id:2,name:'船坞与海盗船',image:'/maps/dungeons/thedeadmines-2.webp'}];
  route.forEach((e,i)=>{floorByNode[e.id]=i>=25&&i!==29?2:1;});
 }else if(id==='stockades'){
  const node=n=>'stockades-'+String(n).padStart(2,'0');
  const paths=[[1,2,3,8,11,16,18,20,23,30],[2,5,4,12,15,19,31],[4,6,32,35],[3,7,9,10,13,14,17,21,22,24,26,34],[26,25,29,28,27,33]];
  edges.push(['entrance',node(1)]);paths.forEach(path=>chain(path.map(node)));
  coordinates=[
   [500,505],[499,444],[499,393],[549,305],[558,359],[750,276],[451,360],
   [500,342],[441,305],[440,239],[500,286],[619,293],[390,236],[389,179],
   [686,263],[500,238],[339,161],[500,197],[714,246],[469,237],[331,220],
   [300,204],[533,238],[365,280],[245,246],[286,264],[246,84],[134,142],[174,245],
   [501,145],[684,190],[783,309],[268,112],[307,292],[870,358],
  ];
  floors=[{id:1,name:'暴风城监狱',image:'/maps/dungeons/thestockade-1.webp'}];
  route.forEach(e=>{floorByNode[e.id]=1;});
 }
 if(!coordinates){
  chain(['entrance',...route.map(e=>e.id)]);
  const folder=textures[id]||'ScarletMonastery';
  floors=presentation.floors[folder].filter(f=>!wings[id]||f.id===wings[id]).map(f=>({...f,name:floorNames[folder]?.[f.id-1]||dungeonDefinitions[id].name}));
  const points=Object.fromEntries([]);
  for(const encounter of [{id:'entrance',sourceCentroid:dungeonDefinitions[id].reference.entrance},...route]){
   const position=encounter.sourceCentroid;
   const floor=wings[id]||sourceFloor(folder,position,floors);
   floorByNode[encounter.id]=floor;points[encounter.id]=projectDungeonPosition(folder,floor,position);
  }
  return {width:1002,height:668,points,edges,floors,floorByNode,attribution:'原版地图 · ClassicDB 出生坐标 · 遭遇路线改编'};
 }
 const points=Object.fromEntries(route.map((e,i)=>[e.id,coordinates[i]]));
 points.entrance=id==='deadmines'?[299,87]:[501,547];
 return {width:1002,height:668,points,edges,floors,floorByNode};
}
const maps=Object.fromEntries(Object.keys(dungeonDefinitions).map(id=>[id,buildMap(id)]));
export const dungeonMap=id=>maps[id];

export function dungeonPath(id,from,to){
 const map=dungeonMap(id),queue=[[from]],seen=new Set([from]);
 for(let i=0;i<queue.length;i++){
  const path=queue[i],last=path.at(-1);if(last===to)return path;
  for(const [a,b] of map.edges){const next=a===last?b:b===last?a:null;if(next&&!seen.has(next)){seen.add(next);queue.push([...path,next]);}}
 }
 return [];
}

export function dungeonDestinationPath(s,destination){
 const d=s.dungeon,route=dungeonRoute(d.id),from=s.combat?.routeId||d.locationId;
 const path=dungeonPath(d.id,from,destination);
 // The current room cannot be bypassed if a fight or an interaction is underway.
 const active=route[d.cursor];
 if((s.combat||s.activity.type==='dungeonCannon')&&active&&!path.includes(active.id))path.unshift(active.id);
 return path;
}
