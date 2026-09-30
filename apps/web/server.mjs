// Tiny static HTML + streaming API gateway. No authentication or React runtime.
import {createServer,request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {publicAssetPattern} from '../../packages/contracts/src/asset-paths.mjs';
const root=fileURLToPath(new URL('./',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.ogg':'audio/ogg','.woff2':'font/woff2'};
export async function createWebServer({dist=root+'dist',publicDir=root+'public',backend=process.env.GAME_SERVER_URL||'http://127.0.0.1:8788',trustProxy=process.env.NODE_ENV==='production'}={}){
 const metadata=JSON.parse(await readFile(resolve(dist,'__deployment.json'),'utf8'));
 const upstream=new URL(backend);if(!['http:','https:'].includes(upstream.protocol))throw new Error('Invalid GAME_SERVER_URL');
 const forward=upstream.protocol==='https:'?httpsRequest:httpRequest;
 const server=createServer((req,res)=>{void(async()=>{
  const url=new URL(req.url||'/','http://local');
  if(url.pathname.startsWith('/api/')){
   const headers={...req.headers,host:upstream.host};
   // Production ingress supplies XFF; a direct local server must not trust it.
   if(!trustProxy)headers['x-forwarded-for']=req.socket.remoteAddress;
   const outgoing=forward(new URL(url.pathname+url.search,upstream),{method:req.method,headers},incoming=>{
    res.writeHead(incoming.statusCode||502,incoming.headers);incoming.pipe(res);
    incoming.on('error',()=>res.destroy());
   });
   outgoing.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'cache-control':'no-store'});res.end('Game API unavailable');});
   req.on('aborted',()=>outgoing.destroy());res.on('close',()=>outgoing.destroy());req.pipe(outgoing);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  let path=url.pathname==='/'||url.pathname==='/login'?'/index.html':decodeURIComponent(url.pathname);
  const html=['/index.html','/model-viewer/index.html','/__deployment.json'].includes(path);
  // R2 deployments never relay or redirect static resource bytes through Zeabur.
  if(!html&&metadata.assetMode==='r2'){res.writeHead(404);res.end();return;}
  const base=!html&&(publicAssetPattern.test(path)||path.startsWith('/model-viewer/'))?publicDir:dist;
  const file=resolve(base,'.'+path),directory=resolve(base)+sep;
  if(!file.startsWith(directory)){res.writeHead(404);res.end();return;}
  let info;try{info=await stat(file);}catch{res.writeHead(404);res.end();return;}
  if(!info.isFile()){res.writeHead(404);res.end();return;}
  const compressed=path.endsWith('.json.gz');
  const headers={'content-type':compressed?'application/json':types[extname(file)]||'application/octet-stream',...(compressed?{'content-encoding':'gzip'}:{}),'cache-control':html?'no-store':'public, max-age=31536000, immutable','x-content-type-options':'nosniff'};
  let start=0,end=info.size-1,status=200;
  if(!html&&!compressed&&req.headers.range){
   const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if(range&&(range[1]||range[2])){
    start=range[1]?Number(range[1]):Math.max(0,info.size-Number(range[2]));
    end=range[1]?(range[2]?Math.min(Number(range[2]),info.size-1):info.size-1):info.size-1;
   }else start=info.size;
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'content-range':`bytes */${info.size}`});res.end();return;}
   status=206;headers['content-range']=`bytes ${start}-${end}/${info.size}`;
  }
  if(!html&&!compressed)headers['accept-ranges']='bytes';
  res.writeHead(status,{...headers,'content-length':Math.max(0,end-start+1)});
  if(req.method==='HEAD'||!info.size)res.end();else await pipeline(createReadStream(file,{start,end}),res);
 })().catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();});});
 // Browser WebSocket authentication is performed in game-api using the cookie.
 server.on('upgrade',(req,socket,head)=>{
  const route=new URL(req.url||'/','http://local');
  if(route.pathname!=='/api/events'){socket.destroy();return;}
  const outgoing=forward(new URL(route.pathname+route.search,upstream),{headers:{...req.headers,host:upstream.host}});
  outgoing.on('upgrade',(response,peer,upstreamHead)=>{
   socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);
   if(head.length)peer.write(head);if(upstreamHead.length)socket.write(upstreamHead);
   peer.pipe(socket);socket.pipe(peer);peer.on('error',()=>socket.destroy());socket.on('error',()=>peer.destroy());socket.on('close',()=>peer.destroy());
  });
  outgoing.on('response',response=>{response.resume();socket.end(`HTTP/1.1 ${response.statusCode} Unauthorized\r\nConnection: close\r\n\r\n`);});
  outgoing.on('error',()=>socket.destroy());outgoing.end();
 });
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=await createWebServer();server.listen(Number(process.env.PORT||8080),process.env.HOST||'0.0.0.0');
}
