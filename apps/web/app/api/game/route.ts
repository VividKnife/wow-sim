import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {createGame,view} from '../../../lib/game/engine.js';
import {stepSession,ownsSession} from '../../../lib/game/session.js';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const db=()=> (env as any).DB;
async function read(userId:string){return db().prepare('SELECT state,revision FROM game_saves WHERE user_id=?').bind(userId).first();}
function payload(row:any,extra:any={}){const state=row?JSON.parse(row.state):null;return{state,revision:row?.revision??0,view:state?.version>=2?view(state):null,...extra};}
export async function GET(){try{const user=await getChatGPTUser();if(!user)return json({error:'请先登录以读取你的冒险存档。'},401);return json(payload(await read(user.userId)));}catch{ return json({error:'暂时无法读取存档，请稍后重试。'},503);}}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'请先登录以保存你的冒险。'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'请求来源无效'},403);
 const raw=await request.text();if(raw.length>12000)return json({error:'操作内容过长'},413);
 let body:any;try{body=JSON.parse(raw);}catch{return json({error:'无效的操作数据'},400);}
 if(!body||typeof body.type!=='string'||typeof body.requestId!=='string'||!/^[\w-]{8,100}$/.test(body.requestId)||typeof body.clientId!=='string'||!/^[\w-]{8,100}$/.test(body.clientId))return json({error:'操作或页面标识无效，请刷新页面。'},400);
 const now=Date.now();
 const fingerprint=JSON.stringify(Object.fromEntries(Object.entries(body).filter(([k])=>!['requestId','clientId'].includes(k)).sort(([a],[b])=>a.localeCompare(b))));
 try{
  if(body.type==='create'){
   const seed=crypto.getRandomValues(new Uint32Array(1))[0]||1;const state=stepSession(createGame(body.name,seed,now,{classId:body.classId,raceId:body.raceId}),{type:'sync',clientId:body.clientId},now).state;
   await db().prepare('INSERT OR IGNORE INTO game_saves(user_id,state,revision,updated_at) VALUES(?,?,0,?)').bind(user.userId,JSON.stringify(state),now).run();
   return json(payload(await read(user.userId)));
  }
  for(let attempt=0;attempt<5;attempt++){
   const row=await read(user.userId);if(!row)return json({error:'请先创建角色。'},404);
   let state=JSON.parse(row.state);
   // The earlier character-creation preview did not have gameplay progression.
   if(state.version===1){const migrated=createGame(state.name,crypto.getRandomValues(new Uint32Array(1))[0]||1,now);state=migrated;}
   if(![2,3].includes(state.version))return json({error:'存档版本暂不兼容。'},409);
   const receipt=body.type==='sync'?null:await db().prepare('SELECT fingerprint FROM game_receipts WHERE user_id=? AND request_id=?').bind(user.userId,body.requestId).first();
   if(receipt){if(receipt.fingerprint!==fingerprint)return json({error:'重试操作的内容发生变化。'},409);return json(payload(row,{replayed:true,controlled:ownsSession(state,body.clientId,now)}));}
   const result=stepSession(state,body,now);state=result.state;
   if(!result.changed)return json(payload(row,{controlled:false}));
   const revision=row.revision+1;
   let changed=false;
   if(body.type==='sync'||!result.complete){const update=await db().prepare('UPDATE game_saves SET state=?,revision=?,updated_at=? WHERE user_id=? AND revision=?').bind(JSON.stringify(state),revision,now,user.userId,row.revision).run();changed=update.meta.changes===1;}
   else{
    const batch=await db().batch([
     db().prepare('INSERT OR IGNORE INTO game_receipts(user_id,request_id,revision,fingerprint) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM game_saves WHERE user_id=? AND revision=?)').bind(user.userId,body.requestId,revision,fingerprint,user.userId,row.revision),
     db().prepare('UPDATE game_saves SET state=?,revision=?,updated_at=? WHERE user_id=? AND revision=? AND EXISTS(SELECT 1 FROM game_receipts WHERE user_id=? AND request_id=? AND revision=? AND fingerprint=?)').bind(JSON.stringify(state),revision,now,user.userId,row.revision,user.userId,body.requestId,revision,fingerprint),
    ]);changed=batch[1].meta.changes===1;
   }
   if(changed)return json({state,revision,view:view(state),catchingUp:!result.complete,controlled:result.controlled});
  }
  return json({error:'存档正在同步，请稍后重试。'},409);
 }catch(error:any){return json({error:error?.message||'操作未完成，请重试。'},400);}
}
