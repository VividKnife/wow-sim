// Only immutable/read-only content belongs here. Never retry game mutations.
export async function fetchContentJson(url,{
 fetchImpl=globalThis.fetch,timeoutMs=30000,retryDelayMs=500,
 sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
}={}){
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await fetchImpl(url,{cache:'force-cache',signal:AbortSignal.timeout(timeoutMs)});
   if(!response.ok){
    const retryable=[408,429,502,503,504].includes(response.status);
    throw Object.assign(new Error(response.status===409?'游戏资料已更新，请刷新页面。':'冒险资料加载失败，请稍后重试。'),{status:response.status,retryable});
   }
   // Keep the deadline active through body download, not just response headers.
   return await response.json();
  }catch(error){
   const retryable=error?.retryable||['TypeError','AbortError','TimeoutError'].includes(error?.name);
   if(!retryable)throw error;
   if(attempt===0){await sleep(retryDelayMs);continue;}
   throw Object.assign(new Error('冒险资料下载超时或网络暂时不可用，请稍后重试。'),{code:'CONTENT_NETWORK',cause:error});
  }
 }
}
