// Isolated in-memory saves. Real domain service + browser Worker + production UI.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {buildGameResponse} from '../../../packages/game-domain/src/rules/server-response.js';
import {clientContent,CONTENT_VERSION} from '../../../packages/game-domain/src/rules/client-content.js';
import {contentPack} from '../../../packages/game-domain/src/rules/content-packs.js';
const app=fileURLToPath(new URL('../',import.meta.url));
const store=new MemoryStore(),service=new GameService(store,{contentVersion:CONTENT_VERSION,seed:()=>60325});
const raid=await service.createSave('preview',{name:'本地远征',classId:8,raceId:1,raidReady:true},'raid');
await service.command(raid.id,{type:'enterDungeon',contentId:'molten-core',requestId:'enter'});
await service.command(raid.id,{type:'raidStart',bossId:'lucifron',requestId:'start'});
const solo=await service.createSave('preview',{name:'本地法师',classId:8,raceId:1},'solo');
await service.command(solo.id,{type:'hunt',id:299,requestId:'hunt'});
await service.createSave('preview',{name:'竞技队长',classId:8,raceId:1,raidReady:true},'arena');
let claims=0,checkpoints=0,commands=0,workerCommits=0;
const work=setInterval(async()=>{const result=await service.work();workerCommits+=result.activities+result.instances;},1000);
const api={name:'local-simulation-preview',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(!req.url?.startsWith('/api/'))return next();
 void(async()=>{
  const url=new URL(req.url,'http://localhost'),accountId=url.searchParams.get('saveId')||raid.id;
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  let data;
  if(url.pathname==='/api/game/content')data=contentPack(clientContent(),url.searchParams);
  else if(url.pathname==='/api/metrics')data={claims,checkpoints,commands,workerCommits};
  else if(url.pathname==='/api/game/local'){
   let body='';for await(const chunk of req)body+=chunk;
   const input=JSON.parse(body);data=await service.localSimulation(accountId,input);
   if(input.type==='claim')claims++;else if(input.type==='checkpoint')checkpoints++;
   if(input.type==='checkpoint'&&process.env.PREVIEW_CHECKPOINT_DELAY_MS)await new Promise(resolve=>setTimeout(resolve,Number(process.env.PREVIEW_CHECKPOINT_DELAY_MS)));
  } else if(url.pathname==='/api/game'){
   let snapshot;
   if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;snapshot=await service.command(accountId,JSON.parse(body));commands++;}
   else snapshot=await service.snapshot(accountId,url.searchParams.get('characterId')||undefined,true);
   const {state,revision,...extra}=snapshot;data=buildGameResponse(state,revision,extra);
  } else {res.statusCode=404;data={error:'未实现的预览接口'};}
  res.end(JSON.stringify(data));
 })().catch(error=>{console.warn('Local simulation preview request failed:',req.method,req.url,error.message);res.statusCode=error.status||500;res.end(JSON.stringify({error:error.message,code:error.code}));});
 });}};
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),api],resolve:{alias:{'@':app}},css:{postcss:{plugins:[tailwind()]}},server:{hmr:false,host:'127.0.0.1',port:Number(process.env.PREVIEW_PORT||5192),strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();
console.log('Local simulation: http://127.0.0.1:5192/local-simulation.html?saveId=preview:raid');
console.log('Arena: http://127.0.0.1:5192/local-simulation.html?saveId=preview:arena');
console.log('Solo: http://127.0.0.1:5192/local-simulation.html?saveId=preview:solo');
server.httpServer.once('close',()=>clearInterval(work));
