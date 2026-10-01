import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {ResidentInstance} from '../../simulation-host/src/instance.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {inputConfirmation} from '../../../packages/protocol/src/simulation.ts';
const app=fileURLToPath(new URL('../',import.meta.url)),store=new MemoryStore(),repository=new SimulationRepository(store);
const state=localScenarios().dungeon,instanceId='input-receipt-preview';
const runtime=new ResidentInstance({instanceId,ownerEpoch:1,state,controllers:[{actorId:state.id,accountId:'preview',generation:1,canPause:true}]});
let owner=await repository.acquire(instanceId,'preview'),sequence=0,clientSequence=0,pendingAt=5000;
async function commit(){const checkpoint=runtime.checkpoint();await repository.commit(owner,++sequence,checkpoint);owner.commitSequence=sequence;runtime.confirmCheckpoint(checkpoint.inputSequence,checkpoint.appliedInputSequence);}
await commit();
const renewal=setInterval(async()=>{owner=await repository.renew(owner);},10000);
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),{name:'input-receipt-preview',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url!=='/api/input-receipts')return next();res.setHeader('Content-Type','application/json');
 try{
  if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5201')throw new Error('Origin refused');
  let commandReceipt;
  if(req.method==='POST'){
   let bytes=0,body='';for await(const part of req){bytes+=part.length;if(bytes>4096)throw new Error('Request too large');body+=part;}
   const {operation}=JSON.parse(body);
   if(operation==='queue'||operation==='order'){
    const command=operation==='queue'?{kind:'pause',encounterId:state.combat.id}:{kind:'action',action:{type:'combatCommand',order:'holdFire',encounterId:state.combat.id,enabled:true}};
    const n=++clientSequence,confirmation=inputConfirmation(command);pendingAt=runtime.wallAt+5000;
    commandReceipt=runtime.input('preview',{instanceId,actorId:state.id,controllerGeneration:1,clientSequence:n,requestId:`preview-${n}`,command},operation==='queue'?pendingAt:runtime.wallAt);
    if(confirmation==='durable')await commit();commandReceipt={...commandReceipt,durable:confirmation==='durable',confirmation};
   }else if(operation==='advance'){while(!runtime.advance(pendingAt,3).complete){}}
   else if(operation==='commit')await commit();else throw new Error('Unknown preview request');
  }else if(req.method!=='GET')throw new Error('Method refused');
  res.end(JSON.stringify({...runtime.presentation('preview',state.id,'combat'),commandReceipt,checkpointCount:sequence}));
 }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
 });}}],resolve:{alias:{'@':app}},optimizeDeps:{entries:['input-receipts.html']},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:5201,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log('Input receipt preview: http://127.0.0.1:5201/input-receipts.html');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{clearInterval(renewal);await server.close();await store.close();process.exit(0);});
