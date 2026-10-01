import {enterGoldRaid,goldRaidAction} from '../../../../packages/game-domain/src/rules/gold-raid.js';
import {createGame,act,advanceOwned,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import {createNpcMember,companionSkills} from '../../../../packages/game-domain/src/rules/party.js';
import {createMoltenCoreDemo,startMoltenCoreBoss} from '../../../../packages/game-domain/src/molten-core-demo';
import {beginMoltenCoreBattle} from '../../../../packages/game-domain/src/rules/molten-core-battle.js';
import {defaultRaidTactics,moltenCoreTick} from '../../../../packages/game-domain/src/rules/molten-core-encounter.js';
import {arenaView} from '../../../../packages/game-domain/src/rules/arena.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';

function fixture(mode:string):any{
 if(['ragnaros','onyxia'].includes(mode)){
  const s:any=createMoltenCoreDemo().state;
  s.party=s.party.slice(0,4);s.growthPolicy='player';enterGoldRaid(s,mode==='onyxia'?'onyxias-lair':'molten-core');for(const type of ['goldPublish','goldRecommend','goldLaunch'])goldRaidAction(s,{type});
  beginMoltenCoreBattle(s,mode,{...defaultRaidTactics});
  if(mode==='onyxia'){s.combat.enemies[0].hp*=.6;moltenCoreTick(s,[s,...s.party],()=>{});s.combat.raidEncounter.nextBreath=s.clock;moltenCoreTick(s,[s,...s.party],()=>{});}
  return s;
 }

 if(mode==='mc'){const s=startMoltenCoreBoss(createMoltenCoreDemo(),'lucifron').state;s.combat.ground='molten';return s;}
 let s:any=createGame('艾琳 · 霜语',283,0,{classId:8,raceId:1,gender:'female'});
 s.level=20;s.learned=companionSkills(s);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 if(mode!=='world')for(const [id,role] of [['warrior','tank'],['priest','healer'],['rogue','melee'],['warlock','ranged']])createNpcMember(s,id,{role});
 if(mode==='arena'){
  s=act(s,{type:'arenaPrepare',size:5,mapId:'four-pillars',opponentId:'casters',memberIds:[s.id,...s.party.map((c:any)=>c.id)]},0);
  return act(s,{type:'arenaStart',matchId:s.arena.id,revision:s.arena.planRevision,plan:s.arena.teams[0].plan},0);
 }
 s.location='goldshire';startCombat(s,mode==='world'?[299]:[636,636,1729],mode!=='world');s.combat.ground=mode==='world'?'grass':'cave';return s;
}

// This preview exercises the renderer, so rule work must not block its UI.
// No account, API or durable state is involved; production remains server-owned.
let state:any=null,mode='world',generation=0,paused=true,visible=true;
let timer:ReturnType<typeof setTimeout>|undefined;
function publish(requestId?:number){
 postMessage({type:'snapshot',generation,requestId,snapshot:projectClientSnapshot(state,view(state)),match:mode==='arena'?arenaView(state).match:null,paused});
}
function schedule(){
 clearTimeout(timer);
 if(paused||!visible||!state)return;
 timer=setTimeout(()=>{
  try{advanceOwned(state,state.wallAt+100);publish();schedule();}
  catch(error){paused=true;postMessage({type:'error',generation,error:String(error)});}
 },100);
}
onmessage=({data})=>{
 try{
  if(data.type==='fixture'){
   clearTimeout(timer);generation=data.generation;mode=data.mode;paused=data.paused;
   state=fixture(mode);postMessage({type:'content',content:clientContent()});publish();schedule();return;
  }
  if(data.type==='visibility'){visible=data.visible;schedule();return;}
  if(data.generation!==generation||!state)return;
  if(data.type==='pause'){paused=data.paused;publish();schedule();}
  if(data.type==='action'){state=act(state,data.action,state.wallAt);publish(data.requestId);}
 }catch(error){paused=true;clearTimeout(timer);postMessage({type:'error',generation,requestId:data.requestId,error:String(error)});}
};
