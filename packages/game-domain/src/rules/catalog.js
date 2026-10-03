import {runtime} from './runtime-content.js';
import {groupRows} from '../../../sim-core/src/collections.js';
import {worldDungeons} from '../../../game-data/world-content.js';
/** @type {Record<string,any>} */
export const creatures=runtime.creatures;
/** @type {Record<string,any>} */
export const items=runtime.items;
/** @type {Record<string,any>} */
export const spells=runtime.spells;
/** @type {{id:number; name:string; races:number[]; [key:string]:any}[]} */
export const classDefinitions=runtime.classDefinitions;
/** @type {{id:number; name:string; classes:number[]; [key:string]:any}[]} */
export const raceDefinitions=runtime.raceDefinitions;
/** @type {Record<string, any[]>} */
export const classAbilities=runtime.classAbilities;
/** @type {{entries:any[]; [key:string]:any}} */
export const classContentManifest=runtime.classContentManifest;
/** @type {Record<string,any>} */
export const classEnchantments=runtime.classEnchantments;
/** @type {Record<string,any>} */
export const preciseSpellFamilyFlags=runtime.preciseSpellFamilyFlags;
/** @type {any[]} */
export const classItemInventory=runtime.classItemInventory;
/** @type {Record<string,any>} */
export const classLocks=runtime.classLocks;
/** @type {Record<string, any[]>} */
export const classStartingItems=runtime.classStartingItems;
/** @type {Record<string,any>} */
export const lookup=runtime.lookup;
/** @type {Record<string,any>} */
export const itemSets=runtime.itemSets;
/** @type {Record<string,any>} */
export const raidItemAssets=runtime.raidItemAssets;
/** @type {Record<string,any>} */
export const quests=runtime.quests;
/** @type {Record<string,any>} */
export const questLinks=runtime.questLinks;
/** @type {Record<string,any>} */
export const xpTable=runtime.xpTable;
/** @type {Record<string,any>} */
export const questXp=runtime.questXp;
/** @type {{id:any; classId:number; name:string; talents:any[]; [key:string]:any}[]} */
export const classTalentTrees=runtime.classTalentTrees;
/** @type {{id:any; classId:number; name:string; talents:any[]; [key:string]:any}[]} */
export const talentTrees=runtime.talentTrees;
/** @type {Record<string,any>} */
export const talents=runtime.talents;
/** @type {Record<string,any>} */
export const spellChain=runtime.spellChain;
/** @type {Record<string,any>} */
export const creatureLoot=runtime.creatureLoot;
/** @type {Record<string,any>} */
export const referenceLoot=runtime.referenceLoot;
/** @type {Record<string,any>} */
export const objectLoot=runtime.objectLoot;
/** @type {Record<string,any>} */
export const objectTemplates=runtime.objectTemplates;
/** @type {Set<number>} */
export const questItemIds=new Set(runtime.questItemIds);
/** @type {Record<string,any>} */
export const nodes=runtime.nodes;
/** @type {any[]} */
export const edges=runtime.edges;
/** @type {number} */
export const travelSpeedMultiplier=runtime.travelSpeedMultiplier;
/** @type {number} */
export const baseTravelSpeed=runtime.baseTravelSpeed;
/** @type {Record<string,any>} */
export const creatureLocations=runtime.creatureLocations;
/** @type {Record<string,any>} */
export const objectLocations=runtime.objectLocations;
/** @type {Record<string,any>} */
export const objectSpawnsByNode=runtime.objectSpawnsByNode;
/** @type {Record<string,any>} */
export const outdoorCreatureLocations=runtime.outdoorCreatureLocations;
/** @type {any[]} */
export const trainerNodes=runtime.trainerNodes;
/** @type {any[]} */
export const flightNodes=runtime.flightNodes;
/** @type {any[]} */
export const flights=runtime.flights;
/** @type {(name:string)=>Record<string,any>[]} */
export const table=name=>runtime.tables[name]||[];
/** @type {any} */
export const localize=(kind,id)=>runtime.text[kind]?.[id]?.localized;
/** @type {any} */
export const nameOf=(kind,id)=>runtime.text[kind]?.[id]?.name||(kind==='items'?'物品 '+id:String(id));
/** @type {(kind:string,id:any)=>string|null} */
export const icon=(kind,id)=>runtime.text[kind]?.[id]?.icon??null;
/** @type {(rows:any[],key:string)=>Record<string,any[]>} */
export const groupBy=(rows,key)=>groupRows(rows,r=>r[key]);
/** @type {(node:string)=>number[]} */
export const monsterIdsAt=node=>[...(runtime.monstersByNode[node]||[])].filter(id=>![6109,12397].includes(id));
export function endpointNodes(endpoint){if(endpoint.type==='item')return [];return(endpoint.type==='creature'?creatureLocations:objectLocations)[endpoint.id]||[];}
const world={dungeons:runtime.dungeonEntrances};
const positionedNodes=Object.values(nodes).filter(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&n.kind!=='dungeon');
export function nearestNode(x,y,map=0){
 if(map===36)return 'deadmines';if(map===34)return 'stockades';
 if(map===249)return 'onyxias-lair';if(map===409)return 'molten-core';
 const instances=worldDungeons.filter(d=>d.map===map);
 if(instances.length){
  const positioned=instances.filter(d=>world.dungeons[d.id]?.reference?.entrance);
  if(!positioned.length)return instances[0].id;
  return positioned.reduce((best,d)=>{const p=world.dungeons[d.id].reference.entrance,b=world.dungeons[best.id].reference.entrance;return Math.hypot(x-p.position_x,y-p.position_y)<Math.hypot(x-b.position_x,y-b.position_y)?d:best;}).id;
 }
 const pool=positionedNodes.filter(n=>n.map===map);
 if(!pool.length)return null;
 return pool.reduce((best,n)=>Math.hypot(x-n.x,y-n.y)<Math.hypot(x-best.x,y-best.y)?n:best).id;
}
/** @type {(id:any)=>boolean} */
export const attackableCreature=id=>{const c=creatures[id];return !!(c&&c.MinLevel>0&&c.MinLevel<=63&&c.ModelId1>0&&![11686,13069,15294].includes(c.ModelId1)&&!c.NpcFlags&&!(c.UnitFlags&0x10102)&&![8,12].includes(c.CreatureType)&&!c.Civilian&&!/Trigger|Doodad|Counter|Marker/i.test(c.Name)&&![1,35,12,11,55,80,84,1078].includes(c.Faction));};
const routeCache=new Map();
const ridingRouteCache=new Map();
const adjacent=groupRows(edges.flatMap(e=>[{node:e.a,edge:e},{node:e.b,edge:e}]),e=>e.node);
export function route(from,to,speed=baseTravelSpeed,walkingSpeed=baseTravelSpeed){
 if(!nodes[from]||!nodes[to])throw new Error('未知目的地');
 if(speed>baseTravelSpeed)return ridingRoute(from,to,speed,walkingSpeed);
 const key=from+':'+speed;
 if(routeCache.has(key)){const result=routeCache.get(key)[to];if(!result)throw new Error('目前没有连通的路线');return structuredClone(result);}
 const distance={[from]:0},paths={[from]:[]},remaining=new Set(Object.keys(nodes));
 while(remaining.size){const current=[...remaining].sort((a,b)=>(distance[a]??Infinity)-(distance[b]??Infinity))[0];if(distance[current]===undefined)break;remaining.delete(current);
  for(const {edge:e} of adjacent[current]||[]){const next=e.a===current?e.b:e.a;const value=distance[current]+(e.duration??e.distance/speed*1000);if(value<(distance[next]??Infinity)){distance[next]=value;paths[next]=[...paths[current],e];}}}
 const results=Object.fromEntries(Object.entries(paths).map(([id,path])=>[id,{duration:Math.ceil(distance[id]),path,distance:path.reduce((n,e)=>n+e.distance,0)}]));
 if(routeCache.size>=64)routeCache.delete(routeCache.keys().next().value);routeCache.set(key,results);
 if(!results[to])throw new Error('目前没有连通的路线');return structuredClone(results[to]);
}

// Dijkstra over (location, still riding). A forbidden segment dismounts the
// traveler for the remainder of the trip; we never grant an instant remount.
function ridingRoute(from,to,speed,walkingSpeed=baseTravelSpeed){
 const cacheKey=JSON.stringify([from,speed,walkingSpeed]);
 if(ridingRouteCache.has(cacheKey)){
  const result=ridingRouteCache.get(cacheKey)[to];
  if(!result)throw new Error('目前没有连通的路线');
  return structuredClone(result);
 }
 const key=(node,riding)=>node+':'+Number(riding),initial={node:from,riding:nodes[from].mountAllowed!==false,cost:0,path:[]};
 const pending=[initial],best=new Map([[key(from,initial.riding),0]]),results={};
 while(pending.length){
  pending.sort((a,b)=>a.cost-b.cost);const current=pending.shift();
  if(current.cost!==best.get(key(current.node,current.riding)))continue;
  // Settle every destination once for the map and quest estimates. Continue
  // exploring both riding states: dismounting can change the best onward route.
  if(!results[current.node])results[current.node]={duration:Math.ceil(current.cost),path:current.path,distance:current.path.reduce((sum,e)=>sum+e.distance,0)};
  for(const {edge:e} of adjacent[current.node]||[]){
   const next=e.a===current.node?e.b:e.a;
   const riding=current.riding&&e.duration===undefined&&e.mountAllowed!==false&&nodes[next].mountAllowed!==false;
   const duration=e.duration??e.distance/(riding?speed:walkingSpeed)*1000,cost=current.cost+duration,k=key(next,riding);
   if(cost<(best.get(k)??Infinity)){best.set(k,cost);pending.push({node:next,riding,cost,path:[...current.path,{...e,duration,riding}]});}
  }
 }
 if(ridingRouteCache.size>=64)ridingRouteCache.delete(ridingRouteCache.keys().next().value);
 ridingRouteCache.set(cacheKey,results);
 if(!results[to])throw new Error('目前没有连通的路线');
 return structuredClone(results[to]);
}
