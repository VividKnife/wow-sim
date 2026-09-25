// Isolated in-memory fixture; never accesses saved accounts.
import {fileURLToPath} from 'node:url';
const app=fileURLToPath(new URL('../',import.meta.url));
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {context,persistAssets} from '../../../packages/game-domain/src/context.ts';
import {receive} from '../../../packages/game-domain/src/rules/inventory.js';
import {view} from '../../../packages/game-domain/src/rules/engine.js';
const service=new GameService(new MemoryStore(),{contentVersion:'preview',now:()=>1000});
const hero=(await service.createAccount('preview',{name:'队长',classId:1,raceId:1},'create')).account.primaryCharacterId;
await service.store.transaction(async tx=>{const c=await tx.get('characters',hero);c.rules.level=18;c.rules.location='stormwind';await tx.put('characters',c);});
await service.command('preview',{type:'turnin',id:900001,requestId:'unlock'});
await service.command('preview',{type:'recruit',id:'mage',requestId:'mage'});
await service.command('preview',{type:'recruit',id:'priest',requestId:'priest'});
await service.store.transaction(async tx=>{const c=await tx.get('characters',hero),s=await context(tx,c,1000,false);for(const [id,n]of [[2589,17],[118,5],[159,7],[80,1]])receive(s,id,n);await persistAssets(tx,c,s,'fixture',service.id);});
const api={name:'transfer-fixture',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(!req.url?.startsWith('/fixture-api'))return next();
 try{let result;if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;result=await service.command('preview',JSON.parse(body));}else result=await service.snapshot('preview',new URL(req.url,'http://localhost').searchParams.get('characterId')||undefined);res.setHeader('content-type','application/json');res.end(JSON.stringify({...result,data:view(result.state)}));}catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}
});}};
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),api],resolve:{alias:{'@':app}},css:{postcss:{plugins:[tailwind()]}},server:{hmr:false,host:'127.0.0.1',port:5183,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log('http://127.0.0.1:5183/transfer.html');
