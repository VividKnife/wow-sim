import {assertGameResponse} from '../../../packages/contracts/src/game.ts';

const responseError=(message,status,code)=>Object.assign(new Error(message),{status,code});
export function syncErrorMessage(error){
 if(!error)return '';
 if(error.status===401)return '登录已过期，请重新登录。';
 if(error.code==='CONTENT_VERSION')return error.message;
 if(error.code==='DATABASE_BUSY')return '游戏状态正在更新，正在稍后重试。';
 if(['AbortError','TimeoutError'].includes(error.name))return '同步请求超时，正在降低频率重试。';
 if(error.status>=500)return `游戏服务暂时无法响应（${error.status}），正在重试。`;
 if(error.status>=400)return error.message;
 return error.status===200?error.message:'暂时无法连接游戏服务，正在重试。';
}
export const responseMatchesSelection=(response,characterId,lastRevision)=>response.revision>=lastRevision&&(!characterId||response.snapshot?.player?.id===characterId);
export function mergeGameResponse(previous,incoming){
 if(incoming.scope!=='combat')return incoming;
 if(!previous?.snapshot||previous.contentVersion!==incoming.contentVersion||previous.snapshot.player.id!==incoming.snapshot?.player?.id)return null;
 return {...incoming,snapshot:{player:incoming.snapshot.player,view:{...previous.snapshot.view,...incoming.snapshot.view}}};
}
export async function readGameResponse(response){
 let data;
 try{data=await response.json();}catch{throw responseError('服务暂时无法响应，请稍后重试。',response.status);}
 if(!response.ok)throw responseError(response.status<500&&typeof data?.error==='string'?data.error:'服务暂时无法响应，请稍后重试。',response.status,typeof data?.code==='string'?data.code:undefined);
 try{assertGameResponse(data);}catch{throw responseError('存档响应不完整，请稍后重试。',response.status);}
 return data;
}
