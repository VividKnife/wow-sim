/** Monotonic presentation time; it never resolves gameplay or invents damage. */
export function createBattleClock(clock,at){
 let sampleClock=clock,sampleAt=at,last=clock;
 return {
  observe(next,now,reset=false){
   if(reset){last=next;sampleClock=next;sampleAt=now;}
   else if(next!==sampleClock){sampleClock=next;sampleAt=now;}
  },
  read(now,live=true){
   if(!live)return sampleClock;
   last=Math.max(last,sampleClock+Math.min(1000,Math.max(0,now-sampleAt)));
   return last;
  },
 };
}
