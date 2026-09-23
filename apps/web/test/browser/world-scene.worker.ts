import {createGame,act,advance,view,stats} from '../../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import {addItem} from '../../../../packages/game-domain/src/rules/character.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import {companionSkills} from '../../../../packages/game-domain/src/rules/party.js';
import type {Rules} from '../../../../packages/game-domain/src/model';

function fixture(){
 const s:Rules=createGame('林间旅人',283,0,{raceId:1,classId:8});
 s.location='goldshire';s.level=20;s.money=50000;s.riding={horse:true};s.mounts=[900020];
 s.learned=companionSkills(s);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;addItem(s,7509);return s;
}
let state=fixture(),mode='idle',lastAt=performance.now(),active=true;
function publish(requestId?:number,error=''){
 postMessage({snapshot:projectClientSnapshot(state,view(state)),mode,requestId,error});
}
function choose(next:string){
 const current=state,n=fixture();n.clock=current.clock;n.wallAt=current.wallAt;n.equipment=current.equipment;n.bag=current.bag;
 if(next==='fly'){
  n.location='stormwind';n.flightPoints=['stormwind','ironforge'];state=act(n,{type:'fly',to:'ironforge'},n.wallAt);
 }else if(next==='run'||next==='ride'){
  if(next==='run')n.mounts=[];else n.mounted=900020;
  state=act(n,{type:'travel',to:'logging'},n.wallAt);
 }else{
  if(next==='combat'){
   startCombat(n,[124,124],false);n.activity={type:'idle'};
   for(const enemy of n.combat.enemies){enemy.hp=enemy.maxHp=1600;enemy.minDamage=1;enemy.maxDamage=2;}
  }
  state=n;
 }
 mode=next;lastAt=performance.now();
}
self.onmessage=event=>{
 const message=event.data;
 try{
  if(message.type==='visibility'){active=message.active;lastAt=performance.now();return;}
  if(message.type==='mode')choose(message.mode);
  else if(message.type==='action')state=act(state,message.action,state.wallAt);
  else if(message.type==='equip'){
   const id=state.equipment[5]?.id===56?7509:56,item=state.bag.find((i:{id:number})=>i.id===id);
   if(item)state=act(state,{type:'equip',uid:item.uid},state.wallAt);
  }else if(message.type==='region'){
   const location=state.location==='ironforge'?'goldshire':'ironforge';choose('idle');state.location=location;
  }else if(message.type==='arrive'&&state.activity.flight){state=advance(state,state.wallAt+state.activity.endsAt-state.clock).state;mode='idle';}
  publish(message.requestId);
 }catch(error){publish(message.requestId,(error as Error).message);}
};
function tick(){
 const now=performance.now(),elapsed=Math.max(0,Math.round(now-lastAt));lastAt=now;
 if(active){
  try{
   // Idle needs no simulation. Real elapsed time keeps travel at normal speed,
   // even if projection or NPC simulation takes longer than the timer interval.
   if(state.combat||state.activity.type!=='idle'){
    state=advance(state,state.wallAt+elapsed).state;
    if(state.combat){state.hp=stats(state).maxHp;state.mana=stats(state).maxMana;}
    if(!state.combat&&state.activity.type==='idle')mode='idle';
    publish();
   }
  }catch(error){postMessage({error:(error as Error).message});}
 }
 setTimeout(tick,state.combat?100:500);
}
publish();lastAt=performance.now();setTimeout(tick,500);
