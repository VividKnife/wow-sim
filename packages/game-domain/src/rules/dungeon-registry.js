import {runtime} from './runtime-content.js';
/** @type {Record<string,any>} */
export const dungeonDefinitions=Object.freeze(runtime.dungeonDefinitions);
export function dungeonDefinition(id){
 if(typeof id!=='string'||!Object.hasOwn(dungeonDefinitions,id))throw new Error('未知或尚未开放的副本。');
 return dungeonDefinitions[id];
}
export function dungeonIdFor(s){return s.dungeon?.id||Object.values(dungeonDefinitions).find(d=>d.entrance===s.location)?.id||'deadmines';}
export function dungeonRoute(id){return dungeonDefinition(typeof id==='string'?id:dungeonIdFor(id)).reference.encounters;}
