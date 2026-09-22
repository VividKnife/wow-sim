import definitions from '../../../game-data/data/combat-areas.json' with {type:'json'};
import {point} from '../../../sim-core/src/geometry.js';
import {arenaClipMove} from '../../../sim-core/src/arena-space.js';

export function validateCombatArea(area){
 if(!area||area.shape!=='rectangle'||!['minX','maxX','minY','maxY'].every(key=>Number.isFinite(area[key]))||area.minX>=area.maxX||area.minY>=area.maxY)throw new Error('战斗区域必须是有效的矩形范围。');
 return {...area};
}
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
 const before=point(unit),area=s?.combat?.area,p=area?.obstacles?arenaClipMove(area,unit,value):boundedCombatPoint(area,value);
 unit.position=p.x;unit.positionY=p.y;
 return Math.hypot(p.x-before.x,p.y-before.y)>1e-12;
}
