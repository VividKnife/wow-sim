// Keep deployments usable even when a new public tree has not been uploaded.
export function createReadinessCheck({fetcher=fetch,now=Date.now}={}) {
  const entries=new Map();
  return async function ready(origin,version) {
    const key=`${origin}/public/${version}/__release.json`;
    const existing=entries.get(key);
    if(existing && existing.expires>now())return existing.promise;
    const promise=(async()=>{
      try {
        const response=await fetcher(key,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(2000)});
        if(!response.ok)return false;
        const result=await response.json();
        return result.version===version && result.prefix===`public/${version}` && result.files>0;
      } catch { return false; }
    })();
    entries.set(key,{promise,expires:now()+60_000});
    return promise;
  };
}
