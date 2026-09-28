// Isolated real-rule auction preview; never touches player saves.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {createGame,act,advance,view} from '../../../packages/game-domain/src/rules/engine.js';
import {addItem} from '../../../packages/game-domain/src/rules/character.js';
import {clientContent} from '../../../packages/game-domain/src/rules/client-content.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
const web=fileURLToPath(new URL('../',import.meta.url));
let state=createGame('拍卖行体验',283,0);state.location='stormwind';state.level=60;state.money=15000000;
addItem(state,2589,20);addItem(state,13468,1);addItem(state,14047,20);
const catalog=clientContent(),marketItems=Object.fromEntries(catalog.market.map(row=>[row.id,catalog.items[row.id]]));
const api={name:'auction-preview',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(req.url!=='/api/auction-preview')return next();
 void(async()=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  if(req.method==='POST'){
   let raw='';for await(const chunk of req)raw+=chunk;const command=JSON.parse(raw);
   state=command.type==='previewAdvance'?advance(state,state.wallAt+command.ms).state:act(state,command,state.wallAt);
  }
  const snapshot=projectClientSnapshot(state,view(state));
  res.end(JSON.stringify({state:snapshot.player,data:{...snapshot.view,items:marketItems,market:catalog.market,enchants:catalog.enchants}}));
 })().catch(error=>{res.statusCode=400;res.end(JSON.stringify({error:error.message}));});
 });}};
const server=await createServer({configFile:false,root:web+'test/browser',publicDir:web+'public',plugins:[react(),api],resolve:{alias:{'@':web}},css:{postcss:{plugins:[tailwind()]}},server:{hmr:false,host:'127.0.0.1',port:5197,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log('Auction preview: http://127.0.0.1:5197/auction-house.html');
