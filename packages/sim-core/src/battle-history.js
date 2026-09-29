// Count limits alone don't bound a raid report. Keep at most 1 MiB of UTF-8
// detail; the current lastCombat and journey summaries are not discarded.
export const BATTLE_HISTORY_BYTES=1024*1024;
const sizes=new WeakMap();
export function trimBattleHistory(history){
 let bytes=0,start=history.length;
 while(start>0&&history.length-start<20){
  const entry=history[start-1];
  let size=sizes.get(entry);
  if(size===undefined){size=new TextEncoder().encode(JSON.stringify(entry)).byteLength;sizes.set(entry,size);}
  if(bytes+size>BATTLE_HISTORY_BYTES)break;
  bytes+=size;start--;
 }
 if(start)history.splice(0,start);
 return history;
}
