// The renderer runs in its own iframe. Messages contain only equipment IDs,
// viewer slots and a revision; the asset relay never forwards credentials.
const ROOT='/api/model-viewer/';
const host=document.getElementById('viewer'),controls=document.getElementById('controls');
let viewer=null,generation=0,currentRevision=null,loadController=null,zoom=-2;
let dependencies;
// This dedicated iframe contains only viewer requests. Track both transports:
// current M2/skin loads use fetch, while metadata/textures still use XHR.
let pendingAssets=0,assetFailed=false;
const nativeFetch=window.fetch.bind(window);
window.fetch=async(...args)=>{
 ++pendingAssets;
 try{
  const response=await nativeFetch(...args);
  const bytes=await response.arrayBuffer();
  if(!response.ok)assetFailed=true;
  return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
 }catch(error){assetFailed=true;throw error;}finally{--pendingAssets;}
};
const nativeSend=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send=function(...args){
 ++pendingAssets;
 this.addEventListener('loadend',()=>{--pendingAssets;if(this.status<200||this.status>=300)assetFailed=true;},{once:true});
 return nativeSend.apply(this,args);
};
const notify=(status,revision=currentRevision)=>parent.postMessage({channel:'wow-character-model',status,revision},location.origin);
function script(src){return new Promise((resolve,reject)=>{
 const tag=document.createElement('script');tag.src=src;if(src.startsWith('https://code.jquery.com/')){tag.integrity='sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=';tag.crossOrigin='anonymous';}
 const timeout=setTimeout(()=>{tag.remove();reject(new Error('Script timed out'));},15000);
 tag.onload=()=>{clearTimeout(timeout);resolve();};tag.onerror=()=>{clearTimeout(timeout);tag.remove();reject(new Error('Script unavailable'));};
 document.head.append(tag);
});}
function loadDependencies(){return dependencies??=(async()=>{
 await script('https://code.jquery.com/jquery-3.7.1.min.js');
 window.jQuery(document).ajaxError((_event,_xhr,settings)=>console.warn('Model request failed',settings.url));
 window.WH={debug:()=>{},WebP:{getImageExtension:()=>'.webp'}};
 await script(ROOT+'deployment/viewer/c3f890f/viewer.min.js');
 if(!window.ZamModelViewer)throw new Error('Renderer unavailable');
})();}
function dispose(){
 if(viewer){const context=viewer.renderer?.context;viewer.destroy();context?.getExtension('WEBGL_lose_context')?.loseContext();viewer=null;}
 host.replaceChildren();controls.hidden=true;
}
async function render(items,revision,raceId,classId,gender){
 const token=++generation;currentRevision=revision;loadController?.abort();loadController=new AbortController();
 const signal=loadController.signal;dispose();notify('loading');
 try{
  const ids=[...new Set(items.map(item=>item.id))];
  const [appearance]=await Promise.all([
   ids.length?fetch(ROOT+'appearance?items='+ids.join(','),{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])}).then(response=>{if(!response.ok)throw new Error('Appearance unavailable');return response.json();}):Promise.resolve({items:[]}),
   loadDependencies(),
  ]);
  if(token!==generation)return;
  const displays=new Map(appearance.items.filter(i=>i.displayId>0).map(i=>[i.id,i.displayId]));
  const missing=items.some(i=>!displays.has(i.id));
  // Each outfit is initialized from a complete snapshot. This avoids stale
  // asynchronous attachments and upstream clearSlots differences across builds.
  viewer=new window.ZamModelViewer({type:2,container:window.jQuery(host),aspect:host.clientWidth/host.clientHeight,contentPath:ROOT,models:{id:raceId*2-(gender==='male'?1:0),type:16},items:items.filter(i=>displays.has(i.id)).map(i=>[i.slot,displays.get(i.id)]),dataEnv:'classic',env:'classic',gameDataEnv:'classic',hd:false,cls:classId,transparent:true});
  if(!viewer.renderer?.context)throw new Error('WebGL unavailable');
  let customized=false,quietSince=0;
  viewer.method('setCustomizationsLoadedCallback',[()=>{customized=true;}]);
  viewer.method('setAnimation',['Stand']);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)viewer.method('setAnimPaused',[true]);
  const deadline=Date.now()+45000;
  await new Promise((resolve,reject)=>{
   const tick=()=>{
    if(token!==generation)return reject(new Error('Superseded'));
    if(assetFailed)return reject(new Error('Model asset unavailable'));
    if(Date.now()>deadline)return reject(new Error('Model timed out'));
    const ready=!pendingAssets&&customized&&viewer?.method('isLoaded')&&!window.jQuery.active&&!Object.keys(viewer?.renderer?.downloads||{}).length;
    if(ready){quietSince||=Date.now();if(Date.now()-quietSince>700)return resolve();}else quietSince=0;
    setTimeout(tick,100);
   };tick();
  });
  if(token!==generation)return;
  zoom=-2;viewer.setZoom(zoom);controls.hidden=false;notify(missing?'partial':'loaded');
 }catch(error){
  if(token!==generation)return;
  dispose();notify('error');console.warn('Character model could not load:',error.message);
 }
}
window.addEventListener('message',event=>{
 if(event.source!==parent||event.origin!==location.origin)return;
 const message=event.data;
 if(message?.channel!=='wow-character-equipment'||typeof message.revision!=='string'||message.revision.length>2000||!Array.isArray(message.items)||message.items.length>19)return;
 if(!Number.isInteger(message.raceId)||message.raceId<1||message.raceId>8||![1,2,3,4,5,7,8,9,11].includes(message.classId)||!['male','female'].includes(message.gender))return;
 if(!message.items.every(i=>Number.isSafeInteger(i.id)&&i.id>0&&i.id<10000000&&[1,3,4,5,6,7,8,9,10,16,19,20,21,22,26].includes(i.slot)))return;
 if(message.revision===currentRevision)return;
 void render(message.items,message.revision,message.raceId,message.classId,message.gender);
});
new ResizeObserver(()=>{if(viewer&&host.clientWidth&&host.clientHeight){viewer.aspect=host.clientWidth/host.clientHeight;viewer.renderer.onResize(host.clientWidth,host.clientHeight,viewer.aspect);}}).observe(host);
document.getElementById('zoom-in').onclick=()=>{if(viewer)viewer.setZoom(zoom=Math.min(7,zoom+1));};
document.getElementById('zoom-out').onclick=()=>{if(viewer)viewer.setZoom(zoom=Math.max(-10,zoom-1));};
document.getElementById('reset').onclick=()=>{if(viewer){viewer.renderer.azimuth=0;viewer.renderer.zenith=Math.PI/2;viewer.setZoom(zoom=-2);}};
window.addEventListener('pagehide',()=>{++generation;loadController?.abort();dispose();});
notify('ready',null);
