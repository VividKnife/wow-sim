// Real Worker latency while a 40-person raid catches up from a two-minute gap.
// In-memory fixture only; no accounts, database or production requests.
import {SimulationHost} from '../src/host.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';
const host=new SimulationHost(),state=localScenarios().raid;
state.wallAt=Date.now()-120000;
const samples=[];
try{
 await host.admit({instanceId:'latency',ownerEpoch:1,state,
  controllers:[{actorId:state.id,accountId:'bench',generation:1,canPause:true}],
  presence:{offlineLimitMs:3600000,accounts:[['bench',Date.now()]]}});
 for(let i=0;i<12;i++){
  const at=performance.now(),response=await host.presentation('latency','bench',state.id,'combat');
  samples.push({ms:performance.now()-at,clock:response.snapshot.player.clock});
 }
 const timings=samples.slice(2).map(s=>s.ms).sort((a,b)=>a-b);
 console.log(JSON.stringify({scenario:'40-person raid, 120-second backlog, sequential combat projections',
  samples,warmMedianMs:timings[Math.floor(timings.length/2)],warmMaxMs:timings.at(-1)},null,2));
}finally{await host.close();}
