// Read/write isolated in-memory test state only; no accounts or persistence.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {createMoltenCoreDemo} from '../../../packages/game-domain/src/molten-core-demo.ts';
import {enterGoldRaid,goldRaidAction} from '../../../packages/game-domain/src/rules/gold-raid.js';
import {buildGameResponse} from '../../../packages/game-domain/src/rules/server-response.js';
const app=fileURLToPath(new URL('../',import.meta.url)),repo=fileURLToPath(new URL('../../../',import.meta.url)),port=5197;
const state=createMoltenCoreDemo().state;enterGoldRaid(state);goldRaidAction(state,{type:'goldPublish'});
const api={name:'raid-preview',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url!=='/api/classic-raid-preview')return next();
 try{if(req.method==='POST'){let body='';for await(const part of req)body+=part;goldRaidAction(state,JSON.parse(body));}
 const snapshot=buildGameResponse(state,1).snapshot;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({state:snapshot.player,data:snapshot.view}));
 }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
});}};
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),api],resolve:{alias:{'@':app}},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null,fs:{allow:[repo]}}});
await server.listen();console.log(`Classic raid preview: http://127.0.0.1:${port}/classic-raid.html`);
