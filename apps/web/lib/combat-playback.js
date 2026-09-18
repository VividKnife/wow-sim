import {applyPlaybackFrame} from '../../../packages/contracts/src/combat-playback.ts';

/** A local display cursor. No result or reward is ever sent back to the server. */
export function createCombatPlayback(recording, receivedAt, transitMs = 0) {
 if(!recording?.initial?.player||!Array.isArray(recording.frames)||!Number.isFinite(recording.serverNow)||recording.endsAt<recording.startsAt)throw new TypeError('Invalid combat recording');
 let current=recording.initial,index=0,lastClock=recording.startClock;
 const origin=recording.serverNow+Math.max(0,transitMs);
 return {
  read(now){
   const clock=Math.min(recording.endClock,Math.max(lastClock,recording.startClock+origin-recording.startsAt+Math.max(0,now-receivedAt)));
   while(index<recording.frames.length&&recording.frames[index].clock<=clock){current=applyPlaybackFrame(current,recording.frames[index++]);}
   lastClock=clock;
   return {snapshot:current,clock,ended:clock>=recording.endClock};
  },
 };
}

export function playbackPerspective(baseState, baseView, snapshot, endClock) {
 const {player,view}=snapshot;
 const actor=view.battleView?.actors?.find(unit=>unit.id===baseState.id);
 if(!actor)return {state:baseState,data:baseView};
 const self=player.id===baseState.id;
 const shared=Object.fromEntries(['clock','wallAt','combat','lastCombat','logs','logSequence'].filter(key=>key in player).map(key=>[key,player[key]]));
 const stats=actor.stats||baseView.stats;
 return {
  state:{...baseState,...(self?player:{}),...shared,...Object.fromEntries(['hp','mana','rage','energy','power','form','stance','cast'].filter(key=>key in actor).map(key=>[key,actor[key]])),id:baseState.id,playbackUntil:endClock},
  data:{...baseView,...view,stats,characterAttributes:actor.characterAttributes||baseView.characterAttributes,resource:view.battleView.units[baseState.id]?.resource,battleView:{...view.battleView,playerId:baseState.id}},
 };
}

export const combatPollDelay=(playback,watching)=>playback?2000:watching?200:1000;
