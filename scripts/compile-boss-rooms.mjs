import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {bakeRoomNavigation,roomPointInside} from '../packages/sim-core/src/room-geometry.js';
const source=new URL('../packages/game-data/source/boss-rooms.json',import.meta.url),destination=new URL('../packages/game-data/data/boss-rooms.json',import.meta.url);
const rooms=JSON.parse(await readFile(source,'utf8'));
for(const room of Object.values(rooms)){
 room.navigation=bakeRoomNavigation(room.boundary);
 for(const anchor of Object.values(room.anchors))if(!roomPointInside(room.boundary,anchor,.45))throw new Error(`Invalid anchor in ${room.id}`);
 room.minX=Math.min(...room.boundary.map(p=>p.x));room.maxX=Math.max(...room.boundary.map(p=>p.x));
 room.minY=Math.min(...room.boundary.map(p=>p.y));room.maxY=Math.max(...room.boundary.map(p=>p.y));
 room.geometryHash=createHash('sha256').update(JSON.stringify(room)).digest('hex');
}
const output=JSON.stringify(rooms,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(destination,'utf8')!==output)throw new Error('Boss room data needs compilation');}
else await writeFile(destination,output);
console.log(`Boss rooms ${process.argv.includes('--check')?'checked':'compiled'}: ${Object.keys(rooms).length}`);
