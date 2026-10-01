import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {PGlite} from '@electric-sql/pglite';
import {AccountStore} from '../../../game-server/src/account-store.ts';
import {createGameServer} from '../../../game-server/src/server.ts';
import {ResidentGameService} from '../../../game-server/src/resident-game-service.ts';
import {SimulationClient} from '../../../game-server/src/simulation-client.ts';
import {createSimulationServer} from '../../../simulation-host/src/server.ts';
import {SimulationDirectory} from '../../../simulation-host/src/directory.ts';
import {runtimeVersion} from '../../../simulation-host/src/version.ts';
import {MemoryStore} from '../../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../../packages/persistence/src/simulation.ts';
import {residentStore} from '../../../../packages/game-domain/src/resident-store.ts';
import {ResidentCharacters} from '../../../../packages/game-domain/src/resident-characters.ts';
import {GameService} from '../../../../packages/game-domain/src/service.ts';
import {CONTENT_VERSION} from '../../../../packages/game-domain/src/rules/client-content.js';
import {createWebServer} from '../../server.mjs';

// Isolated real owner/RPC/Worker path; SQL auth and in-memory game persistence.
// No user accounts, production database or browser-authoritative simulation.
export async function residentBrowserFixture(metadata){
 const db=new PGlite(),accounts=new AccountStore({query:async(text,values)=>text.includes('CREATE TABLE')?(await db.exec(text),{rows:[]}):db.query(text,values)});
 let game,web,simulation,directory;
 const close=async()=>{if(web)await new Promise(r=>web.close(r));await game?.close();if(simulation)await simulation.close();else await directory?.close();await db.close();};
 try{
  await accounts.initialize();
  const credentials={username:'browser_smoke',password:'browser-smoke-password'};
  const {user}=await accounts.register(credentials.username,credentials.password);
  const store=residentStore(new MemoryStore()),domain=new GameService(store,{contentVersion:CONTENT_VERSION,seed:()=>60325});
  const save=await domain.createSave(user.id,{name:'服务器法师',classId:8,raceId:1},'create-fixture');
  const characters=new ResidentCharacters(store,{version:runtimeVersion});
  directory=new SimulationDirectory(new SimulationRepository(store,Date.now,characters.commit),{characters,workers:1});
  const token=randomBytes(32).toString('base64url');
  simulation=createSimulationServer(directory,{token});simulation.server.listen(0,'127.0.0.1');await once(simulation.server,'listening');
  const client=new SimulationClient({url:`http://127.0.0.1:${simulation.server.address().port}`,token});
  const service=new ResidentGameService(domain,client);
  let snapshot=await service.snapshot(save.id);
  for(const [index,action] of [{type:'settings',autoLoot:true},{type:'hunt',id:299}].entries()){
   const owner=snapshot.response.execution;
   snapshot=await service.command(save.id,{...action,characterId:owner.actorId,requestId:`browser-fixture-${index}`,execution:{instanceId:owner.instanceId,controllerGeneration:owner.controllerGeneration,clientSequence:owner.clientSequence+1}});
  }
  const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const origin=`http://127.0.0.1:${port}`;
  game=createGameServer({service,accounts,appOrigin:origin,trustProxyHops:0,publicAssetBase:metadata.publicAssetBase});
  game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
  web=await createWebServer({backend:`http://127.0.0.1:${game.server.address().port}`,trustProxy:false});web.listen(port,'127.0.0.1');await once(web,'listening');
  return {origin,save,credentials,service,close};
 }catch(error){await close();throw error;}
}
