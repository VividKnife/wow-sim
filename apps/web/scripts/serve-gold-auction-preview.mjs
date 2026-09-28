// Disposable in-memory fixture using production auctions, valuation and item views.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {createMoltenCoreDemo} from '../../../packages/game-domain/src/molten-core-demo.ts';
import {enterGoldRaid,goldRaidAction,goldRaidView,openGoldAuctions,goldAuctionStep} from '../../../packages/game-domain/src/rules/gold-raid.js';
import {itemView} from '../../../packages/game-domain/src/rules/client-content.js';
const app=fileURLToPath(new URL('../',import.meta.url));
let state;
function reset(){
 state=createMoltenCoreDemo().state;state.party=[];state.growthPolicy='player';enterGoldRaid(state);
 for(const type of ['goldPublish','goldRecommend','goldLaunch'])goldRaidAction(state,{type});
 state.money=80000000;
 openGoldAuctions(state,[19147,18820,16800,18814].map((itemId,i)=>({id:`preview-${i}`,itemId,count:1,bossId:'lucifron',rare:false})));
 state.goldRaid.auctions[1].playerLimit=50000;
 state.goldRaid.auctions[2].quiet=2;state.goldRaid.auctions[2].endsAt=state.clock+4000;
}
reset();
const api={name:'gold-auction-preview',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(req.url!='/api/auction-preview')return next();
 void(async()=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  if(req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk;const action=JSON.parse(body);
   if(action.type==='previewReset')reset();
   else if(action.type==='previewStep'){state.clock+=4000;for(const lot of [...state.goldRaid.auctions])goldAuctionStep(state,lot.id);}
   else goldRaidAction(state,action);
  }
  res.end(JSON.stringify({state:{id:state.id,money:state.money,clock:state.clock},data:{goldRaid:goldRaidView(state),items:Object.fromEntries([19147,18820,16800,18814,17103].map(id=>[id,itemView(id)]))}}));
 })().catch(e=>{res.statusCode=400;res.end(JSON.stringify({error:e.message}));});
 });}};
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),api],resolve:{alias:{'@':app}},css:{postcss:{plugins:[tailwind()]}},server:{hmr:false,host:'127.0.0.1',port:5198,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log('Auction preview: http://127.0.0.1:5198/gold-auction.html');
