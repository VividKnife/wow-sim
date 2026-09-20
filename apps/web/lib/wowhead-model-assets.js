// Fixed upstreams only. Never forward cookies, authorization or an arbitrary URL.
const ROOT='https://wow.zamimg.com/modelviewer/classic/';
const assetPattern=/^(?:deployment\/viewer\/c3f890f\/viewer\.min\.js|meta\/(?:character|charactercustomization|item|itemvisual)\/[1-9]\d{0,8}\.json|meta\/armor\/(?:1|3|4|5|6|7|8|9|10|16|19|20)\/[1-9]\d{0,8}\.json|(?:m2\/[1-9]\d{0,9}\.m2|skin\/[1-9]\d{0,9}\.skin|skel\/[1-9]\d{0,9}\.skel|anim\/[1-9]\d{0,9}\.anim|bone\/[1-9]\d{0,9}\.bone)|textures\/[1-9]\d{0,9}\.(?:webp|png))$/;
// Version used by the official Classic Dressing Room on 2026-09-16.
export const assetUrl=path=>assetPattern.test(path)?ROOT+path:null;
export function parseItemIds(value){
 if(typeof value!=='string'||!/^\d+(?:,\d+){0,18}$/.test(value))throw new Error('Invalid item list');
 const ids=[...new Set(value.split(',').map(Number))];
 if(ids.some(id=>!Number.isSafeInteger(id)||id<=0||id>9999999))throw new Error('Invalid item ID');
 return ids;
}
export function parseAppearance(xml,id){
 const item=xml.match(/<item\s+id="(\d+)"/),display=xml.match(/<icon\s+displayId="(\d+)"/);
 if(Number(item?.[1])!==id||!display||Number(display[1])<=0)throw new Error('Item appearance unavailable');
 return {id,displayId:Number(display[1])};
}
const appearances=new Map();
const inFlight=new Map();
async function fetchAsset(url,timeout){
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(timeout),redirect:'manual'});
   if(attempt===0&&[502,503,504].includes(response.status)){await response.body?.cancel();continue;}
   return response;
  }catch(error){if(attempt===1)throw error;}
 }
}
async function appearance(id){
 const cached=appearances.get(id);
 if(cached&&cached.until>Date.now())return cached.value;
 if(inFlight.has(id))return inFlight.get(id);
 const pending=(async()=>{
  const response=await fetchAsset(`https://www.wowhead.com/classic/item=${id}&xml`,12000);
  if(!response.ok)throw new Error('Appearance request failed');
  const value=parseAppearance(await response.text(),id);
  if(appearances.size>=512)appearances.delete(appearances.keys().next().value);
  appearances.set(id,{value,until:Date.now()+86400000});return value;
 })();
 inFlight.set(id,pending);
 try{return await pending;}finally{inFlight.delete(id);}
}
export async function handleModelRequest(request){
 const url=new URL(request.url),path=url.pathname.slice('/api/model-viewer/'.length);
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
 if(path==='appearance'){
  let ids;try{ids=parseItemIds(url.searchParams.get('items'));}catch{return new Response('Invalid item list',{status:400});}
  // Limit concurrent upstream XML requests per batch; failures remain explicit.
  const results=[];
  for(let offset=0;offset<ids.length;offset+=4)results.push(...await Promise.all(ids.slice(offset,offset+4).map(async id=>{try{return await appearance(id);}catch(error){console.warn('Wowhead appearance request failed',id,error.message);return {id,unavailable:true};}})));
  return Response.json({items:results},{headers:{'Cache-Control':results.some(r=>r.unavailable)?'no-store':'public, max-age=86400'}});
 }
 const upstream=assetUrl(path);
 if(!upstream||url.search)return new Response('Unknown model asset',{status:404});
 try{
  const response=await fetchAsset(upstream,20000);
  if(!response.ok)return new Response('Model asset unavailable',{status:response.status===404?404:502,headers:{'Cache-Control':'no-store'}});
  const type=path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.json')?'application/json':path.endsWith('.webp')?'image/webp':path.endsWith('.png')?'image/png':'application/octet-stream';
  return new Response(response.body,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=86400, stale-while-revalidate=604800','X-Content-Type-Options':'nosniff'}});
 }catch(error){console.warn('Wowhead asset request failed',path,error.message);return new Response('Model service unavailable',{status:502,headers:{'Cache-Control':'no-store'}});}
}
