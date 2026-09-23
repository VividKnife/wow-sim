// The renderer runs in its own iframe. Messages contain only equipment IDs,
// viewer slots and a revision; the asset relay never forwards credentials.
import {worldCamera} from './world-camera.js';
const ROOT='/api/model-viewer/';
// Narrow scope: only viewer iframe requests are intercepted, never game saves.
const assetCacheReady=(async()=>{
 if(!('serviceWorker' in navigator))return;
 try{
  await navigator.serviceWorker.register('/model-viewer/asset-cache-sw.js',{scope:'/model-viewer/',type:'module'});
  if(navigator.serviceWorker.controller)return;
  await new Promise(resolve=>{
   const done=()=>{clearTimeout(timeout);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve();};
   const timeout=setTimeout(done,2500);
   navigator.serviceWorker.addEventListener('controllerchange',done);
   if(navigator.serviceWorker.controller)done();
  });
 }catch{/* HTTP cache remains available when persistent storage is disabled. */}
})();
const host=document.getElementById('viewer'),controls=document.getElementById('controls');
host.dataset.cacheHits='0';
function recordCacheHit(headers){if(headers.get('X-Model-Expires'))host.dataset.cacheHits=String(Number(host.dataset.cacheHits)+1);}
let viewer=null,generation=0,currentRevision=null,loadController=null,zoom=-2;
let dependencies;
let presentation='portrait',motion={animation:'Stand',paused:false};
let modelReady=false;
function frameWorld(){
 if(!viewer||presentation==='portrait')return;
 const bounds=viewer.method('getBounds');
 if(!bounds?.[0]||!bounds?.[1])return;
 const camera=worldCamera(bounds,host.clientWidth/host.clientHeight),renderer=viewer.renderer;
 renderer.doUpdateBounds=false;
 renderer.azimuth=camera.azimuth;renderer.zenith=camera.zenith;renderer.distance=camera.distance;
 for(let axis=0;axis<3;axis++){renderer.target[axis]=camera.center[axis];renderer.translationFromModel[axis]=0;renderer.translation[axis]=0;}
 viewer.setZoom(0);
}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function applyMotion(){
 if(!viewer)return;
 viewer.method('setAnimation',[motion.animation,true]);
 viewer.method('setAnimPaused',[motion.paused||reducedMotion.matches]);
}
reducedMotion.addEventListener('change',applyMotion);
// This dedicated iframe contains only viewer requests. Track both transports:
// current M2/skin loads use fetch, while metadata/textures still use XHR.
let pendingAssets=0,assetFailed=false;
const nativeFetch=window.fetch.bind(window);
window.fetch=async(...args)=>{
 const token=generation;
 ++pendingAssets;
 try{
  const response=await nativeFetch(...args);
  recordCacheHit(response.headers);
  const bytes=await response.arrayBuffer();
  if(!response.ok&&token===generation)assetFailed=true;
  return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
 }catch(error){if(token===generation)assetFailed=true;throw error;}finally{if(token===generation)--pendingAssets;}
};
const nativeSend=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send=function(...args){
 const token=generation;
 ++pendingAssets;
 this.addEventListener('loadend',()=>{if(token!==generation)return;recordCacheHit({get:name=>this.getResponseHeader(name)});--pendingAssets;if(this.status<200||this.status>=300)assetFailed=true;},{once:true});
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
 await assetCacheReady;
 await script('https://code.jquery.com/jquery-3.7.1.min.js');
 window.jQuery(document).ajaxError((_event,_xhr,settings)=>console.warn('Model request failed',settings.url));
 window.WH={debug:()=>{},WebP:{getImageExtension:()=>'.webp'}};
 await script(ROOT+'deployment/viewer/c3f890f/viewer.min.js');
 if(!window.ZamModelViewer)throw new Error('Renderer unavailable');
})();}
function dispose(){
 modelReady=false;
 if(viewer){const context=viewer.renderer?.context;viewer.destroy();context?.getExtension('WEBGL_lose_context')?.loseContext();viewer=null;}
 host.replaceChildren();controls.hidden=true;
}
async function render(items,revision,raceId,classId,gender,view,mountDisplayId){
 const token=++generation;currentRevision=revision;loadController?.abort();loadController=new AbortController();
 host.dataset.renderCount=String(token);
 const signal=loadController.signal;dispose();pendingAssets=0;assetFailed=false;presentation=view;notify('loading');
 try{
  await assetCacheReady;
  if(token!==generation)return;
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
  viewer=new window.ZamModelViewer({type:2,container:window.jQuery(host),aspect:host.clientWidth/host.clientHeight,contentPath:ROOT,models:{id:raceId*2-(gender==='male'?1:0),type:16},mount:mountDisplayId?{id:mountDisplayId}:undefined,items:items.filter(i=>displays.has(i.id)).map(i=>[i.slot,displays.get(i.id)]),dataEnv:'classic',env:'classic',gameDataEnv:'classic',hd:false,cls:classId,transparent:true});
  if(!viewer.renderer?.context)throw new Error('WebGL unavailable');
  let customized=false,quietSince=0;
  viewer.method('setCustomizationsLoadedCallback',[()=>{customized=true;}]);
  applyMotion();
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
  modelReady=true;zoom=-2;viewer.setZoom(zoom);frameWorld();
  controls.hidden=presentation!=='portrait';applyMotion();notify(missing?'partial':'loaded');
 }catch(error){
  if(token!==generation)return;
  dispose();notify('error');console.warn('Character model could not load:',error.message);
 }
}
window.addEventListener('message',event=>{
 if(event.source!==parent||event.origin!==location.origin)return;
 const message=event.data;
 if(message?.channel==='wow-character-motion'){
  if(!['Stand','Run','Fly','Death'].includes(message.animation)||typeof message.paused!=='boolean')return;
  motion={animation:message.animation,paused:message.paused};applyMotion();return;
 }
 if(message?.channel!=='wow-character-equipment'||typeof message.revision!=='string'||message.revision.length>2000||!Array.isArray(message.items)||message.items.length>19)return;
 if(!Number.isInteger(message.raceId)||message.raceId<1||message.raceId>8||![1,2,3,4,5,7,8,9,11].includes(message.classId)||!['male','female'].includes(message.gender))return;
 if(!message.items.every(i=>Number.isSafeInteger(i.id)&&i.id>0&&i.id<10000000&&[1,3,4,5,6,7,8,9,10,16,19,20,21,22,26].includes(i.slot)))return;
 if(message.view!==undefined&&!['portrait','world','flight'].includes(message.view))return;
 if(message.mountDisplayId!==undefined&&(!Number.isInteger(message.mountDisplayId)||message.mountDisplayId<0||message.mountDisplayId>999999))return;
 if(message.revision===currentRevision)return;
 void render(message.items,message.revision,message.raceId,message.classId,message.gender,message.view||'portrait',message.mountDisplayId||0);
});
new ResizeObserver(()=>{if(viewer&&host.clientWidth&&host.clientHeight){viewer.aspect=host.clientWidth/host.clientHeight;viewer.renderer.onResize(host.clientWidth,host.clientHeight,viewer.aspect);if(modelReady)frameWorld();}}).observe(host);
document.getElementById('zoom-in').onclick=()=>{if(viewer)viewer.setZoom(zoom=Math.min(7,zoom+1));};
document.getElementById('zoom-out').onclick=()=>{if(viewer)viewer.setZoom(zoom=Math.max(-10,zoom-1));};
document.getElementById('reset').onclick=()=>{if(viewer){viewer.renderer.azimuth=0;viewer.renderer.zenith=Math.PI/2;viewer.setZoom(zoom=-2);}};
window.addEventListener('pagehide',()=>{++generation;loadController?.abort();dispose();});
notify('ready',null);
