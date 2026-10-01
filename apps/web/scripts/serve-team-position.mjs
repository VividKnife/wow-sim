import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {SimulationHost} from '../../simulation-host/src/host.ts';
import {positionScene} from '../../simulation-host/test/support/position-scene.ts';

const app=fileURLToPath(new URL('../',import.meta.url)),host=new SimulationHost(),state=positionScene(),instanceId='position-preview';
let sequence=0,until=0;
await host.admit({instanceId,ownerEpoch:1,state,controllers:[{actorId:state.id,accountId:'preview',generation:1,canPause:true}]},{realtime:false});
const renewal=setInterval(()=>host.renew(instanceId,30000).catch(error=>console.error(error.message)),10000);
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),{name:'team-position-owner',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url!=='/api/team-position')return next();
 res.setHeader('Content-Type','application/json');
 try{
  if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5199')throw new Error('Origin refused');
  if(req.method==='POST'){
   let bytes=0,body='';for await(const part of req){bytes+=part.length;if(bytes>16384)throw new Error('Request too large');body+=part;}
   const value=JSON.parse(body);
   if(value.action){if(value.action.type!=='combatCommand')throw new Error('Only combat commands allowed');const receipt=await host.input('preview',{instanceId,actorId:state.id,controllerGeneration:1,clientSequence:++sequence,requestId:`preview-${sequence}`,command:{kind:'action',action:value.action}});if(receipt.status!=='applied')throw new Error(receipt.reason||'Order rejected');}
   else if([1000,10000].includes(value.advanceMs)){until+=value.advanceMs;while(!(await host.advance(instanceId,until)).complete){}}
   else throw new Error('Unknown preview request');
  }else if(req.method!=='GET')throw new Error('Method refused');
  res.end(JSON.stringify(await host.presentation(instanceId,'preview',state.id,'combat')));
 }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
 });}}],resolve:{alias:{'@':app}},optimizeDeps:{entries:['team-position.html']},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:5199,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log('Team position preview: http://127.0.0.1:5199/team-position.html');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{clearInterval(renewal);await server.close();await host.close();process.exit(0);});
