// Display data only: never import the simulation engine or its catalogs here.
// HTTP handles persistent versioned caching; this bounded memory cache coalesces
// concurrent readers and forgets failed requests so retry remains possible.
export function createContentLoader(fetchImpl=(...args)=>fetch(...args)) {
 const requests=new Map(),versions=new Map();
 function state(version){
  if(!versions.has(version))versions.set(version,{items:{},known:new Set(),pending:new Map()});
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
   const response=await fetchImpl(`/api/game/content?${key}`,{signal:AbortSignal.timeout(15000)});
   const data=await response.json();
   if(!response.ok)throw new Error(data?.error||'游戏内容暂时无法加载，请重试。');
   if(data?.contentVersion!==version||data?.pack!==name)throw new Error('游戏内容已更新，请刷新页面。');
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
    Object.assign(cache.items,data.items);for(const id of batch)cache.known.add(id);
   }).finally(()=>{for(const id of batch)cache.pending.delete(id);});
   for(const id of batch)cache.pending.set(id,pending);
  }
  await Promise.all([...new Set(needed.map(id=>cache.pending.get(id)).filter(Boolean))]);
  return {...cache.items};
 }
 return {pack,ensureItems};
}

// Display records use id for inventory/rewards/materials and item for outputs.
// Other domains may share these field names: missing IDs are negatively cached,
// and harmless extra item matches are preferable to missing a new UI reference.
export function referencedItemIds(value){
 const ids=new Set();
 function walk(value,key=''){
  if(Number.isSafeInteger(value)&&value>0&&['id','item','itemId','healthItem','manaItem'].includes(key))ids.add(value);
  else if(Array.isArray(value))for(const entry of value)walk(entry,key);
  else if(value&&typeof value==='object')for(const [field,entry] of Object.entries(value))walk(entry,field);
 }
 walk(value);return [...ids];
}
export const contentLoader=createContentLoader();
export async function loadContent(version,snapshot){
 const [core,items]=await Promise.all([contentLoader.pack(version),contentLoader.ensureItems(version,referencedItemIds(snapshot))]);
 return {...core,items};
}
