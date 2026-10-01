import {MemoryStore} from '../../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../../packages/persistence/src/simulation.ts';
import {SimulationDirectory} from '../../src/directory.ts';
import {createSimulationServer} from '../../src/server.ts';

// Real process/HTTP/Worker boundary; this fixture deliberately uses MemoryStore.
// SQL recovery and production PostgreSQL startup are separate checks.
const store=new MemoryStore();
const directory=new SimulationDirectory(new SimulationRepository(store),{maxInstances:2,onError:()=>{}});
const service=createSimulationServer(directory,{token:process.env.SIMULATION_TOKEN!});
service.server.listen(0,'127.0.0.1',()=>{
 const address=service.server.address();
 if(!address||typeof address==='string')throw new Error('No test service address');
 process.send?.({port:address.port,pid:process.pid});
});
let stopping=false;
async function close(){if(stopping)return;stopping=true;try{await service.close();}finally{await store.close();process.disconnect?.();}}
process.once('SIGTERM',()=>void close());
process.once('SIGINT',()=>void close());
