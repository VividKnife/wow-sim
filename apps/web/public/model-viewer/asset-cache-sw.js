import {CACHE_NAME,cacheableRequest,createAssetCache} from './asset-cache.js';
const assets=createAssetCache(self.caches);
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await self.caches.keys())if(name.startsWith('wow-model-assets-')&&name!==CACHE_NAME)await self.caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 if(!cacheableRequest(event.request,self.location.origin))return;
 const pending=(async()=>{
  const cached=await assets.match(event.request);
  if(cached)return {response:cached};
  const response=await fetch(event.request);
  return {response,write:assets.put(event.request,response)};
 })();
 event.respondWith(pending.then(result=>result.response));
 event.waitUntil(pending.then(result=>result.write).catch(()=>{}));
});
