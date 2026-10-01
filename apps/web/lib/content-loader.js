import {fetchContentJson} from '../../../packages/sim-core/src/content-request.js';
import {auctionContentError} from './auction-content.js';
// Display data only: never import the simulation engine or its catalogs here.
// HTTP handles persistent versioned caching; this bounded memory cache coalesces
// concurrent readers and forgets failed requests so retry remains possible.
export function createContentLoader(fetchImpl=(...args)=>fetch(...args)) {
 const requests=new Map(),versions=new Map();
 function state(version){
  if(!versions.has(version))versions.set(version,{items:Object.freeze({}),known:new Set(),pending:new Map()});
  const value=versions.get(version);
  versions.delete(version);versions.set(version,value);
  while(versions.size>2)versions.delete(versions.keys().next().value);
  return value;
 }
 async function pack(version,name='core',ids) {
  const params=new URLSearchParams({version,pack:name});
  if(ids)params.set('ids',ids.join(','));
  const key=params.toString();
  if(requests.has(key))return requests.get(key);
  const pending=(async()=>{
   const data=await fetchContentJson(`/api/game/content?${key}`,{fetchImpl,timeoutMs:15000});
   if(data?.contentVersion!==version||data?.pack!==name)throw new Error('游戏内容已更新，请刷新页面。');
   if(name==='market'){
    const error=auctionContentError(data);
    if(error)throw new Error(error);
   }
   if(name==='items'&&(!data.items||!Array.isArray(data.missing)||ids.some(id=>!Object.hasOwn(data.items,id)&&!data.missing.includes(id))))throw new Error('物品资料不完整，请重试。');
   return data;
  })();
  requests.set(key,pending);
  try{return await pending;}catch(error){requests.delete(key);throw error;}
  finally{while(requests.size>64)requests.delete(requests.keys().next().value);}
 }
 async function ensureItems(version,ids) {
  const cache=state(version),needed=[...new Set(ids)].filter(id=>Number.isSafeInteger(id)&&id>0&&!cache.known.has(id));
  const fresh=needed.filter(id=>!cache.pending.has(id));
  for(let at=0;at<fresh.length;at+=200){
   const batch=fresh.slice(at,at+200).sort((a,b)=>a-b);
   const pending=pack(version,'items',batch).then(data=>{
    cache.items=Object.freeze({...cache.items,...data.items});for(const id of batch)cache.known.add(id);
   }).finally(()=>{for(const id of batch)cache.pending.delete(id);});
   for(const id of batch)cache.pending.set(id,pending);
  }
  await Promise.all([...new Set(needed.map(id=>cache.pending.get(id)).filter(Boolean))]);
  return cache.items;
 }
 return {pack,ensureItems};
}

// Numeric IDs in logs, quests, spells and creatures are not item references.
// Only inventory/display item collections give the generic `id` field meaning.
const itemCollections=new Set(['equipment','bag','bags','bank','pending','rewards','choices','materials','tools','shop','loot','market','disenchantable','reagents','drops']);
const itemFields=new Set(['item','itemId','healthItem','manaItem']);
// Stream snapshots use copy-on-write patches. Unchanged branches can reuse their
// item references; weak keys let retired snapshots and their caches be collected.
// Collection context matters: the same object can be both a quest and a reward.
export function createItemReferenceReader(){
 const caches=[new WeakMap(),new WeakMap()];
 function read(value,itemCollection=false){
  if(!value||typeof value!=='object')return [];
  const cache=caches[Number(itemCollection)],cached=cache.get(value);
  if(cached)return cached;
  const ids=new Set(),add=id=>{if(Number.isSafeInteger(id)&&id>0)ids.add(id);};
  if(Array.isArray(value)){for(const entry of value)for(const id of read(entry,itemCollection))add(id);}
  else{
   if(itemCollection||typeof value.uid==='string')add(value.id);
   const container=itemCollection&&!Object.hasOwn(value,'id');
   for(const [field,entry] of Object.entries(value)){
    if(itemFields.has(field))add(entry);
    for(const id of read(entry,itemFields.has(field)||itemCollections.has(field)||container))add(id);
   }
  }
  const result=[...ids];cache.set(value,result);return result;
 }
 return value=>read(value);
}
// One-off callers may pass mutable data; only stream readers retain a cache.
export function referencedItemIds(value){return createItemReferenceReader()(value);}
const streamItemIds=createItemReferenceReader();
let lastCore,lastItems,lastContent;
export const contentLoader=createContentLoader();
export async function loadContent(version,snapshot){
 const [core,items]=await Promise.all([contentLoader.pack(version),contentLoader.ensureItems(version,streamItemIds(snapshot))]);
 if(core!==lastCore||items!==lastItems){lastCore=core;lastItems=items;lastContent={...core,items};}
 return lastContent;
}
