// Isolated UI fixture backed by real rule input, projection and checkpoint paths.
// It starts with a committed test drop; it is not a boss or production DB test.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {ResidentInstance} from '../../simulation-host/src/instance.ts';
import {residentPartyFixture} from '../../../packages/game-domain/test/support/resident-party.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {runtimeVersion} from '../../simulation-host/src/version.ts';
import {makeItem,stats} from '../../../packages/game-domain/src/rules/character.js';
import {items,nameOf,icon} from '../../../packages/game-domain/src/rules/catalog.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
const app=fileURLToPath(new URL('../',import.meta.url)),store=residentStore(new MemoryStore());
const {admission,ids}=await residentPartyFixture(store,Date.now(),state=>{
 const actors=[state,...state.party];for(const actor of actors){actor.level=20;actor.equipment={};actor.hp=stats(actor).maxHp;actor.mana=stats(actor).maxMana;}
 for(const actor of actors)actor.quests[387]={kills:{}};
 startCombat(state,[1706],true);state.combat.enemies[0].hp=0;combatTick(state);
 state.groupLoot={pending:Array.from({length:3},()=>{const item=makeItem(state,5201);return {id:item.uid,item,deadline:null,members:actors.map((actor,i)=>({id:actor.id,name:actor.name,npc:false,eligible:true,need:true,choice:null,roll:i?100:1,tie:0}))};}),history:[]};
});
const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit);
let owner=await repository.acquire(admission.instanceId,'shared-loot-preview'),sequence=0;
const runtime=new ResidentInstance({...admission,ownerEpoch:owner.epoch}),cursors=[0,0];
async function commit(){const checkpoint=runtime.checkpoint();await repository.commit(owner,++sequence,checkpoint);owner.commitSequence=sequence;runtime.confirmCheckpoint(checkpoint.inputSequence,checkpoint.appliedInputSequence);}
await commit();let tail=Promise.resolve();
const renewal=setInterval(()=>{tail=tail.then(async()=>{owner=await repository.renew(owner);});},10000);
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),{name:'shared-loot-preview',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(!req.url?.startsWith('/api/shared-loot'))return next();
 tail=tail.then(async()=>{res.setHeader('Content-Type','application/json');try{
  if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5219')throw new Error('Origin refused');
  const viewer=Number(new URL(req.url,'http://127.0.0.1').searchParams.get('viewer'));
  if(![0,1].includes(viewer))throw new Error('Unknown fixture character');
  if(req.method==='POST'){
   let bytes=0,body='';for await(const part of req){bytes+=part.length;if(bytes>4096)throw new Error('Request too large');body+=part;}
   const action=JSON.parse(body);if(!['groupLoot','loot'].includes(action.type))throw new Error('Unsupported fixture operation');
   const receipt=runtime.input(viewer?'bob':'alice',{instanceId:admission.instanceId,actorId:ids[viewer],controllerGeneration:1,clientSequence:++cursors[viewer],requestId:crypto.randomUUID(),command:{kind:'action',action}});
   if(receipt.status!=='applied')throw new Error(receipt.reason||'Input not applied');await commit();
  }else if(req.method!=='GET')throw new Error('Method refused');
  res.end(JSON.stringify({...runtime.presentation(viewer?'bob':'alice',ids[viewer],'full'),itemData:{[5201]:{...items[5201],name:nameOf('items',5201),icon:icon('items',5201)}}}));
 }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}});
 });}}],resolve:{alias:{'@':app}},optimizeDeps:{entries:['shared-loot.html']},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:5219,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log('Shared loot UI: http://127.0.0.1:5219/shared-loot.html');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{clearInterval(renewal);await tail;await server.close();await repository.release(owner);await store.close();process.exit(0);});
