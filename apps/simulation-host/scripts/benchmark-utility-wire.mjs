import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {ResidentInstance} from '../src/instance.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';
import {applyGameEvent,createDeltaEvent} from '../../../packages/contracts/src/events.ts';

// Replay identical real rule projections through both wire representations.
// The expanded representation is measurement-only, never a runtime fallback.
function expanded(response){
 const copy=structuredClone(response),view=copy.snapshot.view,clock=copy.snapshot.player.clock;
 if(view.skillUseReadyAt){
  for(const uses of Object.values(view.skillUsesByTarget))for(const [spell,use] of Object.entries(uses)){
   if(Object.hasOwn(view.skillUseReadyAt,spell))use.remaining=Math.max(0,view.skillUseReadyAt[spell]-clock);
  }
  delete view.skillUseReadyAt;
 }
 return copy;
}
const baselineRef='0f7884aa';
const oldSource=execFileSync('git',['show',`${baselineRef}:packages/contracts/src/events.ts`],{encoding:'utf8'}).replace("'./game.ts'",JSON.stringify(new URL('../../../packages/contracts/src/game.ts',import.meta.url).href));
const oldEvents=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(oldSource)).toString('base64'));
const state=localScenarios().raid;
const room=new ResidentInstance({instanceId:'utility-wire-benchmark',ownerEpoch:1,state,controllers:[{actorId:state.id,accountId:'preview',generation:1,canPause:true}]});
const first=room.presentation('preview',state.id),event=response=>({type:'snapshot',sequence:response.execution.streamSequence,...response});
const lanes=[{name:'baseline',expand:true,diff:oldEvents.createDeltaEvent,baseline:event(expanded(first)),bytes:0,operations:0},{name:'sharedDeadline',expand:false,diff:oldEvents.createDeltaEvent,baseline:event(first),bytes:0,operations:0},{name:'sharedDeadlineAndArraySplice',expand:false,diff:createDeltaEvent,baseline:event(first),bytes:0,operations:0}];
const start=room.wallAt;
for(let step=1;step<=100;step++){
 assert.equal(room.advance(start+step*100,10000).complete,true);
 const scope=step%10?'combat':'full',response=room.presentation('preview',state.id,scope);
 for(const lane of lanes){
  let next=event(lane.expand?expanded(response):response);
  if(scope==='combat')next={...next,snapshot:{...next.snapshot,view:{...lane.baseline.snapshot.view,...next.snapshot.view}}};
  const delta=lane.diff(lane.baseline,next),wire=JSON.stringify(delta);
  assert.deepEqual(applyGameEvent(lane.baseline,JSON.parse(wire)),next);
  lane.bytes+=Buffer.byteLength(wire);lane.operations+=delta.operations.length;lane.baseline=next;
 }
}
console.log(JSON.stringify({node:process.version,scenario:'40-person raid, 10 simulated seconds, 100ms combat and 1s full projections',baselineRef,roundTrips:300,results:lanes.map(({name,bytes,operations})=>({name,bytes,operations})),byteReduction:1-lanes[2].bytes/lanes[0].bytes,notes:'Same rule states and publication times. No PostgreSQL, worker transport, websocket framing or compression; not server capacity.'},null,2));
