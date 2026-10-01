import {pathToFileURL} from 'node:url';
import {databasePool} from '../../../packages/persistence/src/pool.ts';
import {PostgresStore} from '../../../packages/persistence/src/postgres.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {SimulationDirectory} from './directory.ts';
import {createSimulationServer} from './server.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {DungeonAdmissions} from '../../../packages/game-domain/src/dungeon-admissions.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {runtimeVersion} from './version.ts';
import {experienceMultiplier} from '../../../packages/game-domain/src/rules/experience.js';

export async function startSimulationHost(environment:NodeJS.ProcessEnv=process.env){
 const token=environment.SIMULATION_TOKEN;
 if(!token||!/^[A-Za-z0-9_-]{32,128}$/.test(token))throw new Error('SIMULATION_TOKEN must contain 32–128 URL-safe characters');
 if(!environment.DATABASE_URL)throw new Error('DATABASE_URL is required');
 const port=Number(environment.SIMULATION_PORT??8790);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid SIMULATION_PORT');
 const pool=await databasePool({connectionString:environment.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:5000,max:8},environment.GAME_DATABASE_SCHEMA);
 const store=new PostgresStore(pool);
 let directory:SimulationDirectory|undefined;
 try{
  await store.initialize();
  const guarded=residentStore(store),characters=new ResidentCharacters(guarded,{version:runtimeVersion,xpMultiplier:experienceMultiplier(environment.GAME_XP_MULTIPLIER),offlineLimitMs:environment.GAME_OFFLINE_LIMIT_MS===undefined?undefined:Number(environment.GAME_OFFLINE_LIMIT_MS)});
  directory=new SimulationDirectory(new SimulationRepository(guarded,Date.now,characters.commit),{
   characters,dungeons:new DungeonAdmissions(guarded),checkpointMs:Number(environment.SIMULATION_CHECKPOINT_MS??5000),idleRetireMs:Number(environment.SIMULATION_IDLE_RETIRE_MS??60000),
   workers:Number(environment.SIMULATION_WORKERS??1),maxInstances:Number(environment.SIMULATION_MAX_INSTANCES??128),
  });
  const service=createSimulationServer(directory,{token});
  // Local private service by default; expose across machines only through a
  // separately configured authenticated TLS transport.
  await new Promise<void>((resolve,reject)=>{
   service.server.once('error',reject);
   service.server.listen(port,'127.0.0.1',()=>{service.server.off('error',reject);resolve();});
  });
  return {port,async close(){try{await service.close();}finally{await store.close();}}};
 }catch(error){await directory?.close().catch(()=>{});await store.close();throw error;}
}

export async function main(){
 const service=await startSimulationHost();
 console.log(`Simulation host listening on http://127.0.0.1:${service.port}`);
 process.send?.({type:'ready',service:'simulation'});
 let closing=false;
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
  if(closing)return;closing=true;
  void service.close().then(()=>process.disconnect?.()).catch(error=>{console.error(error);process.exitCode=1;process.disconnect?.();});
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{console.error(error);process.exitCode=1;});
}
