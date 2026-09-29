import {openPackedContent} from '../../../sim-core/src/packed-content.js';
import version from '../../../game-data/runtime/version.json' with {type:'json'};

export let runtime;
let store, bundle, bootIds, initializing;
const loaded=new Map(),inflight=new Map();
const classes=new Map();
const RAW_BUDGET=32*1024*1024;
let retained=0;
let pinned=null;
export const beginContentScope=()=>{pinned??=new Set();};
function trim(){
 for(const [key,old]of loaded){if(retained<=RAW_BUDGET)break;if(pinned?.has(key))continue;for(const id of old.ids)if(!bootIds.has(id))delete bundle.nodes[id];retained-=old.weight;loaded.delete(key);}
}
export const endContentScope=()=>{pinned=null;trim();};
class ContentRequired extends Error {constructor(id){super('正在加载冒险资料');this.id=id;}}
export const isContentPending=error=>error instanceof ContentRequired;
const endpoint=name=>`/api/simulation-content/${version.version}/${name}`;
async function fetchContent(name){
 const response=await fetch(endpoint(name),{cache:'force-cache',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(response.status===409?'游戏资料已更新，请刷新页面':'冒险资料加载失败，请检查网络后重试');
 const data=await response.json();
 if(data.version!==version.version)throw new Error('游戏资料版本不一致，请刷新页面');
 return data;
}
export function initializeContent(){
 return initializing??=fetchContent('boot').then(data=>{
  bundle=data;bootIds=new Set(Object.keys(data.nodes));
  store=openPackedContent(bundle,{onRead:id=>pinned?.add(Math.floor(id/version.shardSize)),missing:id=>{throw new ContentRequired(id);}});runtime=store.root;
 });
}
// Nine finite prefetch profiles contain only records touched by ordinary views
// for that class. Unusual equipment, quests and encounters still use shards.
export async function prepareContentForState(state){
 const ids=[...new Set([state,...(state?.party||[])].map(actor=>actor?.classId).filter(id=>[1,2,3,4,5,7,8,9,11].includes(id)))];
 await Promise.all(ids.map(id=>{
  if(!classes.has(id))classes.set(id,fetchContent(`class-${id}`).then(data=>{
   for(const [key,row]of Object.entries(data.nodes)){if(!Number.isSafeInteger(+key)||+key<0||+key>=version.totalNodes||typeof row!=='string')throw new Error('职业资料无效');bundle.nodes[key]=row;bootIds.add(key);}
  }).catch(error=>{classes.delete(id);throw error;}));
  return classes.get(id);
 }));
}
export async function resolveContent(error){
 if(!isContentPending(error))throw error;
 const id=error.id;
 if(!Number.isSafeInteger(id)||id<0||id>=version.totalNodes)throw new Error('冒险资料索引无效');
 const shard=Math.floor(id/version.shardSize);
 if(inflight.has(shard))return inflight.get(shard);
 const promise=fetchContent(String(shard)).then(data=>{
  if(data.start!==shard*version.shardSize||!Array.isArray(data.nodes)||data.nodes.length!==Math.min(version.shardSize,version.totalNodes-data.start)||data.nodes.some(row=>typeof row!=='string'))throw new Error('冒险资料分片无效');
  let weight=0;const ids=[];
  data.nodes.forEach((row,index)=>{const key=String(data.start+index);if(!bootIds.has(key)){bundle.nodes[key]=row;ids.push(key);weight+=row.length*2;}});
  const previous=loaded.get(shard);if(previous)retained-=previous.weight;
  loaded.delete(shard);loaded.set(shard,{ids,weight});retained+=weight;
  trim();
 }).finally(()=>inflight.delete(shard));
 inflight.set(shard,promise);return promise;
}
export const contentStats=()=>({...store?.stats(),shards:loaded.size,rawRetainedEstimate:retained});
export const clearContentCache=()=>{store?.clear();};
