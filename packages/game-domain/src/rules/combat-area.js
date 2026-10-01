import definitions from '../../../game-data/data/combat-areas.json' with {type:'json'};
import bossRooms from '../../../game-data/data/boss-rooms.json' with {type:'json'};
import {bakeRoomNavigation} from '../../../sim-core/src/room-geometry.js';
import {point} from '../../../sim-core/src/geometry.js';
import {clipSceneMove} from '../../../sim-core/src/scene-space.js';

export function validateCombatArea(area){
 if(!area||!['rectangle','polygon'].includes(area.shape)||!['minX','maxX','minY','maxY'].every(key=>Number.isFinite(area[key]))||area.minX>=area.maxX||area.minY>=area.maxY)throw new Error('战斗区域必须是有效的范围。');
 if(area.shape==='polygon'){
  const navigation=bakeRoomNavigation(area.boundary);
  if(JSON.stringify(navigation)!==JSON.stringify(area.navigation)||area.boundary.some(p=>p.x<area.minX||p.x>area.maxX||p.y<area.minY||p.y>area.maxY))throw new Error('房间导航与边界不一致。');
  if(area.geometryHash&&!Object.values(bossRooms).some(room=>room.geometryHash===area.geometryHash&&JSON.stringify(room.boundary)===JSON.stringify(area.boundary)))throw new Error('房间几何版本无效。');
 }
 if(area.navigationRevision!==undefined&&(!Number.isSafeInteger(area.navigationRevision)||area.navigationRevision<0))throw new Error('导航版本必须是非负安全整数。');
 if(area.obstacles!==undefined&&(!Array.isArray(area.obstacles)||area.obstacles.length>32||area.obstacles.some(o=>!o||!['x','y','radius'].every(k=>Number.isFinite(o[k]))||o.radius<=0||['blocksSight','blocksMovement'].some(k=>o[k]!==undefined&&typeof o[k]!=='boolean'))))throw new Error('战斗障碍必须是最多32个有效圆形，遮挡与碰撞属性必须是布尔值。');
 return {...area};
}
export function bossCombatArea(id){return bossRooms[id]?validateCombatArea(structuredClone(bossRooms[id])):null;}
// Local encounter coordinates in yards. These authored play spaces are not
// extracted collision geometry or a reproduction of the original navmesh.
export function sceneCombatArea({dungeon=false,routeId,location}={}){
 const profile=routeId?definitions.encounters[routeId]:definitions.locations[location];
 return validateCombatArea(definitions.profiles[profile||(dungeon?'room':'outdoor')]);
}
export function boundedCombatPoint(area,value){
 const p=point(value);
 return area?{x:Math.max(area.minX,Math.min(area.maxX,p.x)),y:Math.max(area.minY,Math.min(area.maxY,p.y))}:p;
}
export function setCombatPosition(s,unit,value){
 const before=point(unit),area=s?.combat?.area,p=area?.boundary||area?.obstacles?clipSceneMove(area,unit,value):boundedCombatPoint(area,value);
 unit.position=p.x;unit.positionY=p.y;
 return Math.hypot(p.x-before.x,p.y-before.y)>1e-12;
}
