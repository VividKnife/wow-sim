// Bootstrap test data in the Worker, then use the production simulation handler.
import '../../lib/local-simulation.worker';
import {createMoltenCoreDemo,startMoltenCoreBoss} from '../../../../packages/game-domain/src/molten-core-demo';
import {createGame,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import {recruit,companionSkills} from '../../../../packages/game-domain/src/rules/party.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import manifest from '../../../../packages/game-data/manifest.json';
const scope=globalThis as unknown as {onmessage:(event:MessageEvent)=>void;postMessage:(value:unknown)=>void};
const simulate=scope.onmessage;
scope.onmessage=event=>{
 if(event.data.type!=='fixture'){simulate(event);return;}
 simulate({data:{type:'stop'}} as MessageEvent);
 const mode=event.data.mode;
 let state:any;
 if(mode==='raid')state=startMoltenCoreBoss(createMoltenCoreDemo(),'lucifron').state;
 else{
  state=createGame('性能测试法师',283,0,{classId:8,raceId:1});state.level=20;state.learned=companionSkills(state);
  state.hp=stats(state).maxHp;state.mana=stats(state).maxMana;
  if(mode==='dungeon')for(const [id,role] of [['warrior','tank'],['priest','healer'],['rogue','melee'],['warlock','ranged']])recruit(state,id,{role});
  state.location='goldshire';startCombat(state,mode==='dungeon'?[636,636,1729]:[299],mode==='dungeon');
  // Keep these small encounters alive throughout a warmed 12-second sample.
  for(const enemy of state.combat.enemies)enemy.hp=enemy.maxHp*=100;
 }
 scope.postMessage({type:'fixture',snapshot:projectClientSnapshot(state,view(state)),content:clientContent()});
 simulate({data:{type:'visibility',visible:true,watching:true}} as MessageEvent);
 simulate({data:{type:'start',generation:'fixture',contentVersion:manifest.contentVersion,state,serverNow:state.wallAt,deadline:state.wallAt+600000}} as MessageEvent);
};
