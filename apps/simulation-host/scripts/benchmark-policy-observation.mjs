import {cpus} from 'node:os';
import {performance} from 'node:perf_hooks';
import {observePolicyChanges} from '../../../packages/game-domain/src/rules/combat-policy.js';
import {combatMembers} from '../../../packages/game-domain/src/rules/combat-members.js';
import {stats} from '../../../packages/game-domain/src/rules/character.js';
import {referenceObservation,observationFixture} from '../../../packages/game-domain/test/support/policy-observation.mjs';

// Observer microbenchmark only: excludes combat execution, projection and IO.
// The old implementation is a test fixture, never a selectable runtime path.
const iterations=2000,rounds=7,report={node:process.version,cpu:cpus()[0]?.model,arch:process.arch,actors:40,enemies:8,iterations,rounds,scenarios:{}};
function measure(observe,burst){
 const s=observationFixture(),actors=combatMembers(s),maxHp=actors.map(c=>stats(c).maxHp);
 observe(s,actors);
 const start=performance.now(),cpu=process.cpuUsage();
 for(let i=0;i<iterations;i++){
  s.clock+=100;
  if(burst)for(let j=0;j<actors.length;j++)actors[j].hp=i%2?maxHp[j]:1;
  for(const slot of Object.values(s.combat.policy.slots))slot.dirty=null;
  observe(s,actors);
 }
 const used=process.cpuUsage(cpu);
 return {wallMs:performance.now()-start,cpuMs:(used.user+used.system)/1000};
}
for(const burst of [false,true]){
 const entries={reference:[],current:[]};
 for(let i=-2;i<rounds;i++)for(const key of i%2?['reference','current']:['current','reference']){
  const value=measure(key==='reference'?referenceObservation:observePolicyChanges,burst);
  if(i>=0)entries[key].push(value);
 }
 const results={};
 for(const [key,samples]of Object.entries(entries)){
  const sorted=samples.map(s=>s.wallMs).sort((a,b)=>a-b);
  results[key]={medianWallMs:sorted[Math.floor(rounds/2)],maxWallMs:sorted.at(-1),medianCpuMs:samples.map(s=>s.cpuMs).sort((a,b)=>a-b)[Math.floor(rounds/2)]};
 }
 report.scenarios[burst?'raid-health-threshold-burst':'unchanged-team']=results;
}
console.log(JSON.stringify(report,null,2));
