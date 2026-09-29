import {isContentPending,resolveContent} from '../../../packages/game-domain/src/rules/runtime-content.js';
import type {CombatPolicyRequest} from '../../../packages/contracts/src/combat-policy.ts';
import {selectRacialReaction} from '../../../packages/game-domain/src/rules/class-mechanics.js';
import {CombatStreamReceiver} from '../../../packages/sim-core/src/combat-stream.js';
import {selectCombatPolicy} from '../../../packages/game-domain/src/rules/combat.js';
import {combatMembers} from '../../../packages/game-domain/src/rules/combat-members.js';

let port:MessagePort|null=null;
const stream=new CombatStreamReceiver();
self.onmessage=({data})=>{
 if(data.type!=='connect')return;
 port?.close();port=data.port;stream.reset();
 port!.onmessage=({data})=>{
  if(data.type==='reset'){stream.reset();return;}
  if(data.type!=='observation')return;
  const started=performance.now();
  try{
   const decoded=stream.apply(data.packet);
   if(decoded.status==='baseline-required'){port!.postMessage({type:'baseline',generation:data.generation});return;}
   if(decoded.status!=='applied')return;
   const s=decoded.snapshot,actors=combatMembers(s);
   const results=data.requests.flatMap((request:CombatPolicyRequest)=>{
    const c=actors.find((actor:any)=>actor.id===request.actorId);
    const intent=c?selectCombatPolicy(s,c,request):null,racial=c?selectRacialReaction(s,c):null;
    return racial?[{...request,intent:racial},{...request,sequence:request.sequence+1,intent}]:[{...request,intent}];
   });
   const buffer=data.packet.buffer;
   port!.postMessage({type:'intents',generation:data.generation,sequence:data.packet.sequence,buffer,results,computeMs:performance.now()-started},buffer?[buffer]:[]);
  }catch(error){if(isContentPending(error)){const current=port;resolveContent(error).then(()=>{if(current!==port)return;stream.reset();port!.postMessage({type:'baseline',generation:data.generation});port!.postMessage({type:'ready'});}).catch(()=>{});}
  port!.postMessage({type:'policyError',generation:data.generation,error:String(error)});}
 };
 port!.start();port!.postMessage({type:'ready'});
};
