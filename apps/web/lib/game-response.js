import {assertGameResponse} from '../../../packages/contracts/src/game.ts';

const responseError=(message,status)=>Object.assign(new Error(message),{status});
export const responseMatchesSelection=(response,characterId,lastRevision)=>response.revision>=lastRevision&&(!characterId||response.snapshot?.player?.id===characterId);
export function mergeGameResponse(previous,incoming){
 if(incoming.scope!=='combat')return incoming;
 if(!previous?.snapshot||previous.contentVersion!==incoming.contentVersion||previous.snapshot.player.id!==incoming.snapshot?.player?.id)return null;
 return {...incoming,snapshot:{player:incoming.snapshot.player,view:{...previous.snapshot.view,...incoming.snapshot.view}}};
}
export async function readGameResponse(response){
 let data;
 try{data=await response.json();}catch{throw responseError('服务暂时无法响应，请稍后重试。',response.status);}
 if(!response.ok)throw responseError(response.status<500&&typeof data?.error==='string'?data.error:'服务暂时无法响应，请稍后重试。',response.status);
 try{assertGameResponse(data);}catch{throw responseError('存档响应不完整，请稍后重试。',response.status);}
 return data;
}
