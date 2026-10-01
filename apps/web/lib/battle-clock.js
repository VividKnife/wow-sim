/** Presentation only: known timers may continue through a short packet gap.
 * Corrections change playback speed by at most 10%, never jump on packet arrival.
 * Damage, new actions and positions still come exclusively from the server. */
export const BATTLE_PREDICTION_MS=3000;
export function createBattleClock(clock,at){
 let sampleClock=clock,sampleAt=at,last=clock,lastAt=at;
 return {
  observe(next,now,reset=false){
   if(reset){last=next;sampleClock=next;sampleAt=lastAt=now;}
   else if(next!==sampleClock){sampleClock=next;sampleAt=now;}
  },
  read(now,live=true,maxPredictionMs=BATTLE_PREDICTION_MS){
   if(!live){lastAt=now;return sampleClock;}
   const prediction=Number.isFinite(maxPredictionMs)?Math.max(0,maxPredictionMs):BATTLE_PREDICTION_MS;
   const elapsed=Math.max(0,now-lastAt),target=sampleClock+Math.min(prediction,Math.max(0,now-sampleAt));
   const normal=last+elapsed,correction=Math.max(-elapsed*.1,Math.min(elapsed*.1,target-normal));
   last=Math.max(last,Math.min(sampleClock+prediction,normal+correction));lastAt=Math.max(lastAt,now);
   return last;
  },
 };
}
/** Canvas and HUD observe server samples, never each other's extrapolated time. */
export function createSceneClock(){
 let cursor,key,live;
 return {read(scene,now){
  const changed=!cursor||key!==scene.encounterId||live!==scene.live;
  if(!cursor)cursor=createBattleClock(scene.clock,scene.sampledAt??now);
  cursor.observe(scene.clock,scene.sampledAt??now,changed);
  key=scene.encounterId;live=scene.live;
  return Math.min(scene.endClock??Infinity,cursor.read(now,scene.live));
 }};
}
