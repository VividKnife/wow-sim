// Compiled content is immutable input. Containers expose ordinary enumerable
// properties, so snapshots/structuredClone never contain Proxy objects.
export function openPackedContent(bundle, {cacheBudget = 8 * 1024 * 1024, onRead = id => {}, missing = id => {throw new Error(`Missing compiled content record ${id}`);}} = {}) {
 const hot = new Map(), live = new Map();
 const finalizer=new FinalizationRegistry(id=>{if(!live.get(id)?.deref())live.delete(id);});
 let retained = 0, decoded = 0;
 const value = encoded => Array.isArray(encoded) ? encoded[0] === -1 ? undefined : read(encoded[0]) : encoded;
 function read(id) {
  globalThis.__contentNodeRead?.(id);
  onRead(id);
  const existing = live.get(id)?.deref();
  if (existing) return existing;
  const stored = bundle.nodes[id];
  if (stored===undefined) return missing(id);
  const row = typeof stored==='string'?JSON.parse(stored):stored;
  const array = row[0] === -1, schema = array ? null : bundle.schemas[row[0]];
  const target = array ? new Array(row.length - 1) : {};
  const entries = array ? row.slice(1) : schema[1].slice();
  if (!array) for (let i=1;i<row.length;i+=2) entries[row[i]]=row[i+1];
  for (let i=0;i<entries.length;i++) {
   const key = array ? String(i) : schema[0][i], encoded = entries[i];
   if (Array.isArray(encoded) && encoded[0] !== -1) Object.defineProperty(target,key,{enumerable:true,configurable:true,
    get:()=>value(encoded),set:next=>Object.defineProperty(target,key,{value:next,writable:true,enumerable:true,configurable:true})});
   else Object.defineProperty(target,key,{value:value(encoded),enumerable:true,writable:true,configurable:true});
  }
  decoded++;
  live.set(id,new WeakRef(target));
  finalizer.register(target,id);
  const weight=64+entries.length*48;
  hot.set(id,{target,weight});retained+=weight;
  while (retained>cacheBudget && hot.size>1) {const key=hot.keys().next().value;retained-=hot.get(key).weight;hot.delete(key);}
  return target;
 }
 return {root:read(bundle.root), stats:()=>({decoded,retainedEstimate:retained,cached:hot.size}),
  clear:()=>{hot.clear();retained=0;}};
}
