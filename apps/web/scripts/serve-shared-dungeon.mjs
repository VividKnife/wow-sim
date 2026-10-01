// Isolated UI fixture backed by real rule input, projection and checkpoint paths.
// Two humans + three persistent NPCs, root Alice and leader Bob. Manual test clock, isolated storage.
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
import {stats} from '../../../packages/game-domain/src/rules/character.js';
import {items,nameOf,icon} from '../../../packages/game-domain/src/rules/catalog.js';
import {enterDungeon} from '../../../packages/game-domain/src/rules/dungeon.js';
import {ensureNpcWorld} from '../../../packages/game-domain/src/rules/npc-world.js';
const app=fileURLToPath(new URL('../',import.meta.url)),store=residentStore(new MemoryStore());
const {admission,ids}=await residentPartyFixture(store,Date.now(),state=>{
 const actors=[state,...state.party];for(const actor of actors){actor.level=24;actor.location='deadmines';actor.hp=stats(actor).maxHp;actor.mana=stats(actor).maxMana;actor.settings.autoLoot=true;}
 ensureNpcWorld(state,3);state.party.push(...state.npcWorld.residents.slice(0,3).map(p=>structuredClone(p.unit)));
 state.sharedParty={leaderId:actors[1].id,participantIds:actors.map(c=>c.id)};enterDungeon(state);
 if(process.env.PREVIEW_RESCUE==='1'){state.classId=5;state.learned=[2006];state.hp=stats(state).maxHp;state.mana=stats(state).maxMana;actors[1].hp=0;for(const npc of state.party.slice(1))npc.learned=[];}

});
const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit);
let owner=await repository.acquire(admission.instanceId,'shared-dungeon-preview'),sequence=0;
const runtime=new ResidentInstance({...admission,ownerEpoch:owner.epoch}),cursors=[0,0];
async function commit(){const checkpoint=runtime.checkpoint();await repository.commit(owner,++sequence,checkpoint);owner.commitSequence=sequence;runtime.confirmCheckpoint(checkpoint.inputSequence,checkpoint.appliedInputSequence);}
await commit();let tail=Promise.resolve();
const renewal=setInterval(()=>{tail=tail.then(async()=>{owner=await repository.renew(owner);});},10000);
const server=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react(),{name:'shared-dungeon-preview',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(!req.url?.startsWith('/api/shared-dungeon'))return next();
 tail=tail.then(async()=>{res.setHeader('Content-Type','application/json');try{
  if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5220')throw new Error('Origin refused');
  const viewer=Number(new URL(req.url,'http://127.0.0.1').searchParams.get('viewer'));
  if(![0,1].includes(viewer))throw new Error('Unknown fixture character');
  if(req.method==='POST'){
   let bytes=0,body='';for await(const part of req){bytes+=part.length;if(bytes>4096)throw new Error('Request too large');body+=part;}
   const action=JSON.parse(body);if(!['dungeonNext','dungeonNavigate','dungeonPause','dungeonInteract','dungeonSkip','rest','resurrect','revive','settings','groupLoot','loot','previewAdvance'].includes(action.type))throw new Error('Unsupported fixture operation');
   if(action.type==='previewAdvance'){const target=runtime.wallAt+10000;while(!runtime.advance(target,10).complete){}await commit();}
   else{
   const receipt=runtime.input(viewer?'bob':'alice',{instanceId:admission.instanceId,actorId:ids[viewer],controllerGeneration:1,clientSequence:++cursors[viewer],requestId:crypto.randomUUID(),command:{kind:'action',action}});
   if(receipt.status!=='applied')throw new Error(receipt.reason||'Input not applied');await commit();}
  }else if(req.method!=='GET')throw new Error('Method refused');
  res.end(JSON.stringify({...runtime.presentation(viewer?'bob':'alice',ids[viewer],'full'),itemData:{[5201]:{...items[5201],name:nameOf('items',5201),icon:icon('items',5201)}}}));
 }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}});
 });}}],resolve:{alias:{'@':app}},optimizeDeps:{entries:['shared-dungeon.html']},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:5220,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log('Shared dungeon UI: http://127.0.0.1:5220/shared-dungeon.html');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{clearInterval(renewal);await tail;await server.close();await repository.release(owner);await store.close();process.exit(0);});
