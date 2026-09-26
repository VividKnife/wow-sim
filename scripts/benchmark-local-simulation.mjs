// No database or player saves; same rule engine and 50ms Worker cadence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {advance,advanceOwned} from '../packages/game-domain/src/rules/engine.js';
import {localScenarios} from '../packages/game-domain/test/support/local-scenarios.ts';
const hash=state=>createHash('sha256').update(JSON.stringify(state)).digest('hex');
console.log(JSON.stringify({node:process.version,cpu:cpus()[0].model,durationMs:15000,cadenceMs:50}));
for(const [scenario,initial] of Object.entries(localScenarios())){
 const run=fn=>{let state=structuredClone(initial);const start=performance.now();for(let at=50;at<=15000;at+=50)state=fn(state,at).state;return {ms:performance.now()-start,state};};
 run(advance);run(advanceOwned);
 const before=[],after=[];
 for(let i=0;i<3;i++){
  const a=run(advance),b=run(advanceOwned);assert.equal(hash(a.state),hash(b.state));before.push(a.ms);after.push(b.ms);
 }
 const mean=values=>Math.round(values.reduce((a,b)=>a+b)/values.length*100)/100;
 console.log(JSON.stringify({scenario,immutableMs:mean(before),ownedMs:mean(after),reductionPercent:Math.round((1-mean(after)/mean(before))*1000)/10,verified:true}));
}
