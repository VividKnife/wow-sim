import {ResidentInstance} from '../../simulation-host/src/instance.ts';
import {addPeriodicEffect} from '../../../packages/game-domain/src/rules/simulation-events.js';
// Isolated, two-account playtest of the production gateway, Worker pool and
// transfer transaction. No production database or browser simulation is used.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {DungeonAdmissions} from '../../../packages/game-domain/src/dungeon-admissions.ts';
import {context,persistCharacter} from '../../../packages/game-domain/src/context.ts';
import {ensureNpcMatchSupply} from '../../../packages/game-domain/src/rules/npc-world.js';
import {combatRole} from '../../../packages/game-domain/src/rules/combat-roles.js';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {SimulationDirectory} from '../../simulation-host/src/directory.ts';
import {createSimulationServer} from '../../simulation-host/src/server.ts';
import {runtimeVersion} from '../../simulation-host/src/version.ts';
import {SimulationClient} from '../../game-server/src/simulation-client.ts';
import {ResidentGameService} from '../../game-server/src/resident-game-service.ts';
import {createGameServer} from '../../game-server/src/server.ts';
const app=fileURLToPath(new URL('../',import.meta.url)),store=residentStore(new MemoryStore());
const domain=new GameService(store,{contentVersion:'departure-playtest',seed:()=>283}),ids=[],npcIds=[];
for(const accountId of ['alice','bob']){
 const made=await domain.createAccount(accountId,{name:accountId,classId:8,raceId:1},'create');ids.push(made.state.id);
 await store.transaction(async tx=>{
  const row=await tx.get('characters',made.state.id),state=await context(tx,row,Date.now(),false);
  state.level=20;state.location='deadmines';
  if(accountId===(process.env.PREVIEW_NPC_OWNER??'alice')){
   ensureNpcMatchSupply(state);
   npcIds.push(...['tank','healer','dps'].map(role=>state.npcWorld.residents.find(p=>{const r=combatRole(p.unit);return (r==='tank'||r==='healer'?r:'dps')===role;}).id));
  }
  await persistCharacter(tx,row,state,state.wallAt,'fixture:'+accountId);
 });
}
const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit);
if(process.env.PREVIEW_NPC_EFFECTS==='1'){
 const accountId=process.env.PREVIEW_NPC_OWNER??'alice',admission=await characters.admission(accountId,ids[accountId==='bob'?1:0]);
 admission.state.party=admission.state.npcWorld.residents.filter(p=>npcIds.includes(p.id)).map(p=>structuredClone(p.unit));
 for(const npc of admission.state.party)addPeriodicEffect(admission.state,npc,'hots',{spell:139,name:'Renew',caster:npc.id,amount:10,next:admission.state.clock+1000,interval:1000,until:admission.state.clock+600000});
 const owner=await repository.acquire(admission.instanceId,'fixture');
  await repository.commit(owner,1,new ResidentInstance({...admission,ownerEpoch:owner.epoch}).checkpoint());
  owner.commitSequence=1;await repository.release(owner);
}
const directory=new SimulationDirectory(repository,{characters,dungeons:new DungeonAdmissions(store)}),token=crypto.randomUUID();
const host=createSimulationServer(directory,{token});host.server.listen(0,'127.0.0.1');await once(host.server,'listening');
const client=new SimulationClient({url:`http://127.0.0.1:${host.server.address().port}`,token}),service=new ResidentGameService(domain,client);
const social=(index,action)=>service.socialCommand(index?'bob':'alice',ids[index],{...action,requestId:crypto.randomUUID()});
await social(0,{type:'role',role:'dps'});await social(0,{type:'partyInvite',targetId:ids[1]});
const invitation=(await service.socialSnapshot('bob',ids[1])).incoming[0];
await social(1,{type:'respond',inviteId:invitation.id,accept:true});await social(1,{type:'role',role:'dps'});
for(const targetId of npcIds)await social(0,{type:'npcInvite',targetId});
const proposal=(await social(0,{type:'queue',dungeonId:'deadmines'})).proposal;
await social(0,{type:'proposal',proposalId:proposal.id,accept:true});await social(1,{type:'proposal',proposalId:proposal.id,accept:true});
const webs=[],gateways=[];
for(const [index,accountId]of ['alice','bob'].entries()){
 const origin=`http://127.0.0.1:${5225+index}`,session=crypto.randomUUID();
 const accounts={session:async t=>t===session?{id:accountId,username:accountId}:null,logout:async()=>{},login:async()=>{throw Error('Fixture only');},register:async()=>{throw Error('Fixture only');}};
 const api=createGameServer({service,accounts,appOrigin:origin});api.server.listen(0,'127.0.0.1');await once(api.server,'listening');gateways.push(api);
 const proxy={'/api':{target:`http://127.0.0.1:${api.server.address().port}`,ws:true,headers:{cookie:'wow_session='+session}}};
 const web=await createServer({configFile:false,root:app+'test/browser',publicDir:app+'public',plugins:[react()],resolve:{alias:{'@':app}},
  optimizeDeps:{entries:['live-combat.html']},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:5225+index,strictPort:true,proxy,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
 await web.listen();webs.push(web);console.log(`${accountId}: ${origin}/live-combat.html`);
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{
 await Promise.all(webs.map(w=>w.close()));await Promise.all(gateways.map(g=>g.close()));await host.close();await store.close();process.exit(0);
});
