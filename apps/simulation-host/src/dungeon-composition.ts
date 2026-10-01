import {composeRoomBoundary} from '../../../packages/game-domain/src/room-composition.ts';
import {dungeonEntryReason,enterDungeon} from '../../../packages/game-domain/src/rules/dungeon.js';
import {ResidentInstance,type InstanceCheckpoint} from './instance.ts';
import {runtimeVersion} from './version.ts';
import {dungeonDefinition} from '../../../packages/game-domain/src/rules/dungeon-registry.js';
import {npcRunStarted} from '../../../packages/game-domain/src/rules/npc-world.js';
import type {DungeonRoster} from '../../../packages/game-domain/src/dungeon-roster.ts';

/** Pure, detached composition inside the existing transfer transaction. Source
 * checkpoints must be the sealed boundaries, not gateway state or DB profiles.
 * Group consent and membership are checked by the caller before this boundary. */
export function composeDungeonCheckpoint(sources: readonly InstanceCheckpoint[], options: {
  instanceId:string; ownerEpoch:number; primaryActorId:string; roster:DungeonRoster;selectMatchedNpcs?:boolean;
}): InstanceCheckpoint {
  if (sources.length<1 || sources.length>5 || new Set(sources.map(s=>s.instanceId)).size!==sources.length ||
    sources.some(s=>s.instanceId===options.instanceId)) throw new Error('Invalid dungeon transfer sources');
  const ordered=[...sources].sort((a,b)=>a.state.id===options.primaryActorId?-1:b.state.id===options.primaryActorId?1:a.state.id<b.state.id?-1:1);
  const existing=!!ordered[0].state.dungeon;
  if(existing&&ordered.length<2)throw new Error('No new dungeon arrivals');
  for (const source of ordered) {
    ResidentInstance.restore(source,source.ownerEpoch);
    if (source.inputSequence!==source.appliedInputSequence || source.recentInputs.some(row=>row.receipt.status==='queued'))
      throw new Error('Apply accepted inputs before entering a shared dungeon');
    if (!(existing&&source===ordered[0])&&(source.controllers.length!==1 || source.controllers[0].actorId!==source.state.id))
      throw new Error('Dungeon arrivals require personal source instances');
    if (!(existing&&source===ordered[0])&&source.state.dungeonSaves?.[options.roster.dungeonId]) throw new Error('Reset saved personal dungeon progress before creating a shared run');
  }
  const state=composeRoomBoundary(ordered.map(s=>s.state),options.primaryActorId,options.roster,options.selectMatchedNpcs);
  const actors=[state,...state.party];
  const incoming=existing?ordered.slice(1):ordered;
  for (const source of incoming) {
    const actor=actors.find(c=>c.id===source.state.id)!;
    const reason=dungeonEntryReason({...actor,dungeon:undefined,wallAt:state.wallAt,party:actors.filter(c=>c!==actor),sharedParty:state.sharedParty,dungeonRoster:state.dungeonRoster},options.roster.dungeonId);
    if(reason)throw new Error(reason);
  }
  const solo=options.roster.members.filter(m=>!m.npc).length===1;
  const controllers=ordered.flatMap(source=>source.controllers.map(controller=>({...controller,generation:controller.generation+1,canPause:solo&&controller.canPause})));
  const policies=ordered.map(s=>s.presence);
  if(policies.some(p=>!p)||policies.some(p=>p!.offlineLimitMs!==policies[0]!.offlineLimitMs))
    throw new Error('Dungeon sources require the same presence policy');
  const accounts=new Map<string,number>();
  for(const p of policies)for(const [account,at]of p!.accounts)accounts.set(account,Math.max(accounts.get(account)??0,at));
  const presence={offlineLimitMs:policies[0]!.offlineLimitMs,accounts:[...accounts]};
  let inputSequence=0;
  const recentInputs:InstanceCheckpoint['recentInputs']=[],cursors:InstanceCheckpoint['cursors']=[],requests=new Set<string>();
  for(const source of ordered){
    cursors.push(...source.cursors.map(([actor,sequence]):[string,number]=>[actor,sequence]));
    for(const row of source.recentInputs){
      const controller=controllers.find(c=>c.actorId===row.input.actorId)!;
      const key=JSON.stringify([row.accountId,row.input.requestId]);
      if(requests.has(key))throw new Error('Conflicting source request identity');requests.add(key);
      recentInputs.push({accountId:row.accountId,input:{...structuredClone(row.input),instanceId:options.instanceId,controllerGeneration:controller.generation},
        receipt:{...row.receipt,inputSequence:row.receipt.inputSequence+inputSequence,simTime:row.receipt.simTime!+state.clock-source.state.clock}});
    }
    inputSequence+=source.inputSequence;
    if(!Number.isSafeInteger(inputSequence))throw new Error('Input sequence exhausted');
  }
  if(!existing)enterDungeon(state,options.roster.dungeonId);
  else npcRunStarted(state,state.party.filter((c:{npcPlayer?:boolean;id:string})=>c.npcPlayer&&!ordered[0].state.party.some((old:{id:string})=>old.id===c.id)).map((c:{id:string})=>c.id));
  // Human entrance locations were checked above. NPCs join the selected
  // instance directly; their old world location is not a travel requirement.
  for(const actor of actors)if(actor.npcPlayer)actor.location=dungeonDefinition(options.roster.dungeonId).entrance;
  for(const source of existing?incoming:incoming.slice(1)){
    const actor=state.party.find((c:{id:string})=>c.id===source.state.id)!;
    actor.dungeonEntries=[...(actor.dungeonEntries||[]).filter((at:number)=>at>state.wallAt-3600000),state.wallAt];
  }
  const checkpoint:InstanceCheckpoint={version:1,...runtimeVersion,instanceId:options.instanceId,ownerEpoch:options.ownerEpoch,
    state,controllers,presence,inputSequence,appliedInputSequence:inputSequence,cursors,recentInputs:recentInputs.slice(-256)};
  // Re-adoption verifies controller identities, input cursors and bounded
  // receipt storage before the surrounding transaction can commit claims.
  return ResidentInstance.restore(checkpoint,options.ownerEpoch).checkpoint();
}
