import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {bakeRoomNavigation,roomPointInside} from '../packages/sim-core/src/room-geometry.js';
import {spiralField} from '../packages/sim-core/src/encounter-geometry.js';

const source=new URL('../packages/game-data/source/boss-rooms.json',import.meta.url);
const destination=new URL('../packages/game-data/data/boss-rooms.json',import.meta.url);
export const REQUIRED_BOSS_ROOMS=['lucifron','magmadar','gehennas','garr','baron-geddon','shazzrah','sulfuron','golemagg','majordomo','ragnaros','onyxia'];
const commonAnchors=['entrance','assembly','boss','mainTank'];
const raidAnchors=['melee','ranged','offTank','adds','bombEscapeNorth','bombEscapeSouth'];
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/** Compile authored floors once, rejecting unusable encounter layouts at build time. */
export function compileBossRooms(sourceRooms){
 if(!isRecord(sourceRooms))throw new Error('Boss rooms must be an object');
 for(const key of REQUIRED_BOSS_ROOMS)if(!Object.hasOwn(sourceRooms,key))throw new Error(`Missing boss room: ${key}`);
 const rooms=structuredClone(sourceRooms),ids=new Set();
 for(const [key,room]of Object.entries(rooms)){
  const fail=message=>{throw new Error(`Invalid boss room ${key}: ${message}`);};
  if(!isRecord(room))fail('expected room object');
  if(typeof room.id!=='string'||!room.id.trim()||ids.has(room.id))fail('id must be nonempty and unique');
  ids.add(room.id);
  if(!Number.isSafeInteger(room.version)||room.version<1)fail('version must be a positive integer');
  if(typeof room.name!=='string'||!room.name.trim())fail('name is required');
  if(room.shape!=='polygon')fail('shape must be polygon');
  if(!['molten','onyxia'].includes(room.ground))fail('unknown ground');
  if(!isRecord(room.appearance)||['floor','wall','rim'].some(key=>!/^#[\da-f]{6}$/i.test(room.appearance[key])))fail('floor, wall and rim must be hex colors');
  if(!isRecord(room.anchors))fail('anchors are required');
  const required=[...commonAnchors,...(key==='onyxia'?['whelpNorth','whelpSouth']:raidAnchors),...(key==='ragnaros'?Array.from({length:8},(_,i)=>`son${i}`):[])];
  for(const name of required)if(!Object.hasOwn(room.anchors,name))fail(`missing anchor ${name}`);
  // A source file must never override compiled navigation, bounds or identity.
  for(const field of ['navigation','minX','maxX','minY','maxY','geometryHash'])if(Object.hasOwn(room,field))fail(`${field} is generated, not authored`);
  try{room.navigation=bakeRoomNavigation(room.boundary);}catch(error){fail(error.message);}
  for(const [name,anchor]of Object.entries(room.anchors)){
   if(!isRecord(anchor)||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y)||!roomPointInside(room.boundary,anchor,.75))fail(`anchor ${name} must be inside the floor with clearance`);
  }
  // The preparation tableau can hold a full 40-player raid with five-yard spacing.
  for(let row=0;row<5;row++)for(let column=0;column<8;column++){
   const p={x:room.anchors.assembly.x+(column-3.5)*5,y:room.anchors.assembly.y+(row-2)*5};
   if(!roomPointInside(room.boundary,p,.75))fail(`assembly cannot hold 40 players (row ${row}, column ${column})`);
  }
  if(key==='ragnaros'&&spiralField(room.anchors.boss).points.some(p=>!roomPointInside(room.boundary,p,1)))fail('floor must contain the entire lava spiral with clearance');
  if(key==='onyxia'&&(!Array.isArray(room.breathLanes)||room.breathLanes.length!==3||room.breathLanes.some(y=>!Number.isFinite(y))))fail('three finite breath lanes are required');
  room.minX=Math.min(...room.boundary.map(p=>p.x));room.maxX=Math.max(...room.boundary.map(p=>p.x));
  room.minY=Math.min(...room.boundary.map(p=>p.y));room.maxY=Math.max(...room.boundary.map(p=>p.y));
  room.geometryHash=createHash('sha256').update(JSON.stringify(room)).digest('hex');
 }
 return rooms;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const rooms=compileBossRooms(JSON.parse(await readFile(source,'utf8')));
 const output=JSON.stringify(rooms,null,2)+'\n';
 if(process.argv.includes('--check')){if(await readFile(destination,'utf8')!==output)throw new Error('Boss room data needs compilation');}
 else await writeFile(destination,output);
 console.log(`Boss rooms ${process.argv.includes('--check')?'checked':'compiled'}: ${Object.keys(rooms).length}`);
}
