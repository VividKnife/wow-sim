// Only public asset namespaces may leave the application origin. API routes,
// pages, deployment metadata, the model-viewer iframe/service worker and Next's
// worker/runtime always stay on Zeabur.
const publicPath = /^\/(?:battle|characters|creatures|demo|icons|interface|journal|maps|music|scenes|sounds)\/.+|^\/(?:favicon|file|globe|window)\.svg$/;
export function assetRedirect({url,method,origin,version}) {
  if(!origin || !/^[a-f0-9]{40}$/.test(version || '') || !['GET','HEAD'].includes(method)) return null;
  const request=new URL(url);
  if(!publicPath.test(request.pathname) || /%2f|%5c|%2e|\\/i.test(request.pathname)) return null;
  let target;
  try { target=new URL(origin); } catch { return null; }
  if(target.protocol!=='https:' || target.username || target.password || target.pathname!=='/' || target.search || target.hash || target.origin===request.origin) return null;
  target.pathname=`/public/${version}${request.pathname}`;
  target.search=request.search;
  return target.href;
}
