export const CACHE_NAME='wow-model-assets-c3f890f-v1';
const PREFIX='/api/model-viewer/';
export function cacheableRequest(request,origin){
 const url=new URL(request.url);
 return request.method==='GET'&&url.origin===origin&&url.pathname.startsWith(PREFIX)&&
  (url.pathname===PREFIX+'appearance'?/^\?items=\d+(?:,\d+){0,18}$/.test(url.search):!url.search);
}
// CacheStorage does not implement HTTP expiration or size eviction for us.
// Serialize writes so simultaneous textures cannot exceed the byte budget.
export function createAssetCache(storage,{maxBytes=128*1024*1024,maxEntries=256,now=Date.now}={}){
 let writes=Promise.resolve();
 const cache=()=>storage.open(CACHE_NAME);
 return {
  async match(request){
   try{
    const response=await (await cache()).match(request);
    if(response&&Number(response.headers.get('X-Model-Expires'))>now())return response;
   }catch{/* Disabled or evicted storage falls through to the network. */}
  },
  put(request,response){
   if(!response.ok||!response.headers.get('Cache-Control')?.includes('public')||/no-store|private/.test(response.headers.get('Cache-Control')))return Promise.resolve();
   const age=Number(response.headers.get('Cache-Control').match(/max-age=(\d+)/)?.[1]);
   if(!age)return Promise.resolve();
   const copy=response.clone();
   writes=writes.then(async()=>{
    const bytes=await copy.arrayBuffer();
    if(bytes.byteLength>Math.min(maxBytes,16*1024*1024))return;
    const bucket=await cache(),entries=[];
    let total=bytes.byteLength;
    for(const key of await bucket.keys()){
     if(key.url===request.url){await bucket.delete(key);continue;}
     const stored=await bucket.match(key);
     const size=Number(stored?.headers.get('X-Model-Bytes'));
     if(!size||Number(stored.headers.get('X-Model-Expires'))<=now()){await bucket.delete(key);continue;}
     entries.push({key,size});total+=size;
    }
    while(entries.length&&(total>maxBytes||entries.length>=maxEntries)){
     const oldest=entries.shift();await bucket.delete(oldest.key);total-=oldest.size;
    }
    const headers=new Headers(response.headers);
    headers.delete('Content-Encoding');headers.delete('Content-Length');
    headers.set('X-Model-Bytes',String(bytes.byteLength));
    headers.set('X-Model-Expires',String(now()+Math.min(age,86400)*1000));
    await bucket.put(request,new Response(bytes,{status:response.status,headers}));
   }).catch(()=>{/* Quota/storage failures must never prevent rendering. */});
   return writes;
  },
 };
}
